import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { CodexAppServerClient } from "../src/app-server.js";
import {
  applyStreamEvent,
  chatStore$,
  resetChatSessionState,
  setRunning,
} from "../../../apps/mobile/src/state/chat-store.js";
import {
  createThreadRunSseDispatcher,
  handleThreadRunStreamEvent,
} from "../../../apps/mobile/src/lib/thread-run-stream.js";

const runLiveAppServerTest = process.env.CODEX_RELAY_LIVE_APP_SERVER_TEST === "1";
const liveDescribe = runLiveAppServerTest ? describe : describe.skip;
const liveModel = process.env.CODEX_RELAY_LIVE_MODEL?.trim() || "gpt-5.5";
const liveDisconnectPid = Number(process.env.CODEX_RELAY_LIVE_DISCONNECT_PID);
const runLiveDisconnectTest =
  runLiveAppServerTest && Number.isSafeInteger(liveDisconnectPid) && liveDisconnectPid > 1
    ? true
    : false;

liveDescribe("live mobile stream contract", () => {
  let appServer: CodexAppServerClient | undefined;

  beforeEach(() => {
    resetChatSessionState();
  });

  afterEach(() => {
    appServer?.close();
    appServer = undefined;
  });

  it("round-trips a real app-server turn through the server SSE and mobile stream reducer", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-live-workspace-"));
    appServer = new CodexAppServerClient();
    const app = createApp({
      appServer,
      workspacePath,
    });

    const createResponse = await app.request("/v1/threads", {
      method: "POST",
      body: JSON.stringify({
        model: liveModel,
        runtimeMode: "full-access",
        title: "Live stream contract",
      }),
      headers: { "content-type": "application/json" },
    });
    const createPayload = await createResponse.json();
    const threadId = createPayload.thread.id as string;

    const response = await app.request(`/v1/threads/${threadId}/runs/stream`, {
      method: "POST",
      body: JSON.stringify({
        model: liveModel,
        prompt: "Reply with exactly: relay-live-ok",
        reasoningEffort: "medium",
        runtimeMode: "full-access",
      }),
      headers: { "content-type": "application/json" },
    });
    const body = await response.text();
    const consumed = consumeAsMobileChatStream(body, threadId);
    const messages = chatStore$.messagesByThreadId[threadId].peek() ?? [];
    const assistantMessage = messages.find((message) => message.role === "assistant");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(consumed.errors).toEqual([]);
    expect(consumed.eventTypes).toContain("thread.message.delta");
    expect(consumed.terminalThreadIds).toContain(threadId);
    expect(chatStore$.threadsById[threadId].state.peek()).toBe("completed");
    expect(assistantMessage?.state).toBe("completed");
    expect(assistantMessage?.content.toLowerCase()).toContain("relay-live-ok");
  }, 120_000);

  it("continues a real not-loaded app-server thread through the mobile stream reducer", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-live-workspace-"));
    appServer = new CodexAppServerClient();
    let app = createApp({
      appServer,
      workspacePath,
    });

    const createResponse = await app.request("/v1/threads", {
      method: "POST",
      body: JSON.stringify({
        model: liveModel,
        runtimeMode: "full-access",
        title: "Live continuation contract",
      }),
      headers: { "content-type": "application/json" },
    });
    const createPayload = await createResponse.json();
    const threadId = createPayload.thread.id as string;

    const firstResponse = await app.request(`/v1/threads/${threadId}/runs/stream`, {
      method: "POST",
      body: JSON.stringify({
        model: liveModel,
        prompt: "Reply with exactly: relay-live-first-ok",
        reasoningEffort: "medium",
        runtimeMode: "full-access",
      }),
      headers: { "content-type": "application/json" },
    });
    expect(await firstResponse.text()).toContain("relay-live-first-ok");

    appServer.close();
    appServer = new CodexAppServerClient();
    app = createApp({
      appServer,
      workspacePath,
    });
    resetChatSessionState();

    const response = await app.request(`/v1/threads/${threadId}/runs/stream`, {
      method: "POST",
      body: JSON.stringify({
        model: liveModel,
        prompt: "Reply with exactly: relay-live-second-ok",
        reasoningEffort: "medium",
        runtimeMode: "full-access",
      }),
      headers: { "content-type": "application/json" },
    });
    const body = await response.text();
    const consumed = consumeAsMobileChatStream(body, threadId);
    const messages = chatStore$.messagesByThreadId[threadId].peek() ?? [];
    const assistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(consumed.errors).toEqual([]);
    expect(consumed.eventTypes).toContain("thread.message.delta");
    expect(consumed.terminalThreadIds).toContain(threadId);
    expect(chatStore$.threadsById[threadId].state.peek()).toBe("completed");
    expect(assistantMessage?.state).toBe("completed");
    expect(assistantMessage?.content.toLowerCase()).toContain("relay-live-second-ok");
  }, 120_000);

  it("compacts a real app-server thread through the relay API", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-live-workspace-"));
    appServer = new CodexAppServerClient();
    const app = createApp({ appServer, workspacePath });

    const createResponse = await app.request("/v1/threads", {
      method: "POST",
      body: JSON.stringify({
        model: liveModel,
        runtimeMode: "full-access",
        title: "Live compact contract",
      }),
      headers: { "content-type": "application/json" },
    });
    const createPayload = await createResponse.json();
    const threadId = createPayload.thread.id as string;

    const runResponse = await app.request(`/v1/threads/${threadId}/runs/stream`, {
      method: "POST",
      body: JSON.stringify({
        model: liveModel,
        prompt: "Reply with exactly: relay-live-compact-ok",
        reasoningEffort: "medium",
        runtimeMode: "full-access",
      }),
      headers: { "content-type": "application/json" },
    });
    expect(await runResponse.text()).toContain("relay-live-compact-ok");

    const compactResponse = await app.request(`/v1/threads/${threadId}/compact`, {
      method: "POST",
    });
    expect(compactResponse.status).toBe(202);

    await vi.waitFor(
      async () => {
        const thread = await appServer?.readThread(threadId, { includeTurns: true });
        expect(thread?.turns?.at(-1)).toMatchObject({
          items: [expect.objectContaining({ type: "contextCompaction" })],
          status: "completed",
        });
      },
      { interval: 500, timeout: 60_000 },
    );
  }, 120_000);

  it.runIf(runLiveDisconnectTest)(
    "fails closed when the shared app-server disconnects and recovers later requests",
    async () => {
      const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-live-disconnect-"));
      appServer = new CodexAppServerClient();
      const app = createApp({ appServer, workspacePath });
      let replacementServer: ChildProcess | undefined;
      let resolveTurnStarted = (): void => undefined;
      const turnStarted = new Promise<void>((resolve) => {
        resolveTurnStarted = resolve;
      });
      const cleanupNotification = appServer.onNotification((notification) => {
        if (notification.method === "turn/started") {
          resolveTurnStarted();
        }
      });

      try {
        const createResponse = await app.request("/v1/threads", {
          method: "POST",
          body: JSON.stringify({
            model: liveModel,
            runtimeMode: "full-access",
            title: "Live disconnect closure",
          }),
          headers: { "content-type": "application/json" },
        });
        const createPayload = await createResponse.json();
        const threadId = createPayload.thread.id as string;

        const response = await app.request(`/v1/threads/${threadId}/runs/stream`, {
          method: "POST",
          body: JSON.stringify({
            model: liveModel,
            prompt: "Reply with exactly: should-not-complete-before-disconnect",
            reasoningEffort: "high",
            runtimeMode: "full-access",
          }),
          headers: { "content-type": "application/json" },
        });
        const bodyPromise = response.text();
        await Promise.race([
          turnStarted,
          rejectAfter(30_000, "Timed out waiting for turn/started."),
        ]);

        process.kill(liveDisconnectPid, "SIGKILL");
        const body = await Promise.race([
          bodyPromise,
          rejectAfter(10_000, "SSE did not close after the transport disconnected."),
        ]);

        expect(response.status).toBe(200);
        expect(body).toContain("thread.error");
        expect(body).toContain("codex_run_failed");
        expect(body).toContain("Shared Codex app-server disconnected.");
        expect(body).toContain('"state":"failed"');

        replacementServer = spawn(
          process.env.CODEX_RELAY_LIVE_CODEX_BIN?.trim() || "codex",
          ["app-server", "--listen", "unix://"],
          { detached: true, stdio: "ignore" },
        );
        replacementServer.unref();

        await vi.waitFor(
          async () => {
            await expect(appServer?.listModels()).resolves.not.toEqual([]);
          },
          { interval: 200, timeout: 12_000 },
        );
      } finally {
        cleanupNotification();
        if (replacementServer?.pid) {
          try {
            process.kill(-replacementServer.pid, "SIGTERM");
          } catch {
            // The replacement may already have exited during test cleanup.
          }
        }
      }
    },
    60_000,
  );
});

function rejectAfter(ms: number, message: string) {
  return new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

function consumeAsMobileChatStream(body: string, threadId: string) {
  const errors: Error[] = [];
  const eventTypes: string[] = [];
  const terminalThreadIds: string[] = [];
  const dispatcher = createThreadRunSseDispatcher({
    onEvent(event) {
      eventTypes.push(event.type);
      handleThreadRunStreamEvent(event, {
        fallbackThreadId: threadId,
        applyEvent: applyStreamEvent,
        onTerminal(terminalThreadId) {
          terminalThreadIds.push(terminalThreadId);
          setRunning(false);
        },
      });
    },
    onError(error) {
      errors.push(error);
    },
  });

  dispatcher.push(body);
  dispatcher.flush();
  return { errors, eventTypes, terminalThreadIds };
}
