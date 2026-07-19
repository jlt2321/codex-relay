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
});

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
