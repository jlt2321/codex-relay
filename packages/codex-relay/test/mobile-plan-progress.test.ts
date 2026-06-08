import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../src/api-schema.js";

import {
  activePlanProgressStep,
  implementablePlanId,
  isTimelinePlanProgressMessage,
  splitTimelinePlanProgress,
} from "../../../apps/mobile/src/components/chat/plan-progress.js";

describe("mobile plan progress", () => {
  it("moves running status plan updates out of visible message rows", () => {
    const messages = [
      chatMessage("user-1", "user", "chat", "Check logs"),
      {
        ...chatMessage(
          "plan-1",
          "status",
          "plan",
          [
            "inProgress: Map log output and Codex SDK event handling paths",
            "pending: Verify whether goal and time fields are present",
          ].join("\n"),
        ),
        details: {
          plan: [
            {
              status: "inProgress",
              step: "Map log output and Codex SDK event handling paths",
            },
            {
              status: "pending",
              step: "Verify whether goal and time fields are present",
            },
          ],
        },
      },
      chatMessage("assistant-1", "assistant", "chat", "I will check."),
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.visibleMessages.map((message) => message.id)).toEqual(["user-1", "assistant-1"]);
    expect(result.progress?.steps).toEqual([
      {
        id: "plan-1-0",
        status: "inProgress",
        text: "Map log output and Codex SDK event handling paths",
      },
      {
        id: "plan-1-1",
        status: "pending",
        text: "Verify whether goal and time fields are present",
      },
    ]);
  });

  it("keeps assistant plan messages visible for implementable plan cards", () => {
    const messages = [chatMessage("assistant-plan", "assistant", "plan", "1. Edit README")];

    const result = splitTimelinePlanProgress(messages, true);

    expect(isTimelinePlanProgressMessage(messages[0])).toBe(false);
    expect(result.visibleMessages.map((message) => message.id)).toEqual(["assistant-plan"]);
    expect(result.progress).toBeUndefined();
    expect(implementablePlanId(messages)).toBe("assistant-plan");
  });

  it("hides historical status plan progress when the thread is no longer running", () => {
    const messages = [
      chatMessage("user-1", "user", "chat", "Check logs"),
      chatMessage("plan-1", "status", "plan", "completed: Inspect logs"),
    ];

    const result = splitTimelinePlanProgress(messages, false);

    expect(result.visibleMessages.map((message) => message.id)).toEqual(["user-1"]);
    expect(result.progress).toBeUndefined();
    expect(implementablePlanId(messages)).toBeUndefined();
  });

  it("does not reuse older progress when the newest status plan is unparseable", () => {
    const messages = [
      chatMessage("plan-1", "status", "plan", "inProgress: Inspect logs"),
      chatMessage("plan-2", "status", "plan", "Plan update received."),
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.visibleMessages).toEqual([]);
    expect(result.progress).toBeUndefined();
  });

  it("selects the in-progress step for collapsed progress", () => {
    const result = splitTimelinePlanProgress(
      [
        {
          ...chatMessage("plan-1", "status", "plan", "Plan update received."),
          details: {
            plan: [
              { status: "completed", step: "Inspect logs" },
              { status: "inProgress", step: "Patch mobile progress banner" },
              { status: "pending", step: "Verify behavior" },
            ],
          },
        },
      ],
      true,
    );

    expect(result.progress ? activePlanProgressStep(result.progress)?.text : undefined).toBe(
      "Patch mobile progress banner",
    );
  });
});

function chatMessage(
  id: string,
  role: ChatMessage["role"],
  kind: ChatMessage["kind"],
  content: string,
): ChatMessage {
  return {
    id,
    threadId: "thread-1",
    role,
    kind,
    content,
    createdAt: "2026-04-29T00:00:00.000Z",
  };
}
