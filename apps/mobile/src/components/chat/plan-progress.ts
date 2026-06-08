import type { ChatMessage } from "codex-relay/api-schema";

export type TimelinePlanProgressStepStatus = "completed" | "inProgress" | "pending";

export type TimelinePlanProgressStep = {
  readonly id: string;
  readonly status: TimelinePlanProgressStepStatus;
  readonly text: string;
};

export type TimelinePlanProgress = {
  readonly messageId: string;
  readonly steps: readonly TimelinePlanProgressStep[];
};

export function splitTimelinePlanProgress(messages: readonly ChatMessage[], isRunning: boolean) {
  const visibleMessages: ChatMessage[] = [];
  let progress: TimelinePlanProgress | undefined;

  for (const message of messages) {
    if (isTimelinePlanProgressMessage(message)) {
      if (isRunning) {
        progress = planProgressFromMessage(message);
      }
      continue;
    }

    visibleMessages.push(message);
  }

  return {
    progress,
    visibleMessages,
  };
}

export function isTimelinePlanProgressMessage(message: ChatMessage) {
  return message.kind === "plan" && message.role === "status";
}

export function activePlanProgressStep(progress: TimelinePlanProgress) {
  return (
    progress.steps.find((step) => step.status === "inProgress") ??
    progress.steps.find((step) => step.status === "pending") ??
    progress.steps[progress.steps.length - 1]
  );
}

export function implementablePlanId(messages: readonly ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    if (isImplementablePlanMessage(message)) {
      return message.id;
    }
    if (!isResolvedInputRequest(message)) {
      return undefined;
    }
  }
  return undefined;
}

function isImplementablePlanMessage(message: ChatMessage) {
  return (
    message.kind === "plan" &&
    message.role === "assistant" &&
    message.state !== "streaming" &&
    Boolean(message.content.trim())
  );
}

function isResolvedInputRequest(message: ChatMessage) {
  if (message.kind !== "structuredUserInput") {
    return false;
  }
  return (
    message.details?.approvalResolved === true ||
    typeof message.details?.approvalDecision === "string"
  );
}

function planProgressFromMessage(message: ChatMessage): TimelinePlanProgress | undefined {
  const steps = [
    ...planProgressStepsFromUnknown(message.details?.plan),
    ...planProgressStepsFromUnknown(message.details?.steps),
  ];
  const parsedSteps = steps.length > 0 ? steps : planProgressStepsFromContent(message.content);

  if (parsedSteps.length === 0) {
    return undefined;
  }

  return {
    messageId: message.id,
    steps: parsedSteps.map((step, index) => ({
      ...step,
      id: `${message.id}-${index}`,
    })),
  };
}

function planProgressStepsFromUnknown(
  value: unknown,
): readonly Omit<TimelinePlanProgressStep, "id">[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      const text = item.trim();
      return text ? [{ status: "pending" as const, text }] : [];
    }

    const text = stringRecordValue(item, "step") ?? stringRecordValue(item, "text");
    const status = normalizeStepStatus(stringRecordValue(item, "status"));
    if (!text || !status) {
      return [];
    }

    return [{ status, text }];
  });
}

function planProgressStepsFromContent(
  content: string,
): readonly Omit<TimelinePlanProgressStep, "id">[] {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^\s*(completed|inProgress|in_progress|pending)\s*:\s*(.+?)\s*$/i);
      const status = normalizeStepStatus(match?.[1]);
      const text = match?.[2]?.trim();
      return status && text ? [{ status, text }] : [];
    });
}

function normalizeStepStatus(
  value: string | undefined,
): TimelinePlanProgressStepStatus | undefined {
  const normalized = value?.trim().replace(/[- ]/g, "_");

  switch (normalized) {
    case "completed":
      return "completed";
    case "inProgress":
    case "in_progress":
      return "inProgress";
    case "pending":
      return "pending";
    case undefined:
      return undefined;
    default:
      return undefined;
  }
}

function stringRecordValue(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key && typeof entryValue === "string") {
      return entryValue.trim() || undefined;
    }
  }

  return undefined;
}
