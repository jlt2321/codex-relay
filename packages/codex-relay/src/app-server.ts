import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

import { resolveCodexAppServerSpawn } from "./codex-binary.js";

type JsonRpcServerMessage = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

type PendingRequest = {
  method: string;
  reject(error: Error): void;
  resolve(value: unknown): void;
};

export type AppServerThread = {
  id: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  status: unknown;
  cwd: string;
  source: string;
  modelProvider: string;
  name: string | null;
  turns?: AppServerTurn[];
};

export type AppServerTurn = {
  id: string;
  items: AppServerThreadItem[];
  status: unknown;
  startedAt: number | null;
  completedAt: number | null;
};

export type AppServerTextElement = {
  byteRange: { end: number; start: number };
  placeholder: string | null;
};

export type AppServerUserInput =
  | { type: "text"; text: string; text_elements: AppServerTextElement[] }
  | { type: "image"; url: string }
  | { type: "localImage"; path: string }
  | {
      type: "document" | "file" | "localFile";
      mimeType?: string;
      name?: string;
      path?: string;
      url?: string;
    }
  | { type: "skill"; name: string; path: string }
  | { type: "mention"; name: string; path: string };

export type AppServerThreadItem =
  | {
      type: "userMessage";
      id: string;
      content: AppServerUserInput[];
    }
  | { type: "agentMessage"; id: string; text: string }
  | {
      type: "plan";
      id: string;
      body?: unknown;
      content?: unknown;
      explanation?: unknown;
      items?: unknown;
      markdown?: unknown;
      message?: unknown;
      plan?: unknown;
      steps?: unknown;
      text?: unknown;
    }
  | { type: "reasoning"; id: string; summary?: string[]; content?: string[] }
  | {
      type: "commandExecution";
      id: string;
      command: string;
      aggregatedOutput?: string | null;
      cwd?: string | null;
      exitCode?: number | null;
      status?: string | null;
    }
  | {
      type: "fileChange";
      id: string;
      changes: Array<{ path: string; kind: string }>;
      patch?: string | null;
    }
  | { type: "mcpToolCall"; id: string; server: string; tool: string; status?: string | null }
  | { type: "webSearch"; id: string; query: string; status?: string | null }
  | { type: string; id: string };

export type AppServerModel = {
  id: string;
  model: string;
  displayName: string;
  description?: string;
  isDefault?: boolean;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: Array<{ reasoningEffort: string }>;
  additionalSpeedTiers?: string[];
  serviceTiers?: Array<{ id: string; name: string; description?: string }>;
};

export type AppServerRateLimits = {
  rateLimits?: unknown;
  rateLimitsByLimitId?: Record<string, unknown>;
};

export type AppServerThreadGoalStatus =
  | "active"
  | "paused"
  | "blocked"
  | "usageLimited"
  | "budgetLimited"
  | "complete";

export type AppServerThreadGoal = {
  threadId: string;
  objective: string;
  status: AppServerThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
};

export type AppServerRequest = {
  id: number;
  method: string;
  params: unknown;
};

export type AppServerNotification = {
  method: string;
  params: unknown;
};

export type AppServerThreadStartParams = {
  approvalPolicy?: string | null;
  cwd?: string | null;
  experimentalRawEvents: boolean;
  model?: string | null;
  persistExtendedHistory: boolean;
  sandbox?: string | null;
  serviceTier?: string | null;
};

export type AppServerThreadResumeParams = {
  approvalPolicy?: string | null;
  cwd?: string | null;
  excludeTurns?: boolean;
  model?: string | null;
  persistExtendedHistory: boolean;
  sandbox?: string | null;
  serviceTier?: string | null;
  threadId: string;
};

export type AppServerTurnStartParams = {
  approvalPolicy?: string | null;
  collaborationMode?: {
    mode: "default" | "plan";
    settings: {
      developer_instructions: string | null;
      model: string;
      reasoning_effort: string | null;
    };
  } | null;
  cwd?: string | null;
  effort?: string | null;
  input: AppServerUserInput[];
  model?: string | null;
  sandboxPolicy?: unknown;
  serviceTier?: string | null;
  threadId: string;
};

export type AppServerTurnInterruptParams = {
  threadId: string;
  turnId: string;
};

export type AppServerThreadArchiveParams = {
  threadId: string;
};

export type AppServerThreadGoalGetParams = {
  threadId: string;
};

export type AppServerThreadGoalSetParams = {
  threadId: string;
  objective?: string | null;
  status?: AppServerThreadGoalStatus | null;
  tokenBudget?: number | null;
};

export type AppServerThreadGoalClearParams = {
  threadId: string;
};

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private initialized: Promise<void> | undefined;
  private notificationHandlers = new Set<(notification: AppServerNotification) => void>();
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private requestHandlers = new Set<(request: AppServerRequest) => void>();
  private readline: Interface | undefined;

  async listThreads(limit = 80) {
    const response = await this.request<{ data: AppServerThread[] }>("thread/list", {
      limit,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: [],
      archived: false,
    });
    return response.data;
  }

  async readThread(threadId: string, options: { includeTurns?: boolean } = {}) {
    const response = await this.request<{ thread: AppServerThread }>("thread/read", {
      threadId,
      includeTurns: options.includeTurns ?? true,
    });
    return response.thread;
  }

  async listModels(limit = 80) {
    const response = await this.request<{ data: AppServerModel[] }>("model/list", {
      limit,
      includeHidden: false,
    });
    return response.data;
  }

  async readRateLimits() {
    return this.request<AppServerRateLimits>("account/rateLimits/read", null);
  }

  async startThread(params: AppServerThreadStartParams) {
    const response = await this.request<{ thread: AppServerThread }>("thread/start", params);
    return response.thread;
  }

  async resumeThread(params: AppServerThreadResumeParams) {
    const response = await this.request<{ thread: AppServerThread }>("thread/resume", params);
    return response.thread;
  }

  async startTurn(params: AppServerTurnStartParams) {
    const response = await this.request<{ turn: AppServerTurn }>("turn/start", params);
    return response.turn;
  }

  async interruptTurn(params: AppServerTurnInterruptParams) {
    await this.request("turn/interrupt", params);
  }

  async archiveThread(params: AppServerThreadArchiveParams) {
    await this.request("thread/archive", params);
  }

  async getThreadGoal(params: AppServerThreadGoalGetParams) {
    const response = await this.request<{ goal: AppServerThreadGoal | null }>(
      "thread/goal/get",
      params,
    );
    return response.goal;
  }

  async setThreadGoal(params: AppServerThreadGoalSetParams) {
    const response = await this.request<{ goal: AppServerThreadGoal }>("thread/goal/set", params);
    return response.goal;
  }

  async clearThreadGoal(params: AppServerThreadGoalClearParams) {
    await this.request("thread/goal/clear", params);
  }

  onNotification(handler: (notification: AppServerNotification) => void) {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  onRequest(handler: (request: AppServerRequest) => void) {
    this.requestHandlers.add(handler);
    return () => this.requestHandlers.delete(handler);
  }

  async respondToRequest(id: number, result: unknown) {
    await this.writeJson({ id, result });
  }

  async rejectRequest(id: number, code: number, message: string) {
    await this.writeJson({ id, error: { code, message } });
  }

  close() {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Codex app-server was closed."));
    }
    this.pending.clear();
    this.readline?.close();
    this.child?.kill();
    this.readline = undefined;
    this.child = undefined;
    this.initialized = undefined;
  }

  private async request<T>(method: string, params: unknown): Promise<T> {
    await this.ensureInitialized();
    const id = this.nextId++;
    debugAppServer("request", method, id);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { method, resolve: (value) => resolve(value as T), reject });
      this.child!.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  private ensureInitialized() {
    if (!this.initialized) {
      this.initialized = this.start();
    }
    return this.initialized;
  }

  private start() {
    const spawnConfig = resolveCodexAppServerSpawn();
    this.child = spawn(spawnConfig.command, spawnConfig.args, {
      env: process.env,
      shell: spawnConfig.shell,
      windowsHide: spawnConfig.windowsHide,
    });
    this.readline = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    this.readline.on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk) => {
      if (process.env.CODEX_RELAY_DEBUG_APP_SERVER === "1") {
        process.stderr.write(String(chunk));
      }
    });
    this.child.once("error", (error) => this.rejectAll(error));
    this.child.once("exit", (code, signal) => {
      this.rejectAll(new Error(`Codex app-server exited with ${signal ?? code ?? 1}.`));
      this.child = undefined;
      this.initialized = undefined;
    });

    return this.requestRaw("initialize", {
      clientInfo: {
        name: "codex-relay",
        title: "Codex Relay Mobile Server",
        version: "1.2.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    }).then(() => undefined);
  }

  private requestRaw<T>(method: string, params: unknown): Promise<T> {
    const id = this.nextId++;
    const request = JSON.stringify({ id, method, params });
    debugAppServer("request", method, id);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { method, resolve: (value) => resolve(value as T), reject });
      this.child!.stdin.write(`${request}\n`, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  private handleLine(line: string) {
    let message: JsonRpcServerMessage;
    try {
      message = JSON.parse(line) as JsonRpcServerMessage;
    } catch {
      return;
    }

    if (typeof message.method === "string" && typeof message.id === "number") {
      debugAppServer("server-request", message.method, message.id);
      const request = { id: message.id, method: message.method, params: message.params };
      if (this.requestHandlers.size === 0) {
        void this.rejectRequest(request.id, -32601, `No handler for ${request.method}.`);
      } else {
        for (const handler of this.requestHandlers) {
          handler(request);
        }
      }
      return;
    }

    if (typeof message.method === "string") {
      debugAppServer("notification", message.method);
      const notification = { method: message.method, params: message.params };
      for (const handler of this.notificationHandlers) {
        handler(notification);
      }
      return;
    }

    if (typeof message.id !== "number") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);
    debugAppServer("response", pending.method, message.id);
    if (message.error) {
      debugAppServer("error", pending.method, message.id, message.error.message);
      pending.reject(new Error(message.error.message));
    } else {
      pending.resolve(message.result);
    }
  }

  private writeJson(payload: unknown) {
    return new Promise<void>((resolve, reject) => {
      if (!this.child?.stdin) {
        reject(new Error("Codex app-server is not running."));
        return;
      }
      this.child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function debugAppServer(kind: string, method: string | undefined, id?: number, detail?: string) {
  if (process.env.CODEX_RELAY_DEBUG_APP_SERVER !== "1") {
    return;
  }

  console.log(
    `[app-server] ${kind}${id === undefined ? "" : ` #${id}`}${method ? ` ${method}` : ""}${detail ? ` ${detail}` : ""}`,
  );
}
