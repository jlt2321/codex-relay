import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/debug-log.js", () => ({
  relayDebugLog: vi.fn<(event: string, fields?: Record<string, unknown>) => void>(),
}));

import { CodexAppServerClient } from "../src/app-server.js";
import { relayDebugLog } from "../src/debug-log.js";

type JsonRpcRequest = {
  id: number;
  method: string;
  params?: unknown;
};

type SharedSocketServer = {
  close: () => Promise<void>;
  connections: WebSocket[];
  failNextInitialize: () => void;
  requests: JsonRpcRequest[];
};

describe("CodexAppServerClient transports", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("attaches to an existing Unix socket and reconnects without owning the server", async () => {
    const codexHome = await mkdtemp("/tmp/codex-relay-shared-");
    const socketPath = join(codexHome, "app-server-control", "app-server-control.sock");
    const server = await startSharedSocketServer(socketPath);
    vi.stubEnv("CODEX_HOME", codexHome);
    vi.stubEnv("CODEX_RELAY_APP_SERVER_MODE", "socket");
    const startChildServer = vi.fn<typeof createFakeStdioAppServer>(createFakeStdioAppServer);
    const client = new CodexAppServerClient({ startChildServer });

    try {
      await client.initialize();
      await expect(client.listModels()).resolves.toEqual([]);
      expect(server.connections).toHaveLength(1);
      expect(startChildServer).not.toHaveBeenCalled();
      expect(relayDebugLog).toHaveBeenCalledWith("app_server.shared_socket.attached", {
        socketPath,
      });

      await client.resumeThread({
        threadId: "shared-thread",
        persistExtendedHistory: true,
      });
      expect(client.isThreadSubscribed("shared-thread")).toBe(true);

      server.failNextInitialize();
      server.connections[0]?.terminate();
      await vi.waitFor(() => expect(client.isThreadSubscribed("shared-thread")).toBe(false));

      await vi.waitFor(() => expect(server.connections).toHaveLength(3), { timeout: 5_000 });
      await expect(client.listModels()).resolves.toEqual([]);
      expect(server.requests.filter((request) => request.method === "initialize")).toHaveLength(3);
      expect(startChildServer).not.toHaveBeenCalled();
      expect(relayDebugLog).toHaveBeenCalledWith("app_server.shared_socket.reconnected", {
        socketPath,
      });

      client.close();
      const secondClient = new CodexAppServerClient({ startChildServer });
      try {
        await secondClient.initialize();
        await expect(secondClient.listModels()).resolves.toEqual([]);
      } finally {
        secondClient.close();
      }
    } finally {
      client.close();
      await server.close();
      await rm(codexHome, { force: true, recursive: true });
    }
  });

  it("falls back to the private stdio app-server when the Unix socket is unavailable", async () => {
    const codexHome = await mkdtemp("/tmp/codex-relay-missing-");
    vi.stubEnv("CODEX_HOME", codexHome);
    vi.stubEnv("CODEX_RELAY_APP_SERVER_MODE", "socket");
    const startChildServer = vi.fn<typeof createFakeStdioAppServer>(createFakeStdioAppServer);
    const client = new CodexAppServerClient({ startChildServer });

    try {
      await client.initialize();
      await expect(client.listModels()).resolves.toEqual([]);
      expect(startChildServer).toHaveBeenCalledTimes(1);
      expect(relayDebugLog).toHaveBeenCalledWith(
        "app_server.shared_socket.fallback",
        expect.objectContaining({
          socketPath: join(codexHome, "app-server-control", "app-server-control.sock"),
        }),
      );
    } finally {
      client.close();
      await rm(codexHome, { force: true, recursive: true });
    }
  });

  it("falls back to private stdio when the shared socket initialize handshake fails", async () => {
    const codexHome = await mkdtemp("/tmp/codex-relay-handshake-");
    const socketPath = join(codexHome, "app-server-control", "app-server-control.sock");
    const server = await startSharedSocketServer(socketPath);
    server.failNextInitialize();
    vi.stubEnv("CODEX_HOME", codexHome);
    vi.stubEnv("CODEX_RELAY_APP_SERVER_MODE", "socket");
    const startChildServer = vi.fn<typeof createFakeStdioAppServer>(createFakeStdioAppServer);
    const client = new CodexAppServerClient({ startChildServer });

    try {
      await client.initialize();
      await expect(client.listModels()).resolves.toEqual([]);
      expect(startChildServer).toHaveBeenCalledTimes(1);
      expect(server.requests.filter((request) => request.method === "initialize")).toHaveLength(1);
      expect(relayDebugLog).toHaveBeenCalledWith("app_server.shared_socket.fallback", {
        message: "Injected initialize failure.",
        socketPath,
      });
    } finally {
      client.close();
      await server.close();
      await rm(codexHome, { force: true, recursive: true });
    }
  });

  it("falls back to private stdio after shared socket reconnect attempts are exhausted", async () => {
    const codexHome = await mkdtemp("/tmp/codex-relay-exhausted-");
    const socketPath = join(codexHome, "app-server-control", "app-server-control.sock");
    const server = await startSharedSocketServer(socketPath);
    vi.stubEnv("CODEX_HOME", codexHome);
    vi.stubEnv("CODEX_RELAY_APP_SERVER_MODE", "socket");
    const startChildServer = vi.fn<() => ReturnType<typeof createFakeStdioAppServer>>();
    startChildServer.mockImplementationOnce(() => createFakeStdioAppServer(true));
    startChildServer.mockImplementation(createFakeStdioAppServer);
    const client = new CodexAppServerClient({ startChildServer });

    try {
      await client.initialize();
      await server.close();
      await vi.waitFor(() => expect(startChildServer).toHaveBeenCalledTimes(1), { timeout: 7_000 });
      await vi.waitFor(() =>
        expect(relayDebugLog).toHaveBeenCalledWith("app_server.shared_socket.reconnect_failed", {
          message: "Injected stdio initialize failure.",
        }),
      );
      await expect(client.listModels()).resolves.toEqual([]);
      expect(startChildServer).toHaveBeenCalledTimes(2);
      expect(relayDebugLog).toHaveBeenCalledWith("app_server.shared_socket.fallback", {
        message: "Reconnect attempts exhausted.",
        socketPath,
      });
    } finally {
      client.close();
      await rm(codexHome, { force: true, recursive: true });
    }
  }, 10_000);
});

async function startSharedSocketServer(socketPath: string): Promise<SharedSocketServer> {
  await mkdir(dirname(socketPath), { recursive: true });
  const connections: WebSocket[] = [];
  const requests: JsonRpcRequest[] = [];
  let initializeFailures = 0;
  const server = createServer();
  const webSocketServer = new WebSocketServer({ server });
  webSocketServer.on("connection", (socket) => {
    connections.push(socket);
    socket.on("message", (data) => {
      const input = String(data);
      const request = JSON.parse(input) as JsonRpcRequest;
      if (request.method === "initialize" && initializeFailures > 0) {
        initializeFailures -= 1;
        requests.push(request);
        socket.send(
          JSON.stringify({
            id: request.id,
            error: { code: -32_000, message: "Injected initialize failure." },
          }),
        );
        return;
      }
      respondToJsonRpc(input, requests, (payload) => socket.send(payload));
    });
  });
  await listen(server, socketPath);

  return {
    connections,
    requests,
    failNextInitialize() {
      initializeFailures += 1;
    },
    async close() {
      for (const socket of connections) {
        socket.terminate();
      }
      await new Promise<void>((resolve, reject) => {
        webSocketServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          server.close((serverError) => {
            if (serverError) {
              reject(serverError);
              return;
            }
            resolve();
          });
        });
      });
    },
  };
}

function createFakeStdioAppServer(failInitialize = false) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn<() => boolean>(() => true);
  const requests: JsonRpcRequest[] = [];
  const readline = createInterface({ input: child.stdin, crlfDelay: Infinity });
  readline.on("line", (line) => {
    const request = JSON.parse(line) as JsonRpcRequest;
    if (failInitialize && request.method === "initialize") {
      failInitialize = false;
      requests.push(request);
      child.stdout.write(
        `${JSON.stringify({
          id: request.id,
          error: { code: -32_000, message: "Injected stdio initialize failure." },
        })}\n`,
      );
      return;
    }
    respondToJsonRpc(line, requests, (payload) => child.stdout.write(`${payload}\n`));
  });
  child.once("exit", () => readline.close());
  return child as never;
}

function respondToJsonRpc(
  input: string,
  requests: JsonRpcRequest[],
  send: (payload: string) => void,
) {
  const request = JSON.parse(input) as JsonRpcRequest;
  requests.push(request);
  const threadId =
    request.params && typeof request.params === "object" && "threadId" in request.params
      ? String(request.params.threadId)
      : "shared-thread";
  send(
    JSON.stringify({
      id: request.id,
      result:
        request.method === "model/list"
          ? { data: [] }
          : request.method === "thread/resume" || request.method === "thread/start"
            ? { thread: { id: threadId } }
            : {},
    }),
  );
}

function listen(server: Server, socketPath: string) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
