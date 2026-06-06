import type {
  ChatMessage,
  CheckoutWorkspaceBranchRequest,
  CommitPushWorkspaceRequest,
  CreateThreadRequest,
  ListQueuedThreadInputsResponse,
  ListThreadsResponse,
  QueuedThreadInput,
  RunThreadRequest,
  RuntimePreferences,
  RuntimePreferencesResponse,
  StatusResponse,
  StreamThreadRunEvent,
  ThreadDetailResponse,
  ThreadSummary,
  UpdateThreadGoalRequest,
  VersionResponse,
} from "codex-relay/api-schema";
import {
  chatMessageDetailsFromPromptContext,
  promptMarkdownWithSkills,
} from "codex-relay/api-schema";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

import {
  archiveThread,
  checkoutWorkspaceBranch,
  clearThreadGoal,
  commitPushWorkspace,
  createThread,
  getThreadGoal,
  getCodexRelayServerUrl,
  getRateLimits,
  getStatus,
  getThread,
  getThreadContextWindow,
  getVersion,
  getWorkspaceChanges,
  listModels,
  listQueuedThreadInputs,
  listThreads,
  listWorkspaceDirectories,
  removeQueuedThreadInput,
  steerQueuedThreadInput,
  submitThreadInput,
  updateThreadGoal,
  updateRuntimePreferences,
} from "@/lib/codex-relay-api";
import {
  cacheWorkspaceRuntimePreferences,
  cacheWorkspaceRuntimePreferencesFromStatus,
} from "@/lib/workspace-runtime-preferences-cache";

const rootKey = "codex-relay-server-state";
const persistableServerStateScopes = new Set(["models", "status", "threads"]);
const optimisticSteeringMessageIdPrefix = "optimistic-steering:";

export const serverStateKeys = {
  all: () => [rootKey, getCodexRelayServerUrl()] as const,
  contextWindow: (threadId: string) =>
    [...serverStateKeys.threadScope(threadId), "context-window"] as const,
  models: () => [...serverStateKeys.all(), "models"] as const,
  queuedInputs: (threadId: string) =>
    [...serverStateKeys.threadScope(threadId), "queued-inputs"] as const,
  rateLimits: () => [...serverStateKeys.all(), "rate-limits"] as const,
  status: () => [...serverStateKeys.all(), "status"] as const,
  thread: (threadId: string) => [...serverStateKeys.threadScope(threadId), "detail"] as const,
  threadScope: (threadId: string) => [...serverStateKeys.threads(), threadId] as const,
  threads: () => [...serverStateKeys.all(), "threads"] as const,
  version: () => [...serverStateKeys.all(), "version"] as const,
  workspaceChanges: (workspacePath: string | undefined) =>
    [...serverStateKeys.all(), "workspace-changes", workspacePath ?? null] as const,
  workspaceDirectories: (path: string | undefined) =>
    [...serverStateKeys.all(), "workspace-directories", path ?? null] as const,
};

export function isPersistableServerStateQueryKey(queryKey: readonly unknown[]) {
  return queryKey[0] === rootKey && persistableServerStateScopes.has(String(queryKey[2] ?? ""));
}

export function fetchStatusState(queryClient: QueryClient) {
  return queryClient.fetchQuery({
    queryKey: serverStateKeys.status(),
    queryFn: getStatus,
  });
}

export function fetchThreadsState(queryClient: QueryClient) {
  return queryClient.fetchQuery({
    queryKey: serverStateKeys.threads(),
    queryFn: listThreads,
  });
}

export function fetchModelsState(queryClient: QueryClient) {
  return queryClient.fetchQuery({
    queryKey: serverStateKeys.models(),
    queryFn: listModels,
  });
}

export function fetchRateLimitsState(queryClient: QueryClient) {
  return queryClient.fetchQuery({
    queryKey: serverStateKeys.rateLimits(),
    queryFn: getRateLimits,
  });
}

export function fetchThreadState(queryClient: QueryClient, threadId: string) {
  return queryClient
    .fetchQuery({
      queryKey: serverStateKeys.thread(threadId),
      queryFn: () => getThread(threadId),
    })
    .then((response) => {
      queryClient.setQueryData<ThreadDetailResponse>(serverStateKeys.thread(threadId), (current) =>
        mergeThreadDetailState(current, response),
      );
      return response;
    });
}

export function fetchQueuedInputsState(queryClient: QueryClient, threadId: string) {
  return queryClient.fetchQuery({
    queryKey: serverStateKeys.queuedInputs(threadId),
    queryFn: () => listQueuedThreadInputs(threadId),
  });
}

export function fetchContextWindowState(queryClient: QueryClient, threadId: string) {
  return queryClient.fetchQuery({
    queryKey: serverStateKeys.contextWindow(threadId),
    queryFn: () => getThreadContextWindow(threadId),
  });
}

export async function fetchThreadGoalState(queryClient: QueryClient, threadId: string) {
  const response = await getThreadGoal(threadId);
  upsertThreadState(queryClient, response.thread);
  return response;
}

export function fetchWorkspaceChangesState(
  queryClient: QueryClient,
  workspacePath: string | undefined,
  options: { staleTime?: number } = {},
) {
  return queryClient.fetchQuery({
    queryKey: serverStateKeys.workspaceChanges(workspacePath),
    queryFn: () => getWorkspaceChanges({ workspacePath }),
    staleTime: options.staleTime,
  });
}

export function fetchWorkspaceDirectoriesState(queryClient: QueryClient, path: string | undefined) {
  return queryClient.fetchQuery({
    queryKey: serverStateKeys.workspaceDirectories(path),
    queryFn: () => listWorkspaceDirectories(path),
  });
}

export const serverStateQueryFns = {
  contextWindow: getThreadContextWindow,
  models: listModels,
  queuedInputs: listQueuedThreadInputs,
  rateLimits: getRateLimits,
  status: getStatus,
  thread: getThread,
  threads: listThreads,
  version: getVersion,
  workspaceChanges: getWorkspaceChanges,
  workspaceDirectories: listWorkspaceDirectories,
};

export async function createThreadServerState(queryClient: QueryClient, body: CreateThreadRequest) {
  const response = await createThread(body);
  setThreadDetailState(queryClient, response.thread, response.messages);
  return response;
}

export async function archiveThreadServerState(queryClient: QueryClient, threadId: string) {
  const response = await archiveThread(threadId);
  setThreadsState(queryClient, response.threads, response.source);
  removeThreadDetailState(queryClient, response.archivedThreadId);
  return response;
}

export async function submitThreadInputServerState(
  queryClient: QueryClient,
  threadId: string,
  body: RunThreadRequest,
) {
  const response = await submitThreadInput(threadId, body);
  upsertThreadState(queryClient, response.thread);
  return response;
}

export async function removeQueuedThreadInputServerState(
  queryClient: QueryClient,
  threadId: string,
  inputId: string,
) {
  const response = await removeQueuedThreadInput(threadId, inputId);
  upsertThreadState(queryClient, response.thread);
  removeQueuedInputState(queryClient, threadId, inputId);
  return response;
}

export async function steerQueuedThreadInputServerState(
  queryClient: QueryClient,
  threadId: string,
  inputId: string,
) {
  const response = await steerQueuedThreadInput(threadId, inputId);
  upsertThreadState(queryClient, response.thread);
  removeQueuedInputState(queryClient, threadId, inputId);
  return response;
}

export async function checkoutWorkspaceBranchServerState(
  queryClient: QueryClient,
  body: CheckoutWorkspaceBranchRequest,
) {
  const response = await checkoutWorkspaceBranch(body);
  await queryClient.invalidateQueries({
    queryKey: serverStateKeys.workspaceChanges(body.workspacePath),
  });
  return response;
}

export async function commitPushWorkspaceServerState(
  queryClient: QueryClient,
  body: CommitPushWorkspaceRequest,
) {
  const response = await commitPushWorkspace(body);
  await queryClient.invalidateQueries({
    queryKey: serverStateKeys.workspaceChanges(body.workspacePath),
  });
  return response;
}

export function updateRuntimePreferencesServerState(
  body: Parameters<typeof updateRuntimePreferences>[0],
) {
  return updateRuntimePreferences(body);
}

export async function updateThreadGoalServerState(
  queryClient: QueryClient,
  threadId: string,
  body: UpdateThreadGoalRequest,
) {
  const response = await updateThreadGoal(threadId, body);
  upsertThreadState(queryClient, response.thread);
  return response;
}

export async function clearThreadGoalServerState(queryClient: QueryClient, threadId: string) {
  const response = await clearThreadGoal(threadId);
  upsertThreadState(queryClient, response.thread);
  return response;
}

export function clearServerState(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: [rootKey] });
}

export function setStatusState(queryClient: QueryClient, status: StatusResponse) {
  cacheWorkspaceRuntimePreferencesFromStatus(getCodexRelayServerUrl(), status);
  queryClient.setQueryData(serverStateKeys.status(), status);
}

export function setVersionState(queryClient: QueryClient, version: VersionResponse) {
  queryClient.setQueryData(serverStateKeys.version(), version);
}

export function setRuntimePreferencesState(
  queryClient: QueryClient,
  preferences: RuntimePreferences,
) {
  queryClient.setQueryData<StatusResponse>(serverStateKeys.status(), (current) =>
    current ? { ...current, preferences } : current,
  );
}

export function setRuntimePreferencesResponseState(
  queryClient: QueryClient,
  response: RuntimePreferencesResponse,
) {
  const workspacePreferences = response.workspacePath
    ? response.runtimePreferencesByWorkspacePath[response.workspacePath]
    : undefined;
  if (response.workspacePath && workspacePreferences) {
    cacheWorkspaceRuntimePreferences(
      getCodexRelayServerUrl(),
      response.workspacePath,
      workspacePreferences,
    );
    setWorkspaceRuntimePreferencesState(queryClient, response.workspacePath, workspacePreferences);
  }
  queryClient.setQueryData<StatusResponse>(serverStateKeys.status(), (current) => {
    if (!current) {
      return current;
    }
    const responseMatchesCurrentWorkspace =
      !response.workspacePath || response.workspacePath === current.workspacePath;
    const nextPreferences = responseMatchesCurrentWorkspace
      ? response.preferences
      : response.workspacePath === current.workspacePath && workspacePreferences
        ? workspacePreferences
        : current.preferences;
    return {
      ...current,
      preferences: nextPreferences,
      runtimePreferencesByWorkspacePath: response.runtimePreferencesByWorkspacePath,
      workspacePath: response.workspacePath ?? current.workspacePath,
    };
  });
}

export function setWorkspaceRuntimePreferencesState(
  queryClient: QueryClient,
  workspacePath: string,
  preferences: RuntimePreferences,
) {
  cacheWorkspaceRuntimePreferences(getCodexRelayServerUrl(), workspacePath, preferences);
  queryClient.setQueryData<StatusResponse>(serverStateKeys.status(), (current) =>
    current
      ? {
          ...current,
          preferences: workspacePath === current.workspacePath ? preferences : current.preferences,
          runtimePreferencesByWorkspacePath: {
            ...current.runtimePreferencesByWorkspacePath,
            [workspacePath]: preferences,
          },
        }
      : current,
  );
}

export function setThreadRunningState(
  queryClient: QueryClient,
  threadId: string | undefined,
  isRunning: boolean,
) {
  if (!threadId) {
    return;
  }
  patchThreadState(queryClient, threadId, {
    state: isRunning ? "running" : "completed",
    updatedAt: new Date().toISOString(),
  });
}

export function setThreadsState(
  queryClient: QueryClient,
  threads: ThreadSummary[],
  source: ListThreadsResponse["source"] = "memory",
) {
  queryClient.setQueryData<ListThreadsResponse>(serverStateKeys.threads(), {
    source,
    threads: sortThreads(threads),
  });
}

export function upsertThreadState(queryClient: QueryClient, thread: ThreadSummary) {
  queryClient.setQueryData<ListThreadsResponse>(serverStateKeys.threads(), (current) => {
    const threads = current?.threads ?? [];
    return {
      source: current?.source ?? "memory",
      threads: sortThreads(upsertById(threads, thread)),
    };
  });
  queryClient.setQueryData<ThreadDetailResponse>(serverStateKeys.thread(thread.id), (current) =>
    current ? { ...current, thread } : current,
  );
}

export function setThreadDetailState(
  queryClient: QueryClient,
  thread: ThreadSummary,
  messages: ChatMessage[],
  pendingInputRequests: ThreadDetailResponse["pendingInputRequests"] = [],
) {
  upsertThreadState(queryClient, thread);
  const response: ThreadDetailResponse = {
    thread,
    messages,
    pendingInputRequests,
  };
  queryClient.setQueryData<ThreadDetailResponse>(serverStateKeys.thread(thread.id), (current) =>
    mergeThreadDetailState(current, response),
  );
}

export function removeThreadDetailState(queryClient: QueryClient, threadId: string) {
  queryClient.removeQueries({ queryKey: serverStateKeys.threadScope(threadId) });
}

export type OptimisticArchiveThreadSnapshot = {
  threadScopeQueries: [QueryKey, unknown][];
  threads?: ListThreadsResponse;
};

export async function optimisticallyArchiveThreadState(
  queryClient: QueryClient,
  threadId: string,
): Promise<OptimisticArchiveThreadSnapshot> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: serverStateKeys.threads() }),
    queryClient.cancelQueries({ queryKey: serverStateKeys.threadScope(threadId) }),
  ]);
  const snapshot: OptimisticArchiveThreadSnapshot = {
    threadScopeQueries: queryClient.getQueriesData({
      queryKey: serverStateKeys.threadScope(threadId),
    }),
    threads: queryClient.getQueryData<ListThreadsResponse>(serverStateKeys.threads()),
  };
  queryClient.setQueryData<ListThreadsResponse>(serverStateKeys.threads(), (current) =>
    current
      ? {
          ...current,
          threads: current.threads.filter((thread) => thread.id !== threadId),
        }
      : current,
  );
  removeThreadDetailState(queryClient, threadId);
  return snapshot;
}

export function restoreOptimisticArchiveThreadState(
  queryClient: QueryClient,
  snapshot: OptimisticArchiveThreadSnapshot | undefined,
) {
  if (!snapshot) {
    return;
  }
  if (snapshot.threads) {
    queryClient.setQueryData(serverStateKeys.threads(), snapshot.threads);
  }
  for (const [queryKey, data] of snapshot.threadScopeQueries) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function setQueuedInputsState(
  queryClient: QueryClient,
  threadId: string,
  inputs: QueuedThreadInput[],
  queueLength = inputs.length,
) {
  queryClient.setQueryData<ListQueuedThreadInputsResponse>(serverStateKeys.queuedInputs(threadId), {
    inputs,
    queueLength,
  });
}

export function markMessageApprovalResolvedState(
  queryClient: QueryClient,
  threadId: string,
  messageId: string,
  decision: string,
) {
  queryClient.setQueryData<ThreadDetailResponse>(serverStateKeys.thread(threadId), (current) =>
    current
      ? {
          ...current,
          messages: current.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  details: {
                    ...message.details,
                    approvalDecision: decision,
                    approvalResolved: true,
                  },
                  updatedAt: new Date().toISOString(),
                }
              : message,
          ),
        }
      : current,
  );
}

export function removeQueuedInputState(
  queryClient: QueryClient,
  threadId: string,
  inputId: string,
) {
  queryClient.setQueryData<ListQueuedThreadInputsResponse>(
    serverStateKeys.queuedInputs(threadId),
    (current) => {
      if (!current) {
        return current;
      }
      const inputs = current.inputs.filter((input) => input.id !== inputId);
      return {
        inputs,
        queueLength:
          inputs.length === current.inputs.length
            ? current.queueLength
            : Math.max(0, current.queueLength - 1),
      };
    },
  );
}

export type OptimisticSteerQueuedInputSnapshot = {
  queuedInputs?: ListQueuedThreadInputsResponse;
  threadDetail?: ThreadDetailResponse;
  threads?: ListThreadsResponse;
};

export async function optimisticallySteerQueuedInputState(
  queryClient: QueryClient,
  threadId: string,
  input: QueuedThreadInput,
): Promise<OptimisticSteerQueuedInputSnapshot> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: serverStateKeys.queuedInputs(threadId) }),
    queryClient.cancelQueries({ queryKey: serverStateKeys.thread(threadId) }),
  ]);
  const snapshot: OptimisticSteerQueuedInputSnapshot = {
    queuedInputs: queryClient.getQueryData<ListQueuedThreadInputsResponse>(
      serverStateKeys.queuedInputs(threadId),
    ),
    threadDetail: queryClient.getQueryData<ThreadDetailResponse>(serverStateKeys.thread(threadId)),
    threads: queryClient.getQueryData<ListThreadsResponse>(serverStateKeys.threads()),
  };
  removeQueuedInputState(queryClient, threadId, input.id);
  appendOptimisticSteeringMessageState(queryClient, threadId, input);
  setThreadRunningState(queryClient, threadId, true);
  return snapshot;
}

export function restoreOptimisticSteerQueuedInputState(
  queryClient: QueryClient,
  threadId: string,
  snapshot: OptimisticSteerQueuedInputSnapshot | undefined,
) {
  if (!snapshot) {
    return;
  }
  if (snapshot.queuedInputs) {
    queryClient.setQueryData(serverStateKeys.queuedInputs(threadId), snapshot.queuedInputs);
  }
  if (snapshot.threadDetail) {
    queryClient.setQueryData(serverStateKeys.thread(threadId), snapshot.threadDetail);
  }
  if (snapshot.threads) {
    queryClient.setQueryData(serverStateKeys.threads(), snapshot.threads);
  }
}

export function applyStreamEventToServerState(
  queryClient: QueryClient,
  event: StreamThreadRunEvent,
) {
  switch (event.type) {
    case "thread.message.created":
      upsertThreadState(queryClient, event.thread);
      upsertMessageState(queryClient, event.thread, event.message);
      return;
    case "thread.message.delta":
      appendMessageDeltaState(queryClient, event.threadId, event.messageId, event.delta);
      return;
    case "thread.message.completed":
      upsertThreadState(queryClient, event.thread);
      upsertMessageState(queryClient, event.thread, event.message);
      return;
    case "thread.state.changed":
      upsertThreadState(queryClient, event.thread);
      return;
    case "thread.goal.updated":
      upsertThreadState(queryClient, event.thread);
      return;
    case "thread.error":
      if (event.thread) {
        upsertThreadState(queryClient, event.thread);
      }
      return;
    case "thread.preview_target.detected":
      return;
    case "thread.input_request.created":
      upsertThreadState(queryClient, event.thread);
      upsertPendingInputRequestState(queryClient, event.request);
      return;
    case "thread.input_request.resolved":
      removePendingInputRequestState(queryClient, event.threadId, event.requestId);
      return;
  }
}

export function removePendingInputRequestState(
  queryClient: QueryClient,
  threadId: string,
  requestId: string,
) {
  queryClient.setQueryData<ThreadDetailResponse>(serverStateKeys.thread(threadId), (current) =>
    current
      ? {
          ...current,
          pendingInputRequests: (current.pendingInputRequests ?? []).filter(
            (request) => request.id !== requestId,
          ),
        }
      : current,
  );
}

function upsertPendingInputRequestState(
  queryClient: QueryClient,
  request: NonNullable<ThreadDetailResponse["pendingInputRequests"]>[number],
) {
  queryClient.setQueryData<ThreadDetailResponse>(
    serverStateKeys.thread(request.threadId),
    (current) =>
      current
        ? {
            ...current,
            pendingInputRequests: upsertById(current.pendingInputRequests ?? [], request),
          }
        : current,
  );
}

function upsertMessageState(queryClient: QueryClient, thread: ThreadSummary, message: ChatMessage) {
  queryClient.setQueryData<ThreadDetailResponse>(serverStateKeys.thread(thread.id), (current) => ({
    thread,
    messages: upsertMessage(current?.messages ?? [], message),
    pendingInputRequests: current?.pendingInputRequests ?? [],
  }));
}

function appendOptimisticSteeringMessageState(
  queryClient: QueryClient,
  threadId: string,
  input: QueuedThreadInput,
) {
  queryClient.setQueryData<ThreadDetailResponse>(serverStateKeys.thread(threadId), (current) => {
    if (!current) {
      return current;
    }
    const message: ChatMessage = {
      id: optimisticSteeringMessageId(input.id),
      threadId,
      role: "user",
      kind: "chat",
      content: promptMarkdownWithSkills(input.prompt, input.skills),
      createdAt: new Date().toISOString(),
      details: chatMessageDetailsFromPromptContext(input, { optimisticQueuedInputId: input.id }),
      state: "completed",
    };
    return {
      ...current,
      messages: upsertMessage(current.messages, message),
    };
  });
}

function optimisticSteeringMessageId(inputId: string) {
  return `${optimisticSteeringMessageIdPrefix}${inputId}`;
}

function mergeThreadDetailState(
  current: ThreadDetailResponse | undefined,
  response: ThreadDetailResponse,
) {
  if (!current || current.thread.id !== response.thread.id || current.messages.length === 0) {
    return response;
  }
  const messages = mergeMessages(current.messages, response.messages);
  return {
    ...response,
    messages,
  };
}

function mergeMessages(baseMessages: ChatMessage[], incomingMessages: ChatMessage[]) {
  const incomingById = new Map(incomingMessages.map((message) => [message.id, message]));
  const indexesById = new Map<string, number>();
  const seenIds = new Set<string>();
  const messages: ChatMessage[] = [];
  for (const candidate of [...baseMessages, ...incomingMessages]) {
    const message = incomingById.get(candidate.id) ?? candidate;
    if (seenIds.has(message.id)) {
      continue;
    }
    const replacementId = replacementMessageId(message);
    if (replacementId) {
      const replacementIndex = indexesById.get(replacementId);
      if (replacementIndex !== undefined) {
        messages[replacementIndex] = message;
        seenIds.delete(replacementId);
        seenIds.add(message.id);
        indexesById.delete(replacementId);
        indexesById.set(message.id, replacementIndex);
        continue;
      }
    }
    const lastMessage = messages[messages.length - 1];
    if (isDuplicateOptimisticQueuedMessage(lastMessage, message)) {
      messages[messages.length - 1] = message;
      seenIds.delete(lastMessage.id);
      seenIds.add(message.id);
      indexesById.delete(lastMessage.id);
      indexesById.set(message.id, messages.length - 1);
      continue;
    }
    seenIds.add(message.id);
    indexesById.set(message.id, messages.length);
    messages.push(message);
  }
  return messages;
}

function upsertMessage(messages: ChatMessage[], message: ChatMessage) {
  const existingIndex = messages.findIndex((candidate) => candidate.id === message.id);
  if (existingIndex !== -1) {
    return messages.map((candidate) => (candidate.id === message.id ? message : candidate));
  }
  const replacementId = replacementMessageId(message);
  const replacementIndex = replacementId
    ? messages.findIndex((candidate) => candidate.id === replacementId)
    : -1;
  if (replacementIndex !== -1) {
    return messages.map((candidate, index) => (index === replacementIndex ? message : candidate));
  }
  const optimisticIndex =
    message.role === "user"
      ? messages.findIndex(
          (candidate) =>
            candidate.id.startsWith(optimisticSteeringMessageIdPrefix) &&
            candidate.role === "user" &&
            candidate.content === message.content,
        )
      : -1;
  if (optimisticIndex !== -1) {
    return messages.map((candidate, index) => (index === optimisticIndex ? message : candidate));
  }
  const lastMessage = messages[messages.length - 1];
  if (isDuplicateOptimisticQueuedMessage(lastMessage, message)) {
    return messages.map((candidate, index) =>
      index === messages.length - 1 ? message : candidate,
    );
  }
  return [...messages, message];
}

function isDuplicateOptimisticQueuedMessage(
  previous: ChatMessage | undefined,
  incoming: ChatMessage,
) {
  return (
    previous?.id.startsWith(optimisticSteeringMessageIdPrefix) === true &&
    previous.threadId === incoming.threadId &&
    previous.role === incoming.role &&
    previous.content === incoming.content
  );
}

function replacementMessageId(message: ChatMessage) {
  const replacementId = message.details?.replacesMessageId;
  return typeof replacementId === "string" && replacementId.length > 0 ? replacementId : undefined;
}

function appendMessageDeltaState(
  queryClient: QueryClient,
  threadId: string,
  messageId: string,
  delta: string,
) {
  queryClient.setQueryData<ThreadDetailResponse>(serverStateKeys.thread(threadId), (current) => {
    if (!current) {
      return current;
    }
    return {
      ...current,
      messages: current.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: `${message.content}${normalizeStreamDelta(message.content, delta)}`,
              state: "streaming",
              updatedAt: new Date().toISOString(),
            }
          : message,
      ),
    };
  });
}

function normalizeStreamDelta(existingContent: string, incomingDelta: string) {
  if (!existingContent || !incomingDelta.startsWith(existingContent)) {
    return incomingDelta;
  }
  return incomingDelta.slice(existingContent.length);
}

function patchThreadState(
  queryClient: QueryClient,
  threadId: string,
  patch: Partial<ThreadSummary>,
) {
  queryClient.setQueryData<ListThreadsResponse>(serverStateKeys.threads(), (current) =>
    current
      ? {
          ...current,
          threads: sortThreads(
            current.threads.map((thread) =>
              thread.id === threadId ? { ...thread, ...patch } : thread,
            ),
          ),
        }
      : current,
  );
  queryClient.setQueryData<ThreadDetailResponse>(serverStateKeys.thread(threadId), (current) =>
    current
      ? {
          ...current,
          thread: {
            ...current.thread,
            ...patch,
          },
        }
      : current,
  );
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const existingIndex = items.findIndex((candidate) => candidate.id === item.id);
  if (existingIndex === -1) {
    return [...items, item];
  }
  return items.map((candidate) => (candidate.id === item.id ? item : candidate));
}

function sortThreads(threads: ThreadSummary[]) {
  return threads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
