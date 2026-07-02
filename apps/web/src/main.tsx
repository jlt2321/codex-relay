import {
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ListAutomationsResponseSchema,
  CreateThreadResponseSchema,
  ImageAttachmentUploadResponseSchema,
  InterruptThreadRunResponseSchema,
  ListSkillsResponseSchema,
  ListModelsResponseSchema,
  ListQueuedThreadInputsResponseSchema,
  ListThreadsResponseSchema,
  ListWorkspaceDirectoriesResponseSchema,
  ListWorkspaceFilesResponseSchema,
  PairResponseSchema,
  PairingPayloadResponseSchema,
  QueuedThreadInputActionResponseSchema,
  RateLimitsResponseSchema,
  ResolveApprovalResponseSchema,
  RuntimePreferencesResponseSchema,
  RunAutomationResponseSchema,
  StatusResponseSchema,
  SubmitThreadInputResponseSchema,
  StreamThreadRunEventSchema,
  ThreadContextWindowResponseSchema,
  ThreadDetailResponseSchema,
  ThreadGoalResponseSchema,
  ThreadMessageDetailResponseSchema,
  VersionResponseSchema,
  WorkspaceChangesResponseSchema,
  WorkspaceFileContentResponseSchema,
  WorkspaceGitActionResponseSchema,
  WorkspaceTerminalOutputResponseSchema,
  WorkspaceTerminalSessionResponseSchema,
  apiPaths,
  type AgentSkill,
  type ApprovalDecision,
  type AutomationSummary,
  type ChatMessage,
  type CodexModel,
  type ListWorkspaceDirectoriesResponse,
  type ListWorkspaceFilesResponse,
  type PairingPayloadResponse,
  type PendingInputRequest,
  type PromptAttachment,
  type PromptSkill,
  type QueuedThreadInput,
  type RateLimitsResponse,
  type ReasoningEffort,
  type RuntimeMode,
  type RuntimePreferences,
  type StatusResponse,
  type StreamThreadRunEvent,
  type ThreadContextWindowResponse,
  type ThreadDetailResponse,
  type ThreadGoalResponse,
  type ThreadGoalStatus,
  type ThreadMessageDetailField,
  type ThreadMessageDetailResponse,
  type ThreadSummary,
  type VersionResponse,
  type WebPreviewTarget,
  type WorkspaceChangesResponse,
  type WorkspaceFileContentResponse,
  type WorkspaceTerminalOutputResponse,
  type WorkspaceTerminalSessionResponse,
} from "codex-relay/api-schema";
import {
  attachApprovalCode,
  clearSecureSession,
  completeSecurePairing,
  createSecurePairingAttempt,
  decryptResponsePayload,
  encryptRequestPayload,
} from "./secure-pairing";
import "./styles.css";

const defaultRelayUrl = "http://43.143.114.214:8788";
const clientSessionIdStorageKey = "codex-relay.web.client-session-id";
const clientTokenExpiresAtStorageKey = "codex-relay.web.client-token-expires-at";
const clientTokenStorageKey = "codex-relay.web.client-token";
const relayUrlStorageKey = "codex-relay.web.relay-url";
const requestTimeoutMs = 8000;
const pairingTimeoutMs = 5 * 60 * 1000;
const messageRenderBatchSize = 40;
const messageScrollLoadThresholdPx = 96;
const runtimeModes: RuntimeMode[] = ["default", "auto", "full-access", "on-request"];
const reasoningEfforts: ReasoningEffort[] = ["minimal", "low", "medium", "high", "xhigh"];
const goalStatuses: ThreadGoalStatus[] = [
  "active",
  "paused",
  "blocked",
  "usageLimited",
  "budgetLimited",
  "complete",
];
const toolTabs: { id: ToolTab; icon: IconName; label: string }[] = [
  { id: "usage", icon: "gauge", label: "用量" },
  { id: "models", icon: "cpu", label: "模型" },
  { id: "files", icon: "file", label: "文件" },
  { id: "git", icon: "branch", label: "Git" },
  { id: "directories", icon: "folder", label: "目录" },
  { id: "skills", icon: "spark", label: "技能" },
  { id: "goal", icon: "target", label: "目标" },
  { id: "terminal", icon: "terminal", label: "终端" },
  { id: "automations", icon: "bolt", label: "自动" },
];
const toolGroups: { id: ToolGroupId; icon: IconName; label: string; tabs: ToolTab[] }[] = [
  { id: "status", icon: "gauge", label: "状态", tabs: ["usage", "models", "goal"] },
  { id: "workspace", icon: "folder", label: "工作区", tabs: ["files", "directories", "git", "skills"] },
  { id: "automations", icon: "bolt", label: "自动", tabs: ["automations"] },
  { id: "terminal", icon: "terminal", label: "终端", tabs: ["terminal"] },
];

type ProbeState = "idle" | "checking" | "online" | "needsPairing" | "offline";
type PairingState = "idle" | "starting" | "waitingApproval" | "paired" | "failed";
type ComposerMode = "reply" | "new";
type WorkspacePromptReference = { kind: "dir" | "file"; path: string };
type IconName =
  | "bolt"
  | "branch"
  | "check"
  | "close"
  | "cpu"
  | "deny"
  | "edit"
  | "external"
  | "file"
  | "folder"
  | "gauge"
  | "image"
  | "info"
  | "paperclip"
  | "play"
  | "session"
  | "patch"
  | "refresh"
  | "save"
  | "search"
  | "send"
  | "shield"
  | "spark"
  | "stop"
  | "target"
  | "terminal"
  | "threads"
  | "trash"
  | "tools"
  | "up";
type ToolGroupId = "status" | "workspace" | "automations" | "terminal";
type ToolTab =
  | "usage"
  | "models"
  | "files"
  | "git"
  | "directories"
  | "skills"
  | "goal"
  | "terminal"
  | "automations";

type ProbeResult = {
  checkedAt: Date | null;
  errorMessage: string | null;
  latencyMs: number | null;
  state: ProbeState;
  status: StatusResponse | null;
  version: VersionResponse | null;
};

type PairingResult = {
  approvalCode: string | null;
  errorMessage: string | null;
  expiresAt: string | null;
  serverUrl: string | null;
  state: PairingState;
};

type PairingQrPayload = {
  serverPublicKey: string;
  serverUrl: string;
  serverUrls: string[];
};

type JsonResult =
  | {
      body: unknown;
      ok: true;
      status: number;
    }
  | {
      body: unknown;
      ok: false;
      status: number;
    };

type ThreadWorkspace = {
  detail: ThreadDetailResponse | null;
  errorMessage: string | null;
  isDetailLoading: boolean;
  isStreaming: boolean;
  messageDetailsByKey: Record<string, ThreadMessageDetailResponse | undefined>;
  pendingInputRequests: PendingInputRequest[];
  previewTarget: WebPreviewTarget | null;
  queuedInputs: QueuedThreadInput[];
  selectedThreadId: string | null;
  source: string | null;
  streamStatus: string | null;
  threads: ThreadSummary[];
};

type ToolsState = {
  activeTab: ToolTab;
  automationRunMessage: string | null;
  automations: AutomationSummary[];
  directories: ListWorkspaceDirectoriesResponse | null;
  directoryPath: string;
  errorMessage: string | null;
  fileContent: WorkspaceFileContentResponse | null;
  fileDirectory: string;
  fileSaveMessage: string | null;
  files: ListWorkspaceFilesResponse | null;
  fileSearch: string;
  git: WorkspaceChangesResponse | null;
  gitActionMessage: string | null;
  isLoading: boolean;
  isOpen: boolean;
  models: CodexModel[];
  modelSaveMessage: string | null;
  preferencesDraft: RuntimePreferences;
  rateLimits: RateLimitsResponse | null;
  selectedFilePath: string | null;
  contextWindow: ThreadContextWindowResponse | null;
  goal: ThreadGoalResponse | null;
  goalDraft: {
    objective: string;
    status: ThreadGoalStatus | "";
    tokenBudget: string;
  };
  skills: AgentSkill[];
};

type TerminalState = {
  command: string;
  errorMessage: string | null;
  isLoading: boolean;
  nextSeq: number;
  output: WorkspaceTerminalOutputResponse["chunks"];
  session: WorkspaceTerminalSessionResponse | null;
};

type DangerPrompt = {
  confirmLabel: string;
  detail: string;
  requireText?: string;
  run: () => Promise<void>;
  summary: string;
  title: string;
};

const initialProbeResult: ProbeResult = {
  checkedAt: null,
  errorMessage: null,
  latencyMs: null,
  state: "idle",
  status: null,
  version: null,
};

const initialPairingResult: PairingResult = {
  approvalCode: null,
  errorMessage: null,
  expiresAt: null,
  serverUrl: null,
  state: "idle",
};

const initialThreadWorkspace: ThreadWorkspace = {
  detail: null,
  errorMessage: null,
  isDetailLoading: false,
  isStreaming: false,
  messageDetailsByKey: {},
  pendingInputRequests: [],
  previewTarget: null,
  queuedInputs: [],
  selectedThreadId: null,
  source: null,
  streamStatus: null,
  threads: [],
};

const initialToolsState: ToolsState = {
  activeTab: "usage",
  automationRunMessage: null,
  automations: [],
  contextWindow: null,
  directories: null,
  directoryPath: "",
  errorMessage: null,
  fileContent: null,
  fileDirectory: "",
  fileSaveMessage: null,
  files: null,
  fileSearch: "",
  git: null,
  gitActionMessage: null,
  isLoading: false,
  isOpen: false,
  models: [],
  modelSaveMessage: null,
  preferencesDraft: { runtimeMode: "default" },
  rateLimits: null,
  selectedFilePath: null,
  goal: null,
  goalDraft: {
    objective: "",
    status: "",
    tokenBudget: "",
  },
  skills: [],
};

const initialTerminalState: TerminalState = {
  command: "",
  errorMessage: null,
  isLoading: false,
  nextSeq: 0,
  output: [],
  session: null,
};

function App() {
  const [relayUrlInput, setRelayUrlInput] = useState(readInitialRelayUrl);
  const [relayUrl, setRelayUrl] = useState(() => normalizeRelayUrl(readInitialRelayUrl()));
  const [pairingInput, setPairingInput] = useState("");
  const [pairing, setPairing] = useState<PairingResult>(initialPairingResult);
  const [probe, setProbe] = useState<ProbeResult>(initialProbeResult);
  const [dangerPrompt, setDangerPrompt] = useState<DangerPrompt | null>(null);
  const [terminal, setTerminal] = useState<TerminalState>(initialTerminalState);
  const [tools, setTools] = useState<ToolsState>(initialToolsState);
  const [workspace, setWorkspace] = useState<ThreadWorkspace>(initialThreadWorkspace);
  const [composerMode, setComposerMode] = useState<ComposerMode>("reply");
  const [prompt, setPrompt] = useState("");
  const [promptAttachments, setPromptAttachments] = useState<PromptAttachment[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<PromptSkill[]>([]);
  const [workspaceOverride, setWorkspaceOverride] = useState<string | null>(null);
  const [threadSearch, setThreadSearch] = useState("");
  const [isConnectionSheetOpen, setConnectionSheetOpen] = useState(false);
  const [isThreadDrawerOpen, setThreadDrawerOpen] = useState(false);
  const [isAttachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [isThreadsLoading, setThreadsLoading] = useState(false);
  const [isUploadingAttachment, setUploadingAttachment] = useState(false);
  const [isMessageListNearBottom, setMessageListNearBottom] = useState(true);
  const [visibleMessageCount, setVisibleMessageCount] = useState(messageRenderBatchSize);
  const [loadingDetailKeys, setLoadingDetailKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [resolvingApprovalIds, setResolvingApprovalIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const streamAbortRef = useRef<AbortController | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const pendingThreadBottomScrollRef = useRef<string | null>(null);
  const pendingMessageScrollRestoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(
    null,
  );

  const statusText = useMemo(() => statusLabel(probe.state), [probe.state]);
  const selectedThread = useMemo(
    () => workspace.threads.find((thread) => thread.id === workspace.selectedThreadId) ?? null,
    [workspace.selectedThreadId, workspace.threads],
  );
  const messages = workspace.detail?.messages ?? [];
  const promptWorkspaceContext = useMemo(() => parseWorkspacePromptReferences(prompt), [prompt]);
  const promptWorkspaceReferences = promptWorkspaceContext.references;
  const promptBody = promptWorkspaceContext.body;
  const visibleMessages = useMemo(
    () => messages.slice(Math.max(0, messages.length - visibleMessageCount)),
    [messages, visibleMessageCount],
  );
  const hiddenMessageCount = Math.max(0, messages.length - visibleMessages.length);
  const canUseThreads = probe.state === "online";
  const currentWorkspacePath =
    selectedThread?.cwd ?? workspaceOverride ?? probe.status?.workspacePath ?? undefined;
  const filteredThreads = useMemo(
    () => filterThreads(workspace.threads, threadSearch),
    [threadSearch, workspace.threads],
  );
  const updateMessageListBottomState = useCallback((options: { loadOlder?: boolean } = {}) => {
    const element = messageListRef.current;
    if (!element) {
      setMessageListNearBottom(true);
      return;
    }
    if (
      options.loadOlder !== false &&
      element.scrollTop <= messageScrollLoadThresholdPx &&
      hiddenMessageCount > 0
    ) {
      pendingMessageScrollRestoreRef.current = {
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      };
      setVisibleMessageCount((current) =>
        Math.min(messages.length, current + messageRenderBatchSize),
      );
    }
    setMessageListNearBottom(isScrollContainerNearBottom(element));
  }, [hiddenMessageCount, messages.length]);

  useLayoutEffect(() => {
    const pending = pendingMessageScrollRestoreRef.current;
    const element = messageListRef.current;
    if (!pending || !element) {
      return;
    }
    pendingMessageScrollRestoreRef.current = null;
    const addedHeight = Math.max(0, element.scrollHeight - pending.scrollHeight);
    element.scrollTop = pending.scrollTop + addedHeight;
    setMessageListNearBottom(isScrollContainerNearBottom(element));
  }, [messages.length, visibleMessageCount]);

  useEffect(() => {
    pendingMessageScrollRestoreRef.current = null;
    pendingThreadBottomScrollRef.current = workspace.selectedThreadId;
    setVisibleMessageCount(messageRenderBatchSize);
  }, [workspace.selectedThreadId]);

  useLayoutEffect(() => {
    const pendingThreadId = pendingThreadBottomScrollRef.current;
    const element = messageListRef.current;
    if (
      !pendingThreadId ||
      pendingThreadId !== workspace.selectedThreadId ||
      workspace.isDetailLoading ||
      !element
    ) {
      return;
    }
    pendingThreadBottomScrollRef.current = null;
    element.scrollTop = element.scrollHeight;
    setMessageListNearBottom(true);
  }, [messages.length, visibleMessageCount, workspace.isDetailLoading, workspace.selectedThreadId]);

  const scrollMessageListToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = messageListRef.current;
    if (!element) {
      return;
    }
    element.scrollTo({ behavior, top: element.scrollHeight });
    window.setTimeout(updateMessageListBottomState, behavior === "smooth" ? 320 : 0);
  }, [updateMessageListBottomState]);

  useEffect(() => {
    updateMessageListBottomState({ loadOlder: false });
  }, [
    messages.length,
    workspace.pendingInputRequests.length,
    workspace.previewTarget,
    workspace.queuedInputs.length,
    updateMessageListBottomState,
  ]);

  useEffect(() => {
    if (!workspace.streamStatus) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setWorkspace((current) =>
        current.streamStatus === workspace.streamStatus
          ? { ...current, streamStatus: null }
          : current,
      );
    }, 15_000);
    return () => window.clearTimeout(timeout);
  }, [workspace.streamStatus]);

  const dismissStreamStatus = useCallback(() => {
    setWorkspace((current) => ({ ...current, streamStatus: null }));
  }, []);

  const runProbe = useCallback(async () => {
    const normalizedUrl = normalizeRelayUrl(relayUrlInput);
    setRelayUrlInput(normalizedUrl);
    setRelayUrl(normalizedUrl);
    localStorage.setItem(relayUrlStorageKey, normalizedUrl);
    setProbe((current) => ({ ...current, errorMessage: null, state: "checking" }));

    const startedAt = performance.now();

    try {
      const version = await relayRequest(`${normalizedUrl}${apiPaths.version}`, {
        parse: VersionResponseSchema.parse,
        withAuth: false,
      });
      const statusResult = await fetchJson(`${normalizedUrl}${apiPaths.status}`, {
        headers: requestHeaders(),
      });
      const latencyMs = Math.round(performance.now() - startedAt);

      if (statusResult.status === 401) {
        setProbe({
          checkedAt: new Date(),
          errorMessage: responseErrorMessage(statusResult.body, statusResult.status),
          latencyMs,
          state: "needsPairing",
          status: null,
          version,
        });
        return;
      }

      if (!statusResult.ok) {
        throw new Error(responseErrorMessage(statusResult.body, statusResult.status));
      }

      const status = StatusResponseSchema.parse(decryptResponsePayload(statusResult.body));
      setProbe({
        checkedAt: new Date(),
        errorMessage: null,
        latencyMs,
        state: "online",
        status,
        version,
      });
    } catch (error) {
      setProbe({
        checkedAt: new Date(),
        errorMessage: errorMessage(error),
        latencyMs: Math.round(performance.now() - startedAt),
        state: "offline",
        status: null,
        version: null,
      });
    }
  }, [relayUrlInput]);

  const loadThreadDetail = useCallback(
    async (threadId: string) => {
      setWorkspace((current) => ({
        ...current,
        errorMessage: null,
        isDetailLoading: true,
        selectedThreadId: threadId,
      }));
      try {
        const detail = await relayRequest(`${relayUrl}${apiPaths.thread(threadId)}`, {
          parse: ThreadDetailResponseSchema.parse,
        });
        const queuedInputs = await relayRequest(`${relayUrl}${apiPaths.threadInput(threadId)}`, {
          parse: ListQueuedThreadInputsResponseSchema.parse,
        }).catch(() => ({ inputs: [], queueLength: 0 }));
        setWorkspace((current) => ({
          ...current,
          detail,
          errorMessage: null,
          isDetailLoading: false,
          pendingInputRequests: detail.pendingInputRequests,
          queuedInputs: queuedInputs.inputs,
          selectedThreadId: threadId,
          threads: upsertThread(current.threads, detail.thread),
        }));
      } catch (error) {
        setWorkspace((current) => ({
          ...current,
          errorMessage: errorMessage(error),
          isDetailLoading: false,
        }));
      }
    },
    [relayUrl],
  );

  const loadThreads = useCallback(
    async (options: { keepSelection?: boolean } = {}) => {
      if (probe.state !== "online") {
        return;
      }
      setThreadsLoading(true);
      setWorkspace((current) => ({ ...current, errorMessage: null }));
      try {
        const response = await relayRequest(`${relayUrl}${apiPaths.threads}`, {
          parse: ListThreadsResponseSchema.parse,
        });
        const selectedThreadId =
          options.keepSelection && workspace.selectedThreadId
            ? workspace.selectedThreadId
            : (workspace.selectedThreadId ?? response.threads[0]?.id ?? null);
        setWorkspace((current) => ({
          ...current,
          selectedThreadId,
          source: response.source,
          threads: response.threads,
        }));
        if (selectedThreadId) {
          await loadThreadDetail(selectedThreadId);
        }
      } catch (error) {
        setWorkspace((current) => ({ ...current, errorMessage: errorMessage(error) }));
      } finally {
        setThreadsLoading(false);
      }
    },
    [loadThreadDetail, probe.state, relayUrl, workspace.selectedThreadId],
  );

  const startPairingWithInput = useCallback(async () => {
    try {
      const payload = parsePairingQrPayload(pairingInput);
      await pairWithPayload(payload, runProbe, setPairing);
    } catch (error) {
      setPairing({
        approvalCode: null,
        errorMessage: errorMessage(error),
        expiresAt: null,
        serverUrl: null,
        state: "failed",
      });
    }
  }, [pairingInput, runProbe]);

  const startPairingFromRelay = useCallback(async () => {
    setPairing({
      approvalCode: null,
      errorMessage: null,
      expiresAt: null,
      serverUrl: relayUrl,
      state: "starting",
    });

    try {
      const payloadResponse = await relayRequest(`${relayUrl}${apiPaths.pairPayload}`, {
        parse: PairingPayloadResponseSchema.parse,
        withAuth: false,
      });
      setPairingInput(payloadResponse.pairingPayload);
      await pairWithPayload(parsePairingPayloadResponse(payloadResponse), runProbe, setPairing);
    } catch (error) {
      setPairing({
        approvalCode: null,
        errorMessage: errorMessage(error),
        expiresAt: null,
        serverUrl: relayUrl,
        state: "failed",
      });
    }
  }, [relayUrl, runProbe]);

  const signOut = useCallback(() => {
    localStorage.removeItem(clientTokenStorageKey);
    localStorage.removeItem(clientTokenExpiresAtStorageKey);
    clearSecureSession();
    streamAbortRef.current?.abort();
    setPairing(initialPairingResult);
    setWorkspace(initialThreadWorkspace);
    void runProbe();
  }, [runProbe]);

  const startThreadStream = useCallback(
    async (threadId: string, body: { attachments?: PromptAttachment[]; prompt?: string; skills?: PromptSkill[] }) => {
      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;
      setWorkspace((current) => ({
        ...current,
        errorMessage: null,
        isStreaming: true,
        selectedThreadId: threadId,
        streamStatus: body.prompt ? "运行中" : "同步运行中线程",
      }));

      try {
        await streamRelayEvents({
          body,
          signal: controller.signal,
          threadId,
          url: `${relayUrl}${apiPaths.threadRunStream(threadId)}`,
          onEvent: (event) => {
            setWorkspace((current) => applyStreamEvent(current, event, threadId));
          },
        });
        setWorkspace((current) => ({
          ...current,
          isStreaming: false,
          streamStatus: "已完成",
        }));
        await loadThreadDetail(threadId);
        void loadThreads({ keepSelection: true });
      } catch (error) {
        if (controller.signal.aborted) {
          setWorkspace((current) => ({
            ...current,
            isStreaming: false,
            streamStatus: "已停止",
          }));
          return;
        }
        setWorkspace((current) => ({
          ...current,
          errorMessage: errorMessage(error),
          isStreaming: false,
          streamStatus: "失败",
        }));
      } finally {
        if (streamAbortRef.current === controller) {
          streamAbortRef.current = null;
        }
      }
    },
    [loadThreadDetail, loadThreads, relayUrl],
  );

  const submitPrompt = useCallback(async () => {
    const text = prompt.trim();
    if (!text) {
      return;
    }
    setPrompt("");
    const runContext = promptRunContext(text, {
      attachments: promptAttachments,
      skills: selectedSkills,
    });

    try {
      if (composerMode === "new" || !workspace.selectedThreadId) {
        const created = await relayRequest(`${relayUrl}${apiPaths.threads}`, {
          body: {
            title: promptTitle(text),
            workspacePath: currentWorkspacePath,
          },
          method: "POST",
          parse: CreateThreadResponseSchema.parse,
        });
        setWorkspace((current) => ({
          ...current,
          detail: {
            messages: created.messages,
            pendingInputRequests: [],
            thread: created.thread,
          },
          selectedThreadId: created.thread.id,
          threads: upsertThread(current.threads, created.thread),
        }));
        setComposerMode("reply");
        setPromptAttachments([]);
        await startThreadStream(created.thread.id, runContext);
        return;
      }

      if (selectedThread?.state === "running") {
        const response = await relayRequest(`${relayUrl}${apiPaths.threadInput(workspace.selectedThreadId)}`, {
          body: runContext,
          method: "POST",
          parse: SubmitThreadInputResponseSchema.parse,
        });
        setPromptAttachments([]);
        setWorkspace((current) => ({
          ...current,
          queuedInputs: response.input
            ? upsertById(current.queuedInputs, response.input)
            : current.queuedInputs,
          streamStatus:
            response.acceptedAs === "steering" ? "已作为 steering 发送" : "已加入运行队列",
          threads: upsertThread(current.threads, response.thread),
        }));
        return;
      }

      setPromptAttachments([]);
      await startThreadStream(workspace.selectedThreadId, runContext);
    } catch (error) {
      setPrompt(text);
      setWorkspace((current) => ({
        ...current,
        errorMessage: errorMessage(error),
        isStreaming: false,
      }));
    }
  }, [
    composerMode,
    currentWorkspacePath,
    prompt,
    promptAttachments,
    relayUrl,
    selectedThread?.state,
    selectedSkills,
    startThreadStream,
    workspace.selectedThreadId,
  ]);

  const attachSelectedStream = useCallback(() => {
    if (!workspace.selectedThreadId || workspace.isStreaming) {
      return;
    }
    void startThreadStream(workspace.selectedThreadId, {});
  }, [startThreadStream, workspace.isStreaming, workspace.selectedThreadId]);

  const stopStream = useCallback(async () => {
    const threadId = workspace.selectedThreadId;
    streamAbortRef.current?.abort();
    setWorkspace((current) => ({
      ...current,
      isStreaming: false,
      streamStatus: "正在停止",
    }));
    if (!threadId) {
      return;
    }
    try {
      const response = await relayRequest(`${relayUrl}${apiPaths.threadRunInterrupt(threadId)}`, {
        method: "POST",
        parse: InterruptThreadRunResponseSchema.parse,
      });
      setWorkspace((current) => ({
        ...current,
        streamStatus: "已停止",
        threads: upsertThread(current.threads, response.thread),
      }));
      await loadThreadDetail(threadId);
    } catch (error) {
      setWorkspace((current) => ({
        ...current,
        errorMessage: errorMessage(error),
        streamStatus: "停止请求失败",
      }));
    }
  }, [loadThreadDetail, relayUrl, workspace.selectedThreadId]);

  const updatePromptBody = useCallback((body: string) => {
    setPrompt((current) => {
      const currentContext = parseWorkspacePromptReferences(current);
      const nextBodyContext = parseWorkspacePromptReferences(body);
      return promptWithWorkspaceReferences(nextBodyContext.body, [
        ...currentContext.references,
        ...nextBodyContext.references,
      ]);
    });
  }, []);

  const removeWorkspaceReference = useCallback((reference: WorkspacePromptReference) => {
    setPrompt((current) => {
      const context = parseWorkspacePromptReferences(current);
      return promptWithWorkspaceReferences(
        context.body,
        context.references.filter(
          (candidate) => candidate.kind !== reference.kind || candidate.path !== reference.path,
        ),
      );
    });
  }, []);

  const resolveApproval = useCallback(
    async (message: ChatMessage, decision: ApprovalDecision, answers?: string[]) => {
      const approvalId = stringDetail(message.details, "approvalId");
      if (!approvalId || resolvingApprovalIds.has(approvalId)) {
        return;
      }
      setResolvingApprovalIds((current) => new Set([...current, approvalId]));
      try {
        await relayRequest(`${relayUrl}${apiPaths.approval(approvalId)}`, {
          body: { decision, answers },
          method: "POST",
          parse: ResolveApprovalResponseSchema.parse,
        });
        setWorkspace((current) => markApprovalResolved(current, message.id, decision));
      } catch (error) {
        setWorkspace((current) => ({ ...current, errorMessage: errorMessage(error) }));
      } finally {
        setResolvingApprovalIds((current) => {
          const next = new Set(current);
          next.delete(approvalId);
          return next;
        });
      }
    },
    [relayUrl, resolvingApprovalIds],
  );

  const resolveInputRequest = useCallback(
    async (request: PendingInputRequest, answers: string[]) => {
      if (resolvingApprovalIds.has(request.id)) {
        return;
      }
      setResolvingApprovalIds((current) => new Set([...current, request.id]));
      try {
        await relayRequest(`${relayUrl}${apiPaths.approval(request.id)}`, {
          body: { decision: "approve", answers: answers.filter((answer) => answer.trim()) },
          method: "POST",
          parse: ResolveApprovalResponseSchema.parse,
        });
        setWorkspace((current) => ({
          ...current,
          pendingInputRequests: current.pendingInputRequests.filter(
            (pending) => pending.id !== request.id,
          ),
        }));
      } catch (error) {
        setWorkspace((current) => ({ ...current, errorMessage: errorMessage(error) }));
      } finally {
        setResolvingApprovalIds((current) => {
          const next = new Set(current);
          next.delete(request.id);
          return next;
        });
      }
    },
    [relayUrl, resolvingApprovalIds],
  );

  const removeQueuedInput = useCallback(
    async (inputId: string) => {
      if (!workspace.selectedThreadId) {
        return;
      }
      try {
        const response = await relayRequest(
          `${relayUrl}${apiPaths.threadQueuedInput(workspace.selectedThreadId, inputId)}`,
          {
            method: "DELETE",
            parse: QueuedThreadInputActionResponseSchema.parse,
          },
        );
        setWorkspace((current) => ({
          ...current,
          queuedInputs: current.queuedInputs.filter((input) => input.id !== inputId),
          threads: upsertThread(current.threads, response.thread),
        }));
      } catch (error) {
        setWorkspace((current) => ({ ...current, errorMessage: errorMessage(error) }));
      }
    },
    [relayUrl, workspace.selectedThreadId],
  );

  const steerQueuedInput = useCallback(
    async (inputId: string) => {
      if (!workspace.selectedThreadId) {
        return;
      }
      try {
        const response = await relayRequest(
          `${relayUrl}${apiPaths.threadQueuedInputSteer(workspace.selectedThreadId, inputId)}`,
          {
            method: "POST",
            parse: QueuedThreadInputActionResponseSchema.parse,
          },
        );
        setWorkspace((current) => ({
          ...current,
          queuedInputs: current.queuedInputs.filter((input) => input.id !== inputId),
          streamStatus: "已将队列输入切为当前 steering",
          threads: upsertThread(current.threads, response.thread),
        }));
        if (!workspace.isStreaming) {
          void startThreadStream(workspace.selectedThreadId, {});
        }
      } catch (error) {
        setWorkspace((current) => ({ ...current, errorMessage: errorMessage(error) }));
      }
    },
    [relayUrl, startThreadStream, workspace.isStreaming, workspace.selectedThreadId],
  );

  const loadMessageDetail = useCallback(
    async (message: ChatMessage, field: ThreadMessageDetailField) => {
      const key = messageDetailKey(message.id, field);
      if (workspace.messageDetailsByKey[key] || loadingDetailKeys.has(key)) {
        return;
      }
      setLoadingDetailKeys((current) => new Set([...current, key]));
      try {
        const detail = await relayRequest(
          `${relayUrl}${apiPaths.threadMessageDetail(message.threadId, message.id, field)}`,
          {
            parse: ThreadMessageDetailResponseSchema.parse,
          },
        );
        setWorkspace((current) => ({
          ...current,
          messageDetailsByKey: {
            ...current.messageDetailsByKey,
            [key]: detail,
          },
        }));
      } catch (error) {
        setWorkspace((current) => ({ ...current, errorMessage: errorMessage(error) }));
      } finally {
        setLoadingDetailKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [loadingDetailKeys, relayUrl, workspace.messageDetailsByKey],
  );

  const requestDangerousOperation = useCallback((prompt: DangerPrompt) => {
    setDangerPrompt(prompt);
  }, []);

  const requestApprovalDecision = useCallback(
    (message: ChatMessage, decision: ApprovalDecision) => {
      const approvalId = stringDetail(message.details, "approvalId");
      if (!approvalId || resolvingApprovalIds.has(approvalId)) {
        return;
      }
      const copy = approvalDecisionCopy(decision);
      requestDangerousOperation({
        confirmLabel: copy.confirmLabel,
        detail: [
          `approval: ${approvalId}`,
          `thread: ${message.threadId}`,
          `decision: ${decision}`,
          "",
          compactText(message.content || "(empty)", 520),
        ].join("\n"),
        run: () => resolveApproval(message, decision),
        summary: copy.summary,
        title: copy.title,
      });
    },
    [requestDangerousOperation, resolveApproval, resolvingApprovalIds],
  );

  const loadToolTab = useCallback(
    async (tab: ToolTab = tools.activeTab) => {
      if (probe.state !== "online") {
        return;
      }
      setTools((current) => ({
        ...current,
        activeTab: tab,
        automationRunMessage: tab === "automations" ? current.automationRunMessage : null,
        errorMessage: null,
        fileSaveMessage: tab === "files" ? current.fileSaveMessage : null,
        gitActionMessage: tab === "git" ? current.gitActionMessage : null,
        isLoading: true,
        modelSaveMessage: null,
      }));

      try {
        if (tab === "usage") {
          const [rateLimits, contextWindow] = await Promise.all([
            relayRequest(`${relayUrl}${apiPaths.rateLimits}`, {
              parse: RateLimitsResponseSchema.parse,
            }),
            workspace.selectedThreadId
              ? relayRequest(`${relayUrl}${apiPaths.threadContextWindow(workspace.selectedThreadId)}`, {
                  parse: ThreadContextWindowResponseSchema.parse,
                }).catch(() => null)
              : Promise.resolve(null),
          ]);
          setTools((current) => ({
            ...current,
            contextWindow,
            errorMessage: null,
            isLoading: false,
            rateLimits,
          }));
          return;
        }

        if (tab === "models") {
          const response = await relayRequest(`${relayUrl}${apiPaths.models}`, {
            parse: ListModelsResponseSchema.parse,
          });
          setTools((current) => ({
            ...current,
            errorMessage: null,
            isLoading: false,
            models: response.models,
            preferencesDraft: probe.status?.preferences ?? current.preferencesDraft,
          }));
          return;
        }

        if (tab === "files") {
          const response = await relayRequest(
            `${relayUrl}${apiPaths.workspaceFiles}?${queryString({
              directory: tools.fileDirectory,
              query: tools.fileSearch,
              workspacePath: currentWorkspacePath,
            })}`,
            {
              parse: ListWorkspaceFilesResponseSchema.parse,
            },
          );
          setTools((current) => ({
            ...current,
            errorMessage: null,
            files: response,
            isLoading: false,
          }));
          return;
        }

        if (tab === "git") {
          const response = await relayRequest(
            `${relayUrl}${apiPaths.workspaceChanges}?${queryString({
              workspacePath: currentWorkspacePath,
            })}`,
            {
              parse: WorkspaceChangesResponseSchema.parse,
            },
          );
          setTools((current) => ({
            ...current,
            errorMessage: null,
            git: response,
            isLoading: false,
          }));
          return;
        }

        if (tab === "directories") {
          const response = await relayRequest(
            `${relayUrl}${apiPaths.workspaceDirectories}?${queryString({
              path: tools.directoryPath || currentWorkspacePath,
            })}`,
            {
              parse: ListWorkspaceDirectoriesResponseSchema.parse,
            },
          );
          setTools((current) => ({
            ...current,
            directories: response,
            directoryPath: response.path,
            errorMessage: null,
            isLoading: false,
          }));
          return;
        }

        if (tab === "skills") {
          const response = await relayRequest(
            `${relayUrl}${apiPaths.skills}?${queryString({
              workspacePath: currentWorkspacePath,
            })}`,
            {
              parse: ListSkillsResponseSchema.parse,
            },
          );
          setTools((current) => ({
            ...current,
            errorMessage: null,
            isLoading: false,
            skills: response.skills,
          }));
          return;
        }

        if (tab === "goal") {
          if (!workspace.selectedThreadId) {
            setTools((current) => ({
              ...current,
              errorMessage: "请先选择一个会话。",
              isLoading: false,
            }));
            return;
          }
          const response = await relayRequest(`${relayUrl}${apiPaths.threadGoal(workspace.selectedThreadId)}`, {
            parse: ThreadGoalResponseSchema.parse,
          });
          setTools((current) => ({
            ...current,
            errorMessage: null,
            goal: response,
            goalDraft: {
              objective: response.goal?.objective ?? "",
              status: response.goal?.status ?? "",
              tokenBudget: response.goal?.tokenBudget?.toString() ?? "",
            },
            isLoading: false,
          }));
          return;
        }

        if (tab === "automations") {
          const response = await relayRequest(`${relayUrl}${apiPaths.automations}`, {
            parse: ListAutomationsResponseSchema.parse,
          });
          setTools((current) => ({
            ...current,
            automations: response.automations,
            errorMessage: null,
            isLoading: false,
          }));
          return;
        }
      } catch (error) {
        setTools((current) => ({
          ...current,
          errorMessage: errorMessage(error),
          isLoading: false,
        }));
      }
    },
    [
      currentWorkspacePath,
      probe.state,
      probe.status?.preferences,
      relayUrl,
      tools.activeTab,
      tools.directoryPath,
      tools.fileDirectory,
      tools.fileSearch,
      workspace.selectedThreadId,
    ],
  );

  const openTools = useCallback(
    (tab: ToolTab = tools.activeTab) => {
      setTools((current) => ({ ...current, activeTab: tab, isOpen: true }));
      void loadToolTab(tab);
    },
    [loadToolTab, tools.activeTab],
  );

  const selectToolTab = useCallback(
    (tab: ToolTab) => {
      setTools((current) => ({ ...current, activeTab: tab }));
      void loadToolTab(tab);
    },
    [loadToolTab],
  );

  const saveRuntimePreferences = useCallback(async () => {
    setTools((current) => ({
      ...current,
      errorMessage: null,
      isLoading: true,
      modelSaveMessage: null,
    }));
    try {
      const draft = tools.preferencesDraft;
      const response = await relayRequest(`${relayUrl}${apiPaths.preferences}`, {
        body: {
          model: draft.model?.trim() ? draft.model.trim() : null,
          reasoningEffort: draft.reasoningEffort ?? null,
          runtimeMode: draft.runtimeMode,
          serviceTier: draft.serviceTier?.trim() ? draft.serviceTier.trim() : null,
          workspacePath: currentWorkspacePath,
        },
        method: "PATCH",
        parse: RuntimePreferencesResponseSchema.parse,
      });
      setProbe((current) =>
        current.status
          ? {
              ...current,
              status: {
                ...current.status,
                preferences: response.preferences,
                runtimePreferencesByWorkspacePath: response.runtimePreferencesByWorkspacePath,
              },
            }
          : current,
      );
      setTools((current) => ({
        ...current,
        errorMessage: null,
        isLoading: false,
        modelSaveMessage: "模型设置已保存",
        preferencesDraft: response.preferences,
      }));
    } catch (error) {
      setTools((current) => ({
        ...current,
        errorMessage: errorMessage(error),
        isLoading: false,
      }));
    }
  }, [currentWorkspacePath, relayUrl, tools.preferencesDraft]);

  const saveThreadGoal = useCallback(async () => {
    if (!workspace.selectedThreadId) {
      setTools((current) => ({ ...current, errorMessage: "请先选择一个会话。" }));
      return;
    }
    const objective = tools.goalDraft.objective.trim();
    const tokenBudget = tools.goalDraft.tokenBudget.trim();
    setTools((current) => ({ ...current, errorMessage: null, isLoading: true }));
    try {
      const response = await relayRequest(`${relayUrl}${apiPaths.threadGoal(workspace.selectedThreadId)}`, {
        body: {
          ...(objective ? { objective } : {}),
          ...(tools.goalDraft.status ? { status: tools.goalDraft.status } : {}),
          tokenBudget: tokenBudget ? Number(tokenBudget) : null,
        },
        method: "POST",
        parse: ThreadGoalResponseSchema.parse,
      });
      setWorkspace((current) => ({
        ...current,
        detail:
          current.detail && current.detail.thread.id === response.thread.id
            ? { ...current.detail, thread: response.thread }
            : current.detail,
        threads: upsertThread(current.threads, response.thread),
      }));
      setTools((current) => ({
        ...current,
        errorMessage: null,
        goal: response,
        goalDraft: {
          objective: response.goal?.objective ?? "",
          status: response.goal?.status ?? "",
          tokenBudget: response.goal?.tokenBudget?.toString() ?? "",
        },
        isLoading: false,
      }));
    } catch (error) {
      setTools((current) => ({
        ...current,
        errorMessage: errorMessage(error),
        isLoading: false,
      }));
    }
  }, [relayUrl, tools.goalDraft, workspace.selectedThreadId]);

  const browseDirectory = useCallback(
    async (path: string) => {
      setTools((current) => ({
        ...current,
        directoryPath: path,
        errorMessage: null,
        isLoading: true,
      }));
      try {
        const response = await relayRequest(
          `${relayUrl}${apiPaths.workspaceDirectories}?${queryString({ path })}`,
          {
            parse: ListWorkspaceDirectoriesResponseSchema.parse,
          },
        );
        setTools((current) => ({
          ...current,
          directories: response,
          directoryPath: response.path,
          errorMessage: null,
          isLoading: false,
        }));
      } catch (error) {
        setTools((current) => ({
          ...current,
          errorMessage: errorMessage(error),
          isLoading: false,
        }));
      }
    },
    [relayUrl],
  );

  const toggleSkill = useCallback((skill: AgentSkill) => {
    const promptSkill: PromptSkill = { name: skill.name, path: skill.path };
    setSelectedSkills((current) =>
      current.some((selected) => selected.name === promptSkill.name && selected.path === promptSkill.path)
        ? current.filter(
            (selected) => selected.name !== promptSkill.name || selected.path !== promptSkill.path,
          )
        : current.length >= 12
          ? current
          : [...current, promptSkill],
    );
  }, []);

  const removeAttachment = useCallback((path: string | undefined) => {
    if (!path) {
      return;
    }
    setPromptAttachments((current) => current.filter((attachment) => attachment.path !== path));
  }, []);

  const uploadAttachments = useCallback(
    async (files: FileList | null) => {
      const imageFiles = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        return;
      }
      setUploadingAttachment(true);
      setWorkspace((current) => ({ ...current, errorMessage: null }));
      try {
        const response = await uploadImageAttachments(`${relayUrl}${apiPaths.imageAttachments}`, imageFiles);
        setPromptAttachments((current) => [...current, ...response.attachments].slice(0, 6));
      } catch (error) {
        setWorkspace((current) => ({ ...current, errorMessage: errorMessage(error) }));
      } finally {
        setUploadingAttachment(false);
      }
    },
    [relayUrl],
  );

  const appendWorkspaceReferenceToPrompt = useCallback((kind: "dir" | "file", path: string) => {
    setPrompt((current) => {
      const context = parseWorkspacePromptReferences(current);
      return promptWithWorkspaceReferences(context.body, [...context.references, { kind, path }]);
    });
    setTools((current) => ({ ...current, isOpen: false }));
  }, []);

  const openAttachmentWorkspaceTool = useCallback(
    (tab: Extract<ToolTab, "files" | "directories">) => {
      setAttachmentMenuOpen(false);
      openTools(tab);
    },
    [openTools],
  );

  const fetchTerminalOutput = useCallback(
    async (sessionId: string, since: number) => {
      const response = await relayRequest(`${relayUrl}${apiPaths.workspaceTerminalOutput(sessionId)}?${queryString({
        since: String(since),
      })}`, {
        parse: WorkspaceTerminalOutputResponseSchema.parse,
      });
      setTerminal((current) => mergeTerminalOutput(current, response));
      return response;
    },
    [relayUrl],
  );

  const startTerminalSession = useCallback(() => {
    requestDangerousOperation({
      confirmLabel: "启动",
      detail: `将在 Mac 本机工作区启动一个可执行 shell 的 terminal session。\n\ncwd: ${currentWorkspacePath ?? "默认工作区"}`,
      requireText: "启动终端",
      summary: "这会打开一个能在 Mac 本机执行命令的 shell。",
      title: "启动 Terminal",
      run: async () => {
        setTerminal((current) => ({ ...current, errorMessage: null, isLoading: true }));
        try {
          const session = await relayRequest(`${relayUrl}${apiPaths.workspaceTerminalSessions}`, {
            body: {
              cols: 96,
              rows: 28,
              workspacePath: currentWorkspacePath,
            },
            method: "POST",
            parse: WorkspaceTerminalSessionResponseSchema.parse,
          });
          setTerminal({
            command: "",
            errorMessage: null,
            isLoading: false,
            nextSeq: 0,
            output: [],
            session,
          });
          await fetchTerminalOutput(session.sessionId, 0);
        } catch (error) {
          setTerminal((current) => ({
            ...current,
            errorMessage: errorMessage(error),
            isLoading: false,
          }));
        }
      },
    });
  }, [currentWorkspacePath, fetchTerminalOutput, relayUrl, requestDangerousOperation]);

  const sendTerminalCommand = useCallback(() => {
    const session = terminal.session;
    const command = terminal.command.trim();
    if (!session || !command) {
      return;
    }
    requestDangerousOperation({
      confirmLabel: "发送",
      detail: `cwd: ${session.workspacePath}\n\n${command}`,
      summary: "这条命令会在 Mac 本机 terminal session 中执行。",
      title: "发送 Terminal 命令",
      run: async () => {
        setTerminal((current) => ({ ...current, errorMessage: null, isLoading: true }));
        try {
          await rawRelayRequest(`${relayUrl}${apiPaths.workspaceTerminalInput(session.sessionId)}`, {
            body: { data: `${command}\n` },
            method: "POST",
          });
          setTerminal((current) => ({ ...current, command: "", isLoading: false }));
          await fetchTerminalOutput(session.sessionId, terminal.nextSeq);
        } catch (error) {
          setTerminal((current) => ({
            ...current,
            errorMessage: errorMessage(error),
            isLoading: false,
          }));
        }
      },
    });
  }, [
    fetchTerminalOutput,
    relayUrl,
    requestDangerousOperation,
    terminal.command,
    terminal.nextSeq,
    terminal.session,
  ]);

  const closeTerminalSession = useCallback(() => {
    const session = terminal.session;
    if (!session) {
      return;
    }
    requestDangerousOperation({
      confirmLabel: "关闭",
      detail: `session: ${session.sessionId}\nworkspace: ${session.workspacePath}`,
      summary: "这会关闭当前 Web terminal session。",
      title: "关闭 Terminal",
      run: async () => {
        setTerminal((current) => ({ ...current, errorMessage: null, isLoading: true }));
        try {
          await rawRelayRequest(`${relayUrl}${apiPaths.workspaceTerminalSession(session.sessionId)}`, {
            method: "DELETE",
          });
          setTerminal(initialTerminalState);
        } catch (error) {
          setTerminal((current) => ({
            ...current,
            errorMessage: errorMessage(error),
            isLoading: false,
          }));
        }
      },
    });
  }, [relayUrl, requestDangerousOperation, terminal.session]);

  const saveWorkspaceFile = useCallback(
    (file: WorkspaceFileContentResponse, content: string) => {
      if (file.binary) {
        setTools((current) => ({ ...current, errorMessage: "二进制文件不能在 Web 入口保存。" }));
        return;
      }
      if (file.truncated) {
        setTools((current) => ({ ...current, errorMessage: "文件内容已截断，不能从 Web 入口保存。" }));
        return;
      }
      requestDangerousOperation({
        confirmLabel: "保存",
        detail: [
          `workspace: ${file.workspacePath || currentWorkspacePath || "默认工作区"}`,
          `file: ${file.path}`,
          `old size: ${formatBytes(file.size)}`,
          `new size: ${formatBytes(utf8ByteLength(content))}`,
          `lines: ${countLines(content)}`,
          `characters: ${content.length.toLocaleString()}`,
        ].join("\n"),
        requireText: "保存文件",
        summary: "这会覆盖 Mac 本机工作区里的文件内容。",
        title: "保存文件",
        run: async () => {
          setTools((current) => ({
            ...current,
            errorMessage: null,
            fileSaveMessage: null,
            isLoading: true,
          }));
          try {
            const response = await relayRequest(`${relayUrl}${apiPaths.workspaceFileContent}`, {
              body: {
                content,
                path: file.path,
                workspacePath: file.workspacePath || currentWorkspacePath,
              },
              method: "PUT",
              parse: WorkspaceFileContentResponseSchema.parse,
            });
            setTools((current) => ({
              ...current,
              errorMessage: null,
              fileContent: response,
              fileSaveMessage: "文件已保存",
              isLoading: false,
              selectedFilePath: response.path,
            }));
          } catch (error) {
            setTools((current) => ({
              ...current,
              errorMessage: errorMessage(error),
              isLoading: false,
            }));
          }
        },
      });
    },
    [currentWorkspacePath, relayUrl, requestDangerousOperation],
  );

  const checkoutWorkspaceBranch = useCallback(
    (branchInput: string) => {
      const branch = branchInput.trim();
      if (!branch) {
        setTools((current) => ({ ...current, errorMessage: "请输入目标分支名。" }));
        return;
      }
      if (branch.startsWith("-")) {
        setTools((current) => ({ ...current, errorMessage: "分支名不能以 - 开头。" }));
        return;
      }
      const git = tools.git;
      requestDangerousOperation({
        confirmLabel: "切换",
        detail: [
          `workspace: ${git?.workspacePath || currentWorkspacePath || "默认工作区"}`,
          `current branch: ${git?.currentBranch ?? "unknown"}`,
          `target branch: ${branch}`,
          `changed files: ${git?.stats.filesChanged ?? 0}`,
          "如果本地分支不存在，relay 会创建并切换到这个分支。",
        ].join("\n"),
        requireText: branch,
        summary: "这会在 Mac 本机工作区执行 git checkout，必要时创建新分支。",
        title: "切换 Git 分支",
        run: async () => {
          setTools((current) => ({ ...current, errorMessage: null, gitActionMessage: null, isLoading: true }));
          try {
            const action = await relayRequest(`${relayUrl}${apiPaths.workspaceCheckout}`, {
              body: {
                branch,
                workspacePath: git?.workspacePath || currentWorkspacePath,
              },
              method: "POST",
              parse: WorkspaceGitActionResponseSchema.parse,
            });
            const refreshed = await relayRequest(
              `${relayUrl}${apiPaths.workspaceChanges}?${queryString({
                workspacePath: git?.workspacePath || currentWorkspacePath,
              })}`,
              {
                parse: WorkspaceChangesResponseSchema.parse,
              },
            );
            setTools((current) => ({
              ...current,
              errorMessage: null,
              git: refreshed,
              gitActionMessage: gitActionMessage(action.message, action.output),
              isLoading: false,
            }));
          } catch (error) {
            setTools((current) => ({
              ...current,
              errorMessage: errorMessage(error),
              isLoading: false,
            }));
          }
        },
      });
    },
    [currentWorkspacePath, relayUrl, requestDangerousOperation, tools.git],
  );

  const commitPushWorkspace = useCallback(
    (messageInput: string) => {
      const message = messageInput.trim();
      if (!message) {
        setTools((current) => ({ ...current, errorMessage: "请输入 commit message。" }));
        return;
      }
      const git = tools.git;
      if (git && !git.hasChanges) {
        setTools((current) => ({ ...current, errorMessage: "当前工作区没有 Git 改动可提交。" }));
        return;
      }
      requestDangerousOperation({
        confirmLabel: "提交",
        detail: [
          `workspace: ${git?.workspacePath || currentWorkspacePath || "默认工作区"}`,
          `branch: ${git?.currentBranch ?? "unknown"}`,
          `files changed: ${git?.stats.filesChanged ?? 0}`,
          `additions/deletions: +${git?.stats.additions ?? 0} / -${git?.stats.deletions ?? 0}`,
          `message: ${message}`,
          "",
          "将执行: git add --all, git commit -m <message>, git push",
        ].join("\n"),
        requireText: "提交并推送",
        summary: "这会在 Mac 本机工作区提交全部改动并推送到远端。",
        title: "Commit & Push",
        run: async () => {
          setTools((current) => ({ ...current, errorMessage: null, gitActionMessage: null, isLoading: true }));
          try {
            const action = await relayRequest(`${relayUrl}${apiPaths.workspaceCommitPush}`, {
              body: {
                message,
                workspacePath: git?.workspacePath || currentWorkspacePath,
              },
              method: "POST",
              parse: WorkspaceGitActionResponseSchema.parse,
            });
            const refreshed = await relayRequest(
              `${relayUrl}${apiPaths.workspaceChanges}?${queryString({
                workspacePath: git?.workspacePath || currentWorkspacePath,
              })}`,
              {
                parse: WorkspaceChangesResponseSchema.parse,
              },
            );
            setTools((current) => ({
              ...current,
              errorMessage: null,
              git: refreshed,
              gitActionMessage: gitActionMessage(action.message, action.output),
              isLoading: false,
            }));
          } catch (error) {
            setTools((current) => ({
              ...current,
              errorMessage: errorMessage(error),
              isLoading: false,
            }));
          }
        },
      });
    },
    [currentWorkspacePath, relayUrl, requestDangerousOperation, tools.git],
  );

  const runAutomation = useCallback(
    (automation: AutomationSummary) => {
      if (automation.status === "DISABLED") {
        setTools((current) => ({ ...current, errorMessage: "这个 automation 已禁用，不能从 Web 入口运行。" }));
        return;
      }
      const workspacePath = chooseAutomationWorkspacePath(automation, currentWorkspacePath);
      requestDangerousOperation({
        confirmLabel: "运行",
        detail: [
          `id: ${automation.id}`,
          `name: ${automation.name}`,
          `status: ${automation.status}`,
          `workspace: ${workspacePath ?? "relay 默认工作区"}`,
          `model: ${automation.model ?? "relay/default"}`,
          `reasoning: ${automation.reasoningEffort ?? "default"}`,
          `schedule: ${automation.rrule ?? "manual/unknown"}`,
          "",
          `prompt: ${compactText(automation.prompt, 420) || "(empty)"}`,
        ].join("\n"),
        requireText: "运行自动化",
        summary: "这会在 Mac 本机通过 Codex Relay 启动一个新的 automation 线程。",
        title: "运行 Automation",
        run: async () => {
          setTools((current) => ({
            ...current,
            automationRunMessage: null,
            errorMessage: null,
            isLoading: true,
          }));
          try {
            const response = await relayRequest(`${relayUrl}${apiPaths.automationRun(automation.id)}`, {
              body: {
                ...(workspacePath ? { workspacePath } : {}),
              },
              method: "POST",
              parse: RunAutomationResponseSchema.parse,
            });
            setTools((current) => ({
              ...current,
              automationRunMessage: `${response.message}\nthread: ${response.threadId}`,
              errorMessage: null,
              isLoading: false,
            }));
            await loadThreadDetail(response.threadId);
          } catch (error) {
            setTools((current) => ({
              ...current,
              errorMessage: errorMessage(error),
              isLoading: false,
            }));
          }
        },
      });
    },
    [currentWorkspacePath, loadThreadDetail, relayUrl, requestDangerousOperation],
  );

  const loadWorkspaceFiles = useCallback(
    async (input?: { directory?: string; query?: string }) => {
      const nextDirectory = input?.directory ?? tools.fileDirectory;
      const nextQuery = input?.query ?? tools.fileSearch;
      setTools((current) => ({
        ...current,
        errorMessage: null,
        fileContent: input?.directory !== undefined ? null : current.fileContent,
        fileDirectory: nextDirectory,
        fileSaveMessage: null,
        fileSearch: nextQuery,
        isLoading: true,
        selectedFilePath: input?.directory !== undefined ? null : current.selectedFilePath,
      }));
      try {
        const response = await relayRequest(
          `${relayUrl}${apiPaths.workspaceFiles}?${queryString({
            directory: nextDirectory,
            query: nextQuery,
            workspacePath: currentWorkspacePath,
          })}`,
          {
            parse: ListWorkspaceFilesResponseSchema.parse,
          },
        );
        setTools((current) => ({
          ...current,
          errorMessage: null,
          files: response,
          isLoading: false,
        }));
      } catch (error) {
        setTools((current) => ({
          ...current,
          errorMessage: errorMessage(error),
          isLoading: false,
        }));
      }
    },
    [currentWorkspacePath, relayUrl, tools.fileDirectory, tools.fileSearch],
  );

  const loadWorkspaceFileContent = useCallback(
    async (path: string) => {
      setTools((current) => ({
        ...current,
        errorMessage: null,
        fileContent: null,
        fileSaveMessage: null,
        isLoading: true,
        selectedFilePath: path,
      }));
      try {
        const response = await relayRequest(
          `${relayUrl}${apiPaths.workspaceFileContent}?${queryString({
            path,
            workspacePath: currentWorkspacePath,
          })}`,
          {
            parse: WorkspaceFileContentResponseSchema.parse,
          },
        );
        setTools((current) => ({
          ...current,
          errorMessage: null,
          fileContent: response,
          isLoading: false,
        }));
      } catch (error) {
        setTools((current) => ({
          ...current,
          errorMessage: errorMessage(error),
          isLoading: false,
        }));
      }
    },
    [currentWorkspacePath, relayUrl],
  );

  useEffect(() => {
    if (probe.status?.preferences) {
      setTools((current) => ({
        ...current,
        preferencesDraft: probe.status?.preferences ?? current.preferencesDraft,
      }));
    }
  }, [probe.status?.preferences]);

  useEffect(() => {
    void runProbe();
  }, [runProbe]);

  useEffect(() => {
    if (probe.state === "online" && workspace.threads.length === 0 && !isThreadsLoading) {
      void loadThreads();
    }
  }, [isThreadsLoading, loadThreads, probe.state, workspace.threads.length]);

  useEffect(() => {
    if (!terminal.session) {
      return;
    }
    const interval = window.setInterval(() => {
      void fetchTerminalOutput(terminal.session!.sessionId, terminal.nextSeq).catch((error) => {
        setTerminal((current) => ({
          ...current,
          errorMessage: errorMessage(error),
        }));
      });
    }, 1500);
    return () => window.clearInterval(interval);
  }, [fetchTerminalOutput, terminal.nextSeq, terminal.session]);

  const renderConnectionControls = () => (
    <>
      <label className="relay-field">
        <span>Relay URL</span>
        <input
          value={relayUrlInput}
          onChange={(event) => setRelayUrlInput(event.target.value)}
          onBlur={() => setRelayUrlInput(normalizeRelayUrl(relayUrlInput))}
          inputMode="url"
          spellCheck={false}
        />
      </label>
      <div className="connection-actions">
        <button className="secondary-button" type="button" onClick={() => void runProbe()}>
          重新探测
        </button>
        {hasClientToken() ? (
          <button className="secondary-button" type="button" onClick={signOut}>
            清除配对
          </button>
        ) : null}
      </div>
      <div className="connection-facts" aria-label="Probe results">
        <SignalRow label="Version" value={probe.version ? probe.version.packageVersion : "-"} />
        <SignalRow label="Session" value={probe.state === "needsPairing" ? "需要配对" : sessionValue(probe)} />
        <SignalRow label="Latency" value={probe.latencyMs ? `${probe.latencyMs} ms` : "-"} />
      </div>
    </>
  );

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Relay connection summary">
        <div>
          <p className="eyebrow">Codex Relay Web</p>
          <h1>手机网页入口</h1>
          <p className="topbar-meta">
            {probe.status?.machineName ?? "Mac relay"} ·{" "}
            {probe.status?.workspacePath ?? "等待工作区"}
          </p>
        </div>
        <div className="topbar-actions">
          {canUseThreads ? (
            <button
              aria-label="会话"
              className="secondary-button mobile-action-button icon-only-button"
              title="会话"
              type="button"
              onClick={() => setThreadDrawerOpen(true)}
            >
              <Icon name="threads" />
            </button>
          ) : null}
          {canUseThreads ? (
            <button
              aria-label="工具"
              className="secondary-button mobile-action-button icon-only-button"
              title="工具"
              type="button"
              onClick={() => openTools("usage")}
            >
              <Icon name="tools" />
            </button>
          ) : null}
          {canUseThreads ? (
            <button className="secondary-button desktop-tool-button" type="button" onClick={() => openTools("usage")}>
              <Icon name="tools" />
              <span className="button-label">工具</span>
            </button>
          ) : null}
          <button
            aria-label={`连接状态：${statusText}`}
            className={`status-pill status-${probe.state}`}
            onClick={() => setConnectionSheetOpen(true)}
            title={statusText}
            type="button"
          />
        </div>
      </section>

      <section className="connection-strip desktop-connection">
        {renderConnectionControls()}
      </section>

      {isConnectionSheetOpen ? (
        <div className="modal-layer" role="presentation">
          <button
            aria-label="关闭连接设置"
            className="modal-backdrop"
            type="button"
            onClick={() => setConnectionSheetOpen(false)}
          />
          <section className="connection-sheet" role="dialog" aria-modal="true" aria-label="连接设置">
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">Connection</p>
                <h2>连接</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭连接设置"
                onClick={() => setConnectionSheetOpen(false)}
              >
                ×
              </button>
            </div>
            {renderConnectionControls()}
          </section>
        </div>
      ) : null}

      {tools.isOpen ? (
        <ToolsSheet
          currentWorkspacePath={currentWorkspacePath}
          onCloseTerminal={closeTerminalSession}
          onBrowseDirectory={browseDirectory}
          onCheckoutBranch={checkoutWorkspaceBranch}
          onClose={() => setTools((current) => ({ ...current, isOpen: false }))}
          onCommitPush={commitPushWorkspace}
          onLoadFile={loadWorkspaceFileContent}
          onRefresh={() => void loadToolTab(tools.activeTab)}
          onReferenceWorkspacePath={appendWorkspaceReferenceToPrompt}
          onRunAutomation={runAutomation}
          onSaveFile={saveWorkspaceFile}
          onSaveGoal={saveThreadGoal}
          onSavePreferences={saveRuntimePreferences}
          onSearchFiles={(query) => loadWorkspaceFiles({ query })}
          onSelectDirectory={(directory) => loadWorkspaceFiles({ directory, query: "" })}
          onSetWorkspaceOverride={setWorkspaceOverride}
          onSelectTab={selectToolTab}
          onSendTerminalCommand={sendTerminalCommand}
          onStartTerminal={startTerminalSession}
          onToggleSkill={toggleSkill}
          selectedSkills={selectedSkills}
          setTools={setTools}
          setTerminal={setTerminal}
          selectedThread={selectedThread}
          terminal={terminal}
          tools={tools}
          workspaceOverride={workspaceOverride}
        />
      ) : null}

      {dangerPrompt ? (
        <DangerConfirmDialog
          prompt={dangerPrompt}
          onCancel={() => setDangerPrompt(null)}
          onConfirm={async () => {
            const action = dangerPrompt.run;
            setDangerPrompt(null);
            await action();
          }}
        />
      ) : null}

      {probe.errorMessage ? <p className="notice">{probe.errorMessage}</p> : null}

      {canUseThreads ? (
        <section className="workspace-shell">
          {isThreadDrawerOpen ? (
            <button
              aria-label="关闭会话侧边栏"
              className="drawer-backdrop"
              type="button"
              onClick={() => setThreadDrawerOpen(false)}
            />
          ) : null}
          <aside
            className={`thread-list-panel ${isThreadDrawerOpen ? "open" : ""}`}
            aria-label="Thread list"
          >
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Threads</p>
                <h2>会话</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => void loadThreads({ keepSelection: true })}
                disabled={isThreadsLoading}
              >
                ↻
                <span className="tooltip">刷新会话</span>
              </button>
            </div>
            <label className="thread-search-field">
              <span>搜索会话</span>
              <input
                type="search"
                value={threadSearch}
                onChange={(event) => setThreadSearch(event.target.value)}
                placeholder="搜索会话..."
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button
              className={`new-thread-button ${composerMode === "new" ? "active" : ""}`}
              type="button"
              onClick={() => {
                setComposerMode("new");
                setWorkspace((current) => ({ ...current, selectedThreadId: null, detail: null }));
                setThreadDrawerOpen(false);
              }}
            >
              新建会话
            </button>
            <div className="thread-list">
              {workspace.threads.length === 0 ? (
                <p className="empty-state">暂无会话，直接在右侧输入即可创建。</p>
              ) : null}
              {workspace.threads.length > 0 && filteredThreads.length === 0 ? (
                <p className="empty-state">没有匹配会话。</p>
              ) : null}
              {filteredThreads.map((thread) => (
                <button
                  className={`thread-row ${
                    thread.id === workspace.selectedThreadId ? "selected" : ""
                  }`}
                  key={thread.id}
                  type="button"
                  onClick={() => {
                    setComposerMode("reply");
                    setThreadDrawerOpen(false);
                    void loadThreadDetail(thread.id);
                  }}
                >
                  <span className={`thread-state state-${thread.state}`}>{thread.state}</span>
                  <strong>{thread.title}</strong>
                  <span>{thread.lastMessagePreview ?? thread.lastPrompt ?? thread.cwd ?? thread.id}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="chat-panel" aria-label="Chat detail">
            <div className="chat-header">
              <div>
                <p className="eyebrow">{composerMode === "new" ? "New Thread" : "Current Thread"}</p>
                <h2>{selectedThread?.title ?? "新建会话"}</h2>
                <p className="muted">
                  {selectedThread?.cwd ?? probe.status?.workspacePath ?? "使用当前 relay 工作区"}
                </p>
              </div>
              <div className="chat-actions">
                {selectedThread?.state === "running" && !workspace.isStreaming ? (
                  <button className="secondary-button" type="button" onClick={attachSelectedStream}>
                    同步输出
                  </button>
                ) : null}
                {workspace.isStreaming ? (
                  <button className="secondary-button danger" type="button" onClick={stopStream}>
                    停止接收
                  </button>
                ) : null}
              </div>
            </div>

            {workspace.errorMessage ? <p className="notice">{workspace.errorMessage}</p> : null}
            {workspace.streamStatus ? (
              <div className="stream-status stream-toast" role="status">
                <span>{workspace.streamStatus}</span>
                <button
                  aria-label="关闭状态提示"
                  title="关闭"
                  type="button"
                  onClick={dismissStreamStatus}
                >
                  <Icon name="close" />
                </button>
              </div>
            ) : null}

            <div
              className="message-list"
              onScroll={() => updateMessageListBottomState()}
              ref={messageListRef}
            >
              {workspace.previewTarget ? (
                <PreviewTargetCard relayUrl={relayUrl} target={workspace.previewTarget} />
              ) : null}
              {workspace.queuedInputs.length > 0 ? (
                <QueuedInputList
                  inputs={workspace.queuedInputs}
                  onRemove={removeQueuedInput}
                  onSteer={steerQueuedInput}
                />
              ) : null}
              {workspace.isDetailLoading ? <p className="empty-state">正在加载会话...</p> : null}
              {!workspace.isDetailLoading && messages.length === 0 ? (
                <p className="empty-state">这里会显示 Codex 的回复、工具调用和审批请求。</p>
              ) : null}
              {hiddenMessageCount > 0 ? (
                <button
                  className="load-more-messages"
                  type="button"
                  onClick={() =>
                    setVisibleMessageCount((current) =>
                      Math.min(messages.length, current + messageRenderBatchSize),
                    )
                  }
                >
                  <Icon name="refresh" />
                  <span>更早 {hiddenMessageCount}</span>
                </button>
              ) : null}
              {visibleMessages.map((message) => (
                <MessageCard
                  key={message.id}
                  detailByKey={workspace.messageDetailsByKey}
                  loadingDetailKeys={loadingDetailKeys}
                  message={message}
                  resolvingApprovalIds={resolvingApprovalIds}
                  onLoadDetail={loadMessageDetail}
                  onResolveApproval={requestApprovalDecision}
                />
              ))}
              {workspace.pendingInputRequests.map((request) => (
                <PendingInputRequestCard
                  isResolving={resolvingApprovalIds.has(request.id)}
                  key={request.id}
                  onSubmit={resolveInputRequest}
                  request={request}
                />
              ))}
            </div>
            {!isMessageListNearBottom ? (
              <button
                aria-label="跳到会话底部"
                className="scroll-bottom-button"
                type="button"
                onClick={() => scrollMessageListToBottom()}
              >
                ↓
              </button>
            ) : null}

            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                void submitPrompt();
              }}
            >
              {workspaceOverride && composerMode === "new" ? (
                <div className="composer-context-pill">
                  <span>目录：{workspaceOverride}</span>
                  <button type="button" onClick={() => setWorkspaceOverride(null)}>
                    清除
                  </button>
                </div>
              ) : null}
              {selectedSkills.length > 0 || promptAttachments.length > 0 || promptWorkspaceReferences.length > 0 ? (
                <div className="composer-context-list">
                  {selectedSkills.map((skill) => (
                    <button
                      className="context-chip"
                      key={`${skill.name}:${skill.path}`}
                      type="button"
                      onClick={() =>
                        setSelectedSkills((current) =>
                          current.filter(
                            (candidate) =>
                              candidate.name !== skill.name || candidate.path !== skill.path,
                          ),
                        )
                      }
                    >
                      {skill.name} ×
                    </button>
                  ))}
                  {promptAttachments.map((attachment) => (
                    <button
                      className="context-chip"
                      key={attachment.path ?? attachment.url}
                      type="button"
                      onClick={() => removeAttachment(attachment.path)}
                    >
                      {attachment.name ?? "image"} ×
                    </button>
                  ))}
                  {promptWorkspaceReferences.map((reference) => (
                    <button
                      aria-label={`移除${workspaceReferenceKindLabel(reference.kind)} ${reference.path}`}
                      className="context-chip workspace-context-chip"
                      key={`${reference.kind}:${reference.path}`}
                      title={reference.path}
                      type="button"
                      onClick={() => removeWorkspaceReference(reference)}
                    >
                      <Icon name={reference.kind === "file" ? "file" : "folder"} />
                      <span>{workspaceReferenceChipLabel(reference)}</span>
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="field composer-field">
                <span>Prompt</span>
                <textarea
                  value={promptBody}
                  onChange={(event) => updatePromptBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                      return;
                    }
                    if (!event.metaKey && !event.ctrlKey) {
                      return;
                    }
                    event.preventDefault();
                    void submitPrompt();
                  }}
                  placeholder="问 Codex..."
                  enterKeyHint="enter"
                  spellCheck={false}
                />
              </label>
              <div className="attachment-menu-shell">
                <input
                  accept="image/*"
                  className="attachment-file-input"
                  multiple
                  ref={attachmentInputRef}
                  type="file"
                  onChange={(event) => {
                    void uploadAttachments(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
                <button
                  aria-expanded={isAttachmentMenuOpen}
                  aria-haspopup="menu"
                  aria-label={isUploadingAttachment ? "图片上传中" : "添加附件"}
                  className={`attachment-button ${isUploadingAttachment ? "loading" : ""}`}
                  title={isUploadingAttachment ? "上传中" : "添加附件"}
                  type="button"
                  onClick={() => setAttachmentMenuOpen((current) => !current)}
                >
                  <Icon name="paperclip" />
                  <span className="composer-action-label">{isUploadingAttachment ? "上传" : "附件"}</span>
                </button>
                {isAttachmentMenuOpen ? (
                  <div className="attachment-menu" role="menu" aria-label="附件">
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setAttachmentMenuOpen(false);
                        attachmentInputRef.current?.click();
                      }}
                    >
                      <Icon name="image" />
                      <span>图片</span>
                    </button>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => openAttachmentWorkspaceTool("files")}
                    >
                      <Icon name="file" />
                      <span>文件</span>
                    </button>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => openAttachmentWorkspaceTool("directories")}
                    >
                      <Icon name="folder" />
                      <span>目录</span>
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                className={`primary-button send-button ${workspace.isStreaming ? "stop-send-button" : ""}`}
                aria-label={
                  workspace.isStreaming
                    ? "立即停止"
                    : selectedThread?.state === "running" && composerMode === "reply"
                    ? "加入队列"
                    : composerMode === "new" || !workspace.selectedThreadId
                      ? "创建并发送"
                      : "发送"
                }
                title={
                  workspace.isStreaming
                    ? "立即停止"
                    : selectedThread?.state === "running" && composerMode === "reply"
                    ? "加入队列"
                    : composerMode === "new" || !workspace.selectedThreadId
                      ? "创建并发送"
                      : "发送"
                }
                type={workspace.isStreaming ? "button" : "submit"}
                onClick={
                  workspace.isStreaming
                    ? () => {
                        void stopStream();
                      }
                    : undefined
                }
                disabled={
                  !workspace.isStreaming &&
                  (!prompt.trim() ||
                    (workspace.isStreaming && selectedThread?.state !== "running"))
                }
              >
                <Icon name={workspace.isStreaming ? "stop" : "send"} />
                <span className="composer-action-label">
                  {workspace.isStreaming
                    ? "停止"
                    : selectedThread?.state === "running" && composerMode === "reply"
                    ? "队列"
                    : composerMode === "new" || !workspace.selectedThreadId
                      ? "新建"
                      : "发送"}
                </span>
              </button>
            </form>
          </section>
        </section>
      ) : (
        <PairingPanel
          pairing={pairing}
          pairingInput={pairingInput}
          relayUrl={relayUrl}
          setPairingInput={setPairingInput}
          startPairingFromRelay={startPairingFromRelay}
          startPairingWithInput={startPairingWithInput}
        />
      )}
    </main>
  );
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string[]> = {
    bolt: ["M13 2 4 14h7l-1 8 10-13h-7l1-7Z"],
    branch: ["M6 3v6a3 3 0 0 0 3 3h6", "M18 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M18 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
    check: ["M20 6 9 17l-5-5"],
    close: ["M6 6l12 12", "M18 6 6 18"],
    cpu: ["M9 9h6v6H9z", "M5 9H3", "M5 15H3", "M21 9h-2", "M21 15h-2", "M9 5V3", "M15 5V3", "M9 21v-2", "M15 21v-2", "M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"],
    deny: ["M18 6 6 18", "M6 6l12 12", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"],
    edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"],
    external: ["M14 3h7v7", "M10 14 21 3", "M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"],
    file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6", "M8 13h8", "M8 17h5"],
    folder: ["M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"],
    gauge: ["M4 14a8 8 0 1 1 16 0", "M12 14l4-4", "M8 18h8"],
    image: ["M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z", "M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M20 15l-4-4L5 21"],
    info: ["M12 17v-5", "M12 7h.01", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"],
    paperclip: ["M21.4 11.6 12 21a6 6 0 0 1-8.5-8.5l9.9-9.9a4 4 0 1 1 5.7 5.7L9.2 18.2a2 2 0 0 1-2.8-2.8l9.2-9.2"],
    patch: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
    play: ["M8 5v14l11-7Z"],
    refresh: ["M20 6v5h-5", "M4 18v-5h5", "M18 9a7 7 0 0 0-12-3", "M6 15a7 7 0 0 0 12 3"],
    save: ["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z", "M17 21v-8H7v8", "M7 3v5h8"],
    search: ["M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z", "M21 21l-4.3-4.3"],
    send: ["M22 2 11 13", "M22 2l-7 20-4-9-9-4Z"],
    session: ["M12 3l7 4v5c0 5-3 8-7 9-4-1-7-4-7-9V7Z", "M9 12l2 2 4-4"],
    shield: ["M12 3l7 4v5c0 5-3 8-7 9-4-1-7-4-7-9V7Z"],
    spark: ["M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8Z", "M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8Z"],
    stop: ["M6 6h12v12H6Z"],
    target: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"],
    terminal: ["M4 7l5 5-5 5", "M11 17h9"],
    threads: ["M4 5h16", "M4 12h12", "M4 19h8"],
    trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 15h10l1-15", "M10 11v6", "M14 11v6"],
    tools: ["M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-3-3Z"],
    up: ["M12 19V5", "M5 12l7-7 7 7"],
  };

  return (
    <svg
      aria-hidden="true"
      className="button-icon"
      focusable="false"
      viewBox="0 0 24 24"
    >
      {paths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}

function ToolsSheet({
  currentWorkspacePath,
  onBrowseDirectory,
  onCheckoutBranch,
  onClose,
  onCloseTerminal,
  onCommitPush,
  onLoadFile,
  onRefresh,
  onReferenceWorkspacePath,
  onRunAutomation,
  onSaveFile,
  onSaveGoal,
  onSavePreferences,
  onSearchFiles,
  onSelectDirectory,
  onSetWorkspaceOverride,
  onSelectTab,
  onSendTerminalCommand,
  onStartTerminal,
  onToggleSkill,
  selectedSkills,
  selectedThread,
  setTools,
  setTerminal,
  tools,
  terminal,
  workspaceOverride,
}: {
  currentWorkspacePath: string | undefined;
  onBrowseDirectory: (path: string) => void;
  onCheckoutBranch: (branch: string) => void;
  onClose: () => void;
  onCloseTerminal: () => void;
  onCommitPush: (message: string) => void;
  onLoadFile: (path: string) => void;
  onRefresh: () => void;
  onReferenceWorkspacePath: (kind: "dir" | "file", path: string) => void;
  onRunAutomation: (automation: AutomationSummary) => void;
  onSaveFile: (file: WorkspaceFileContentResponse, content: string) => void;
  onSaveGoal: () => void;
  onSavePreferences: () => void;
  onSearchFiles: (query: string) => void;
  onSelectDirectory: (directory: string) => void;
  onSetWorkspaceOverride: (path: string | null) => void;
  onSelectTab: (tab: ToolTab) => void;
  onSendTerminalCommand: () => void;
  onStartTerminal: () => void;
  onToggleSkill: (skill: AgentSkill) => void;
  selectedSkills: PromptSkill[];
  selectedThread: ThreadSummary | null;
  setTools: Dispatch<SetStateAction<ToolsState>>;
  setTerminal: Dispatch<SetStateAction<TerminalState>>;
  terminal: TerminalState;
  tools: ToolsState;
  workspaceOverride: string | null;
}) {
  const activeToolGroup = toolGroupForTab(tools.activeTab);
  const activeGroupTabs = activeToolGroup.tabs
    .map((tabId) => toolTabs.find((tab) => tab.id === tabId))
    .filter((tab): tab is { id: ToolTab; icon: IconName; label: string } => Boolean(tab));

  return (
    <div className="modal-layer tools-modal-layer" role="presentation">
      <button aria-label="关闭工具面板" className="modal-backdrop" type="button" onClick={onClose} />
      <section className="tools-sheet" role="dialog" aria-modal="true" aria-label="工具">
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">Tools</p>
            <h2>工具</h2>
            <p className="muted">{currentWorkspacePath ?? "等待工作区"}</p>
          </div>
          <div className="sheet-actions">
            <button
              aria-label="刷新"
              className="secondary-button icon-only-button"
              title="刷新"
              type="button"
              onClick={onRefresh}
              disabled={tools.isLoading}
            >
              <Icon name="refresh" />
            </button>
            <button className="icon-button" type="button" aria-label="关闭工具面板" title="关闭" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
        </div>

        <div className="tool-primary-tabs" role="tablist" aria-label="工具一级分类">
          {toolGroups.map((group) => (
            <button
              aria-selected={activeToolGroup.id === group.id}
              className={activeToolGroup.id === group.id ? "active" : ""}
              key={group.id}
              role="tab"
              type="button"
              onClick={() => {
                const nextTab = group.tabs.includes(tools.activeTab) ? tools.activeTab : group.tabs[0];
                onSelectTab(nextTab);
              }}
            >
              <Icon name={group.icon} />
              <span>{group.label}</span>
            </button>
          ))}
        </div>

        <div className="tool-tabs tool-secondary-tabs" role="tablist" aria-label={`${activeToolGroup.label}工具`}>
          {activeGroupTabs.map((tab) => (
            <button
              aria-selected={tools.activeTab === tab.id}
              className={tools.activeTab === tab.id ? "active" : ""}
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => onSelectTab(tab.id)}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {tools.errorMessage ? <p className="notice">{tools.errorMessage}</p> : null}
        {tools.isLoading ? <p className="stream-status">正在加载...</p> : null}

        <div className="tool-content">
          {tools.activeTab === "usage" ? (
            <UsageTool contextWindow={tools.contextWindow} rateLimits={tools.rateLimits} selectedThread={selectedThread} />
          ) : null}
          {tools.activeTab === "models" ? (
            <ModelsTool
              models={tools.models}
              onSave={onSavePreferences}
              preferencesDraft={tools.preferencesDraft}
              saveMessage={tools.modelSaveMessage}
              setTools={setTools}
            />
          ) : null}
          {tools.activeTab === "files" ? (
            <FilesTool
              onLoadFile={onLoadFile}
              onReferencePath={onReferenceWorkspacePath}
              onSaveFile={onSaveFile}
              onSearch={onSearchFiles}
              onSelectDirectory={onSelectDirectory}
              setTools={setTools}
              tools={tools}
            />
          ) : null}
          {tools.activeTab === "git" ? (
            <GitTool
              actionMessage={tools.gitActionMessage}
              git={tools.git}
              onCheckoutBranch={onCheckoutBranch}
              onCommitPush={onCommitPush}
            />
          ) : null}
          {tools.activeTab === "directories" ? (
            <DirectoriesTool
              currentWorkspacePath={currentWorkspacePath}
              directories={tools.directories}
              onBrowse={onBrowseDirectory}
              onReferencePath={onReferenceWorkspacePath}
              onSetWorkspaceOverride={onSetWorkspaceOverride}
              workspaceOverride={workspaceOverride}
            />
          ) : null}
          {tools.activeTab === "skills" ? (
            <SkillsTool
              onToggleSkill={onToggleSkill}
              selectedSkills={selectedSkills}
              skills={tools.skills}
            />
          ) : null}
          {tools.activeTab === "goal" ? (
            <GoalTool goal={tools.goal} onSave={onSaveGoal} setTools={setTools} tools={tools} />
          ) : null}
          {tools.activeTab === "terminal" ? (
            <TerminalTool
              onCloseTerminal={onCloseTerminal}
              onSendCommand={onSendTerminalCommand}
              onStartTerminal={onStartTerminal}
              setTerminal={setTerminal}
              terminal={terminal}
            />
          ) : null}
          {tools.activeTab === "automations" ? (
            <AutomationsTool
              actionMessage={tools.automationRunMessage}
              automations={tools.automations}
              onRunAutomation={onRunAutomation}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function DangerConfirmDialog({
  onCancel,
  onConfirm,
  prompt,
}: {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  prompt: DangerPrompt;
}) {
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = prompt.requireText ? confirmText.trim() === prompt.requireText : true;
  return (
    <div className="modal-layer danger-modal-layer" role="presentation">
      <button aria-label="取消危险操作" className="modal-backdrop" type="button" onClick={onCancel} />
      <section className="danger-dialog" role="dialog" aria-modal="true" aria-label={prompt.title}>
        <div>
          <p className="eyebrow">Danger Zone</p>
          <h2>{prompt.title}</h2>
          <p className="danger-summary">{prompt.summary}</p>
        </div>
        <pre>{prompt.detail}</pre>
        {prompt.requireText ? (
          <label className="field">
            <span>输入 {prompt.requireText} 继续</span>
            <input
              autoComplete="off"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
            />
          </label>
        ) : null}
        <div className="danger-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            <Icon name="close" />
            <span>取消</span>
          </button>
          <button
            className="primary-button danger-action"
            disabled={!canConfirm}
            type="button"
            onClick={() => void onConfirm()}
          >
            <Icon name="shield" />
            <span>{prompt.confirmLabel}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function TerminalTool({
  onCloseTerminal,
  onSendCommand,
  onStartTerminal,
  setTerminal,
  terminal,
}: {
  onCloseTerminal: () => void;
  onSendCommand: () => void;
  onStartTerminal: () => void;
  setTerminal: Dispatch<SetStateAction<TerminalState>>;
  terminal: TerminalState;
}) {
  return (
    <section className="tool-section terminal-tool">
      <div className="metric-grid">
        <MetricCard
          label="Session"
          value={terminal.session ? terminal.session.sessionId.slice(0, 8) : "未启动"}
          detail={terminal.session?.workspacePath ?? "需要先启动"}
        />
        <MetricCard
          label="Output"
          value={`${terminal.output.length} chunks`}
          detail={terminal.nextSeq ? `next seq ${terminal.nextSeq}` : "等待输出"}
        />
      </div>
      {terminal.errorMessage ? <p className="notice">{terminal.errorMessage}</p> : null}
      <div className="button-row">
        {!terminal.session ? (
          <button className="primary-button" type="button" onClick={onStartTerminal}>
            <Icon name="play" />
            <span>启动</span>
          </button>
        ) : (
          <button className="secondary-button danger" type="button" onClick={onCloseTerminal}>
            <Icon name="stop" />
            <span>关闭</span>
          </button>
        )}
      </div>
      <pre className="terminal-output">
        {terminal.output.length > 0
          ? terminal.output.map((chunk) => chunk.data).join("")
          : "Terminal 输出会显示在这里。"}
      </pre>
      <form
        className="terminal-input"
        onSubmit={(event) => {
          event.preventDefault();
          onSendCommand();
        }}
      >
        <label className="field">
          <span>Command</span>
          <input
            disabled={!terminal.session || terminal.isLoading}
            value={terminal.command}
            onChange={(event) =>
              setTerminal((current) => ({ ...current, command: event.target.value }))
            }
            placeholder="例如 pwd"
            spellCheck={false}
          />
        </label>
        <button
          className="primary-button"
          disabled={!terminal.session || !terminal.command.trim() || terminal.isLoading}
          type="submit"
        >
          <Icon name="send" />
          <span>发送</span>
        </button>
      </form>
    </section>
  );
}

function AutomationsTool({
  actionMessage,
  automations,
  onRunAutomation,
}: {
  actionMessage: string | null;
  automations: AutomationSummary[];
  onRunAutomation: (automation: AutomationSummary) => void;
}) {
  return (
    <section className="tool-section automations-tool">
      {actionMessage ? <pre className="git-action-output">{actionMessage}</pre> : null}
      <div className="tool-list">
        {automations.length === 0 ? <p className="empty-state">暂无 automations。</p> : null}
        {automations.map((automation) => (
          <article className="automation-card" key={automation.id}>
            <div className="automation-card-heading">
              <div>
                <p className="eyebrow">{automation.kind ?? automation.id}</p>
                <h3>{automation.name}</h3>
              </div>
              <span className={`automation-status status-${automation.status.toLowerCase()}`}>
                {automation.status}
              </span>
            </div>
            <dl className="automation-facts">
              <div>
                <dt>Workspace</dt>
                <dd>{automation.cwds[0] ?? "relay 默认工作区"}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{automation.model ?? "relay/default"}</dd>
              </div>
              <div>
                <dt>Schedule</dt>
                <dd>{automation.rrule ?? "manual/unknown"}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatUnixTime(automation.updatedAt)}</dd>
              </div>
            </dl>
            {automation.prompt ? (
              <p className="automation-prompt">{compactText(automation.prompt, 260)}</p>
            ) : null}
            <div className="button-row">
              <button
                className="primary-button danger-action"
                disabled={automation.status === "DISABLED"}
                type="button"
                onClick={() => onRunAutomation(automation)}
              >
                <Icon name="play" />
                <span>运行</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function UsageTool({
  contextWindow,
  rateLimits,
  selectedThread,
}: {
  contextWindow: ThreadContextWindowResponse | null;
  rateLimits: RateLimitsResponse | null;
  selectedThread: ThreadSummary | null;
}) {
  const usage = contextWindow?.usage;
  return (
    <section className="tool-section">
      <div className="metric-grid">
        <MetricCard
          label="当前线程"
          value={selectedThread?.title ?? "未选择"}
          detail={selectedThread?.model ?? "等待模型信息"}
        />
        <MetricCard
          label="Context"
          value={usage ? `${usage.tokensUsed.toLocaleString()} / ${usage.tokenLimit.toLocaleString()}` : "暂无"}
          detail={usage ? `${contextPercent(usage.tokensUsed, usage.tokenLimit)}%` : "没有 context window 记录"}
        />
      </div>
      <div className="tool-list">
        {(rateLimits?.buckets ?? []).length === 0 ? (
          <p className="empty-state">暂无 rate limit 数据。</p>
        ) : null}
        {(rateLimits?.buckets ?? []).map((bucket) => (
          <article className="tool-list-item" key={bucket.limitId}>
            <div>
              <strong>{bucket.limitName ?? bucket.limitId}</strong>
              <span>{bucket.planType ?? "plan unknown"}</span>
            </div>
            <div className="usage-bars">
              <UsageBar label="Primary" percent={bucket.primary?.usedPercent} />
              <UsageBar label="Secondary" percent={bucket.secondary?.usedPercent} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ModelsTool({
  models,
  onSave,
  preferencesDraft,
  saveMessage,
  setTools,
}: {
  models: CodexModel[];
  onSave: () => void;
  preferencesDraft: RuntimePreferences;
  saveMessage: string | null;
  setTools: Dispatch<SetStateAction<ToolsState>>;
}) {
  const selectedModel = models.find((model) => model.model === preferencesDraft.model);
  const reasoningOptions = selectedModel?.supportedReasoningEfforts?.length
    ? selectedModel.supportedReasoningEfforts
    : reasoningEfforts;
  return (
    <section className="tool-section">
      <label className="field">
        <span>Model</span>
        <select
          value={preferencesDraft.model ?? ""}
          onChange={(event) =>
            setTools((current) => ({
              ...current,
              preferencesDraft: {
                ...current.preferencesDraft,
                model: event.target.value || undefined,
                reasoningEffort:
                  models.find((model) => model.model === event.target.value)?.defaultReasoningEffort ??
                  current.preferencesDraft.reasoningEffort,
              },
            }))
          }
        >
          <option value="">Relay 默认模型</option>
          {models.map((model) => (
            <option key={model.id} value={model.model}>
              {model.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Reasoning</span>
        <select
          value={preferencesDraft.reasoningEffort ?? ""}
          onChange={(event) =>
            setTools((current) => ({
              ...current,
              preferencesDraft: {
                ...current.preferencesDraft,
                reasoningEffort: (event.target.value || undefined) as ReasoningEffort | undefined,
              },
            }))
          }
        >
          <option value="">模型默认</option>
          {reasoningOptions.map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Runtime mode</span>
        <select
          value={preferencesDraft.runtimeMode}
          onChange={(event) =>
            setTools((current) => ({
              ...current,
              preferencesDraft: {
                ...current.preferencesDraft,
                runtimeMode: event.target.value as RuntimeMode,
              },
            }))
          }
        >
          {runtimeModes.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Service tier</span>
        <input
          value={preferencesDraft.serviceTier ?? ""}
          onChange={(event) =>
            setTools((current) => ({
              ...current,
              preferencesDraft: {
                ...current.preferencesDraft,
                serviceTier: event.target.value || undefined,
              },
            }))
          }
          placeholder="auto / default / flex..."
        />
      </label>
      <button className="primary-button" type="button" onClick={onSave}>
        <Icon name="save" />
        <span>保存</span>
      </button>
      {saveMessage ? <p className="notice success">{saveMessage}</p> : null}
    </section>
  );
}

function FilesTool({
  onLoadFile,
  onReferencePath,
  onSaveFile,
  onSearch,
  onSelectDirectory,
  setTools,
  tools,
}: {
  onLoadFile: (path: string) => void;
  onReferencePath: (kind: "dir" | "file", path: string) => void;
  onSaveFile: (file: WorkspaceFileContentResponse, content: string) => void;
  onSearch: (query: string) => void;
  onSelectDirectory: (directory: string) => void;
  setTools: Dispatch<SetStateAction<ToolsState>>;
  tools: ToolsState;
}) {
  const filesDirectory = tools.files?.directory ?? tools.fileDirectory;
  const filesParentDirectory = tools.files?.parentDirectory ?? null;
  const filesWorkspacePath = tools.files?.workspacePath ?? "当前工作区";
  return (
    <section className="tool-section files-tool">
      <div className="file-navigation-bar">
        <button
          aria-label="返回上级目录"
          className="secondary-button"
          disabled={filesParentDirectory === null}
          title="返回上级"
          type="button"
          onClick={() => {
            if (filesParentDirectory !== null) {
              onSelectDirectory(filesParentDirectory);
            }
          }}
        >
          <Icon name="up" />
          <span>上级</span>
        </button>
        <div>
          <span>{filesDirectory || "根目录"}</span>
          <small>{filesWorkspacePath}</small>
        </div>
      </div>
      <form
        className="tool-search"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(tools.fileSearch);
        }}
      >
        <label className="field">
          <span>搜索</span>
          <input
            value={tools.fileSearch}
            onChange={(event) =>
              setTools((current) => ({ ...current, fileSearch: event.target.value }))
            }
            placeholder="输入文件名..."
          />
        </label>
        <button className="secondary-button icon-only-button" aria-label="搜索" title="搜索" type="submit">
          <Icon name="search" />
        </button>
      </form>
      <div className="files-browser">
        <div className="tool-list">
          {filesParentDirectory !== null ? (
            <div className="tool-list-entry">
              <button
                className="tool-list-button"
                type="button"
                onClick={() => onSelectDirectory(filesParentDirectory)}
              >
                <strong>../</strong>
                <span>{filesParentDirectory || "根目录"}</span>
              </button>
              <button
                aria-label="引用父目录"
                className="secondary-button icon-only-button reference-button"
                title="引用"
                type="button"
                onClick={() => onReferencePath("dir", filesParentDirectory || ".")}
              >
                <Icon name="paperclip" />
              </button>
            </div>
          ) : null}
          {(tools.files?.files ?? []).length === 0 ? (
            <p className="empty-state">暂无文件结果。</p>
          ) : null}
          {(tools.files?.files ?? []).map((file) => (
            <div className="tool-list-entry" key={file.path}>
              <button
                className={`tool-list-button ${tools.selectedFilePath === file.path ? "selected" : ""}`}
                type="button"
                onClick={() => {
                  if (file.kind === "directory") {
                    onSelectDirectory(file.path);
                    return;
                  }
                  onLoadFile(file.path);
                }}
              >
                <strong>{file.kind === "directory" ? `${file.name}/` : file.name}</strong>
                <span>{file.directory}</span>
              </button>
              <button
                aria-label={`引用${file.kind === "directory" ? "目录" : "文件"} ${file.name}`}
                className="secondary-button icon-only-button reference-button"
                title="引用"
                type="button"
                onClick={() => onReferencePath(file.kind === "directory" ? "dir" : "file", file.path)}
              >
                <Icon name="paperclip" />
              </button>
            </div>
          ))}
        </div>
        <FilePreview
          fileContent={tools.fileContent}
          isSaving={tools.isLoading}
          onSave={onSaveFile}
          saveMessage={tools.fileSaveMessage}
        />
      </div>
    </section>
  );
}

function FilePreview({
  fileContent,
  isSaving,
  onSave,
  saveMessage,
}: {
  fileContent: WorkspaceFileContentResponse | null;
  isSaving: boolean;
  onSave: (file: WorkspaceFileContentResponse, content: string) => void;
  saveMessage: string | null;
}) {
  const [isEditing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [openMessage, setOpenMessage] = useState<string | null>(null);
  useEffect(() => {
    setDraft(fileContent?.content ?? "");
    setEditing(false);
    setOpenMessage(null);
  }, [fileContent?.path, fileContent?.content]);

  if (!fileContent) {
    return <p className="empty-state">选择一个文件后在这里预览。</p>;
  }
  const canEdit = !fileContent.binary && !fileContent.truncated;
  const canOpenExternally = !fileContent.binary && !fileContent.truncated;
  const isDirty = draft !== fileContent.content;
  return (
    <article className="file-preview">
      <div className="utility-heading">
        <div>
          <p className="eyebrow">{fileContent.language || "text"}</p>
          <h3>{fileContent.name}</h3>
        </div>
        <div className="file-preview-actions">
          <span>{formatBytes(fileContent.size)}</span>
          {canOpenExternally ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                void openWorkspaceFileWithSystem(fileContent, setOpenMessage);
              }}
            >
              <Icon name="external" />
              <span>打开</span>
            </button>
          ) : null}
          {canEdit ? (
            <button className="secondary-button" type="button" onClick={() => setEditing((value) => !value)}>
              <Icon name={isEditing ? "file" : "edit"} />
              <span>{isEditing ? "预览" : "编辑"}</span>
            </button>
          ) : null}
        </div>
      </div>
      {fileContent.binary ? (
        <p className="empty-state">这是二进制文件，当前 relay 只返回预览信息；要用手机 App 打开，需要增加原始文件下载接口。</p>
      ) : fileContent.truncated ? (
        <p className="empty-state">文件内容已截断，暂不允许保存。</p>
      ) : isEditing ? (
        <div className="file-editor">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
          />
          <div className="file-editor-actions">
            <span>
              {isDirty ? "有未保存改动" : "无改动"} · {formatBytes(utf8ByteLength(draft))} · {countLines(draft)} 行
            </span>
            <button
              className="primary-button danger-action"
              disabled={!isDirty || isSaving}
              type="button"
              onClick={() => onSave(fileContent, draft)}
            >
              <Icon name="save" />
              <span>保存</span>
            </button>
          </div>
        </div>
      ) : (
        <pre>{fileContent.content}</pre>
      )}
      {openMessage ? <p className="file-open-message">{openMessage}</p> : null}
      {saveMessage ? <p className="notice success">{saveMessage}</p> : null}
    </article>
  );
}

function GitTool({
  actionMessage,
  git,
  onCheckoutBranch,
  onCommitPush,
}: {
  actionMessage: string | null;
  git: WorkspaceChangesResponse | null;
  onCheckoutBranch: (branch: string) => void;
  onCommitPush: (message: string) => void;
}) {
  const [checkoutBranch, setCheckoutBranch] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  if (!git) {
    return <p className="empty-state">暂无 Git 数据。</p>;
  }
  return (
    <section className="tool-section">
      <div className="metric-grid">
        <MetricCard label="Branch" value={git.currentBranch ?? "unknown"} detail={git.workspacePath} />
        <MetricCard
          label="Changes"
          value={`${git.stats.filesChanged} files`}
          detail={`+${git.stats.additions} / -${git.stats.deletions}`}
        />
      </div>
      <div className="git-actions">
        <form
          className="git-action-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCheckoutBranch(checkoutBranch);
          }}
        >
          <label className="field">
            <span>Checkout branch</span>
            <input
              list="workspace-branches"
              value={checkoutBranch}
              onChange={(event) => setCheckoutBranch(event.target.value)}
              placeholder="已有或新分支名"
              spellCheck={false}
            />
          </label>
          <datalist id="workspace-branches">
            {git.branches.map((branch) => (
              <option key={branch.name} value={branch.name} />
            ))}
          </datalist>
          <button className="secondary-button danger" disabled={!checkoutBranch.trim()} type="submit">
            <Icon name="branch" />
            <span>切换</span>
          </button>
        </form>
        <form
          className="git-action-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCommitPush(commitMessage);
          }}
        >
          <label className="field">
            <span>Commit message</span>
            <input
              value={commitMessage}
              maxLength={240}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="描述这次改动"
            />
          </label>
          <button className="primary-button danger-action" disabled={!commitMessage.trim() || !git.hasChanges} type="submit">
            <Icon name="send" />
            <span>提交</span>
          </button>
        </form>
        {actionMessage ? <pre className="git-action-output">{actionMessage}</pre> : null}
      </div>
      <div className="tool-list">
        {!git.hasChanges ? <p className="empty-state">当前工作区没有 Git 改动。</p> : null}
        {git.files.map((file) => (
          <details className="git-file-card" key={`${file.status}:${file.path}`}>
            <summary>
              <span>{file.status}</span>
              <strong>{file.path}</strong>
              <em>
                +{file.additions} / -{file.deletions}
              </em>
            </summary>
            <pre>{file.patch || "No text patch available."}</pre>
          </details>
        ))}
      </div>
    </section>
  );
}

function DirectoriesTool({
  currentWorkspacePath,
  directories,
  onBrowse,
  onReferencePath,
  onSetWorkspaceOverride,
  workspaceOverride,
}: {
  currentWorkspacePath: string | undefined;
  directories: ListWorkspaceDirectoriesResponse | null;
  onBrowse: (path: string) => void;
  onReferencePath: (kind: "dir" | "file", path: string) => void;
  onSetWorkspaceOverride: (path: string | null) => void;
  workspaceOverride: string | null;
}) {
  if (!directories) {
    return <p className="empty-state">暂无目录数据。</p>;
  }
  return (
    <section className="tool-section">
      <div className="metric-grid">
        <MetricCard label="Current" value={directories.path} detail="正在浏览" />
        <MetricCard
          label="New thread cwd"
          value={workspaceOverride ?? currentWorkspacePath ?? "默认工作区"}
          detail={workspaceOverride ? "已覆盖" : "跟随当前 relay"}
        />
      </div>
      <div className="button-row">
        <button
          className="primary-button"
          type="button"
          onClick={() => onSetWorkspaceOverride(directories.path)}
        >
          <Icon name="check" />
          <span>设为 cwd</span>
        </button>
        <button
          aria-label="引用当前目录"
          className="secondary-button"
          title="引用当前目录"
          type="button"
          onClick={() => onReferencePath("dir", directories.path)}
        >
          <Icon name="paperclip" />
          <span>引用</span>
        </button>
        {workspaceOverride ? (
          <button className="secondary-button" type="button" onClick={() => onSetWorkspaceOverride(null)}>
            <Icon name="close" />
            <span>清除</span>
          </button>
        ) : null}
      </div>
      <div className="tool-list">
        {directories.parentPath ? (
          <div className="tool-list-entry">
            <button className="tool-list-button" type="button" onClick={() => onBrowse(directories.parentPath!)}>
              <strong>../</strong>
              <span>{directories.parentPath}</span>
            </button>
            <button
              aria-label="引用父目录"
              className="secondary-button icon-only-button reference-button"
              title="引用"
              type="button"
              onClick={() => onReferencePath("dir", directories.parentPath!)}
            >
              <Icon name="paperclip" />
            </button>
          </div>
        ) : null}
        {directories.directories.length === 0 ? <p className="empty-state">没有可浏览的子目录。</p> : null}
        {directories.directories.map((directory) => (
          <div className="tool-list-entry" key={directory.path}>
            <button
              className="tool-list-button"
              type="button"
              onClick={() => onBrowse(directory.path)}
            >
              <strong>{directory.name}/</strong>
              <span>{directory.path}</span>
            </button>
            <button
              aria-label={`引用目录 ${directory.name}`}
              className="secondary-button icon-only-button reference-button"
              title="引用"
              type="button"
              onClick={() => onReferencePath("dir", directory.path)}
            >
              <Icon name="paperclip" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SkillsTool({
  onToggleSkill,
  selectedSkills,
  skills,
}: {
  onToggleSkill: (skill: AgentSkill) => void;
  selectedSkills: PromptSkill[];
  skills: AgentSkill[];
}) {
  return (
    <section className="tool-section">
      <div className="metric-grid">
        <MetricCard label="Selected" value={`${selectedSkills.length} / 12`} detail="随下一条消息发送" />
        <MetricCard label="Available" value={`${skills.length}`} detail="来自当前工作区和个人 skills" />
      </div>
      <div className="tool-list">
        {skills.length === 0 ? <p className="empty-state">暂无可用 skill。</p> : null}
        {skills.map((skill) => {
          const selected = selectedSkills.some(
            (candidate) => candidate.name === skill.name && candidate.path === skill.path,
          );
          return (
            <button
              className={`tool-list-button skill-row ${selected ? "selected" : ""}`}
              key={`${skill.source}:${skill.path}`}
              type="button"
              onClick={() => onToggleSkill(skill)}
            >
              <strong>{skill.displayName}</strong>
              <span>{skill.sourceLabel} · {skill.name}</span>
              {skill.description ? <small>{skill.description}</small> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function GoalTool({
  goal,
  onSave,
  setTools,
  tools,
}: {
  goal: ThreadGoalResponse | null;
  onSave: () => void;
  setTools: Dispatch<SetStateAction<ToolsState>>;
  tools: ToolsState;
}) {
  return (
    <section className="tool-section">
      <div className="metric-grid">
        <MetricCard
          label="Status"
          value={goal?.goal?.status ?? "未设置"}
          detail={goal?.thread.title ?? "当前会话"}
        />
        <MetricCard
          label="Usage"
          value={goal?.goal ? `${goal.goal.tokensUsed} tokens` : "暂无"}
          detail={goal?.goal?.tokenBudget ? `budget ${goal.goal.tokenBudget}` : "无预算"}
        />
      </div>
      <label className="field">
        <span>Objective</span>
        <textarea
          value={tools.goalDraft.objective}
          onChange={(event) =>
            setTools((current) => ({
              ...current,
              goalDraft: { ...current.goalDraft, objective: event.target.value },
            }))
          }
          placeholder="当前线程目标..."
        />
      </label>
      <label className="field">
        <span>Status</span>
        <select
          value={tools.goalDraft.status}
          onChange={(event) =>
            setTools((current) => ({
              ...current,
              goalDraft: {
                ...current.goalDraft,
                status: event.target.value as ThreadGoalStatus | "",
              },
            }))
          }
        >
          <option value="">保持不变</option>
          {goalStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Token budget</span>
        <input
          inputMode="numeric"
          value={tools.goalDraft.tokenBudget}
          onChange={(event) =>
            setTools((current) => ({
              ...current,
              goalDraft: { ...current.goalDraft, tokenBudget: event.target.value.replace(/\D/g, "") },
            }))
          }
          placeholder="例如 20000"
        />
      </label>
      <button className="primary-button" type="button" onClick={onSave}>
        <Icon name="save" />
        <span>保存</span>
      </button>
    </section>
  );
}

function MetricCard({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function UsageBar({ label, percent }: { label: string; percent: number | undefined }) {
  const value = percent ?? 0;
  return (
    <div className="usage-bar">
      <div>
        <span>{label}</span>
        <strong>{percent === undefined ? "-" : `${percent}%`}</strong>
      </div>
      <i style={{ width: `${value}%` }} />
    </div>
  );
}

function PairingPanel({
  pairing,
  pairingInput,
  relayUrl,
  setPairingInput,
  startPairingFromRelay,
  startPairingWithInput,
}: {
  pairing: PairingResult;
  pairingInput: string;
  relayUrl: string;
  setPairingInput: (value: string) => void;
  startPairingFromRelay: () => Promise<void>;
  startPairingWithInput: () => Promise<void>;
}) {
  return (
    <section className="pairing-shell">
      <div className="panel pairing-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Pairing</p>
            <h2>配对 Mac relay</h2>
          </div>
        </div>

        <label className="field">
          <span>Pairing link</span>
          <textarea
            value={pairingInput}
            onChange={(event) => setPairingInput(event.target.value)}
            placeholder="codex-relay://pair?serverUrl=..."
            spellCheck={false}
          />
        </label>

        <div className="button-row">
          <button className="primary-button" type="button" onClick={() => void startPairingFromRelay()}>
            从 Relay 读取
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void startPairingWithInput()}
            disabled={!pairingInput.trim()}
          >
            开始配对
          </button>
        </div>

        <div className="pairing-state" data-state={pairing.state}>
          <SignalRow label="State" value={pairingStateLabel(pairing.state)} />
          <SignalRow label="Server" value={pairing.serverUrl ?? relayUrl} />
          <SignalRow label="Approval code" value={pairing.approvalCode ?? "-"} />
        </div>

        {pairing.approvalCode ? (
          <p className="notice success">在 Mac 上 approve 这个 code 后，页面会自动进入工作台。</p>
        ) : null}

        {pairing.errorMessage ? <p className="notice">{pairing.errorMessage}</p> : null}
      </div>
    </section>
  );
}

function PreviewTargetCard({ relayUrl, target }: { relayUrl: string; target: WebPreviewTarget }) {
  const previewUrl = `${relayUrl}${apiPaths.workspaceWebPreviewProxy}/${target.port}/`;
  return (
    <article className="utility-card preview-card">
      <div>
        <p className="eyebrow">Preview</p>
        <h3>{target.label ?? `Port ${target.port}`}</h3>
        <p>{target.url ?? previewUrl}</p>
      </div>
      <a className="secondary-link" href={previewUrl} rel="noreferrer" target="_blank">
        打开预览
      </a>
    </article>
  );
}

function QueuedInputList({
  inputs,
  onRemove,
  onSteer,
}: {
  inputs: QueuedThreadInput[];
  onRemove: (inputId: string) => void;
  onSteer: (inputId: string) => void;
}) {
  return (
    <section className="utility-card queue-card" aria-label="Queued prompts">
      <div className="utility-heading">
        <div>
          <p className="eyebrow">Queue</p>
          <h3>等待发送的输入</h3>
        </div>
        <span>{inputs.length}</span>
      </div>
      <div className="queue-list">
        {inputs.map((input) => (
          <article className="queue-item" key={input.id}>
            <p>{input.prompt}</p>
            <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => onSteer(input.id)}>
                <Icon name="check" />
                <span>使用</span>
              </button>
              <button
                className="secondary-button danger"
                type="button"
                onClick={() => onRemove(input.id)}
              >
                <Icon name="trash" />
                <span>移除</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PendingInputRequestCard({
  isResolving,
  onSubmit,
  request,
}: {
  isResolving: boolean;
  onSubmit: (request: PendingInputRequest, answers: string[]) => void;
  request: PendingInputRequest;
}) {
  const [answers, setAnswers] = useState(() => request.questions.map(() => ""));

  return (
    <article className="message-card status input-request-card">
      <div className="message-meta">
        <span>input request</span>
        <time>{request.turnId ?? request.id}</time>
      </div>
      <div className="input-request-list">
        {request.questions.map((question, index) => (
          <label className="field" key={question.id}>
            <span>{question.header ?? question.id}</span>
            <p className="input-question">{question.question}</p>
            {question.options?.length ? (
              <div className="option-row">
                {question.options.map((option) => (
                  <button
                    className="secondary-button"
                    key={option.label}
                    type="button"
                    onClick={() =>
                      setAnswers((current) =>
                        current.map((answer, answerIndex) =>
                          answerIndex === index ? option.label : answer,
                        ),
                      )
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            <textarea
              value={answers[index] ?? ""}
              onChange={(event) =>
                setAnswers((current) =>
                  current.map((answer, answerIndex) =>
                    answerIndex === index ? event.target.value : answer,
                  ),
                )
              }
              placeholder="输入回答..."
            />
          </label>
        ))}
      </div>
      <button
        className="primary-button"
        disabled={isResolving}
        type="button"
        onClick={() => onSubmit(request, answers)}
      >
        提交回答
      </button>
    </article>
  );
}

function MessageCard({
  detailByKey,
  loadingDetailKeys,
  message,
  onLoadDetail,
  onResolveApproval,
  resolvingApprovalIds,
}: {
  detailByKey: Record<string, ThreadMessageDetailResponse | undefined>;
  loadingDetailKeys: ReadonlySet<string>;
  message: ChatMessage;
  onLoadDetail: (message: ChatMessage, field: ThreadMessageDetailField) => void;
  onResolveApproval: (message: ChatMessage, decision: ApprovalDecision) => void;
  resolvingApprovalIds: ReadonlySet<string>;
}) {
  const approvalId = stringDetail(message.details, "approvalId");
  const approvalResolved = booleanDetail(message.details, "approvalResolved");
  const approvalDecision = stringDetail(message.details, "approvalDecision");
  const isApproval = message.kind === "approvalRequest" && approvalId;
  const isResolving = approvalId ? resolvingApprovalIds.has(approvalId) : false;
  const outputDetail = detailByKey[messageDetailKey(message.id, "output")];
  const patchDetail = detailByKey[messageDetailKey(message.id, "patch")];
  const canLoadDetails = message.kind !== "chat" || hasDetailHints(message);
  const extraItemCount =
    messageDetailsCount(message.details) +
    (canLoadDetails ? 2 : 0) +
    (outputDetail ? 1 : 0) +
    (patchDetail ? 1 : 0);

  return (
    <article
      className={`message-card ${message.role} kind-${message.kind} ${
        isApproval ? "approval-card" : ""
      }`}
    >
      <p className="message-content">{message.content || "(empty)"}</p>
      {message.state === "streaming" ? <span className="typing-dot">streaming</span> : null}
      {isApproval ? (
        <div className="approval-actions">
          {approvalResolved || approvalDecision ? (
            <span className="approval-resolved">已处理：{approvalDecision ?? "resolved"}</span>
          ) : (
            <>
              <button
                className="primary-button"
                type="button"
                onClick={() => onResolveApproval(message, "approve")}
                disabled={isResolving}
              >
                <Icon name="check" />
                <span>允许</span>
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => onResolveApproval(message, "approve-for-session")}
                disabled={isResolving}
              >
                <Icon name="session" />
                <span>本次</span>
              </button>
              <button
                className="secondary-button danger"
                type="button"
                onClick={() => onResolveApproval(message, "deny")}
                disabled={isResolving}
              >
                <Icon name="deny" />
                <span>拒绝</span>
              </button>
            </>
          )}
        </div>
      ) : null}
      <details className="message-extra">
        <summary>
          <span>
            <Icon name="info" />
            <span>{extraItemCount > 0 ? `详情 ${extraItemCount}` : "详情"}</span>
          </span>
        </summary>
        <div className="message-extra-body">
          <div className="message-meta">
            <span>{message.kind === "chat" ? message.role : message.kind}</span>
            <time>{formatTime(message.updatedAt ?? message.createdAt)}</time>
          </div>
          {message.details ? <MessageDetailSummary details={message.details} /> : null}
          {canLoadDetails ? (
            <div className="detail-actions">
              <button
                className="secondary-button detail-action-button"
                disabled={loadingDetailKeys.has(messageDetailKey(message.id, "output"))}
                title={outputDetail ? "输出已加载" : "查看输出"}
                type="button"
                onClick={() => onLoadDetail(message, "output")}
              >
                <Icon name="terminal" />
                <span>{loadingDetailKeys.has(messageDetailKey(message.id, "output")) ? "加载" : "输出"}</span>
              </button>
              <button
                className="secondary-button detail-action-button"
                disabled={loadingDetailKeys.has(messageDetailKey(message.id, "patch"))}
                title={patchDetail ? "Patch 已加载" : "查看 Patch"}
                type="button"
                onClick={() => onLoadDetail(message, "patch")}
              >
                <Icon name="patch" />
                <span>{loadingDetailKeys.has(messageDetailKey(message.id, "patch")) ? "加载" : "Patch"}</span>
              </button>
            </div>
          ) : null}
          {outputDetail ? <DetailBlock detail={outputDetail} /> : null}
          {patchDetail ? <DetailBlock detail={patchDetail} /> : null}
        </div>
      </details>
    </article>
  );
}

function MessageDetailSummary({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(
    ([key, value]) =>
      value !== undefined &&
      value !== null &&
      key !== "output" &&
      key !== "patch" &&
      typeof value !== "object",
  );
  if (entries.length === 0) {
    return null;
  }
  return (
    <dl className="message-detail-summary">
      {entries.slice(0, 6).map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function messageDetailsCount(details: Record<string, unknown> | undefined) {
  if (!details) {
    return 0;
  }
  return Object.entries(details).filter(
    ([key, value]) =>
      value !== undefined &&
      value !== null &&
      key !== "output" &&
      key !== "patch" &&
      typeof value !== "object",
  ).length;
}

function DetailBlock({ detail }: { detail: ThreadMessageDetailResponse }) {
  return (
    <details className="detail-block">
      <summary>
        {detail.field} · {detail.originalLength} chars
      </summary>
      <pre>{detail.value}</pre>
    </details>
  );
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="signal-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function pairWithPayload(
  pairingPayload: PairingQrPayload,
  onPaired: () => Promise<void>,
  setPairing: (pairing: PairingResult) => void,
) {
  const connectionErrors: string[] = [];

  for (const serverUrl of pairingPayload.serverUrls) {
    try {
      await pairWithApproval(serverUrl, pairingPayload.serverPublicKey, onPaired, setPairing);
      localStorage.setItem(relayUrlStorageKey, normalizeRelayUrl(serverUrl));
      return;
    } catch (error) {
      connectionErrors.push(`${serverUrl}: ${errorMessage(error)}`);
    }
  }

  throw new Error(`Could not pair with any server URL. ${connectionErrors.join("; ")}`);
}

async function pairWithApproval(
  serverUrl: string,
  serverPublicKey: string,
  onPaired: () => Promise<void>,
  setPairing: (pairing: PairingResult) => void,
) {
  const normalizedServerUrl = normalizeRelayUrl(serverUrl);
  const securePairing = createSecurePairingAttempt({
    serverPublicKey,
    serverUrl: normalizedServerUrl,
  });

  setPairing({
    approvalCode: null,
    errorMessage: null,
    expiresAt: null,
    serverUrl: normalizedServerUrl,
    state: "starting",
  });

  const pending = await relayRequest(`${normalizedServerUrl}${apiPaths.pair}`, {
    body: {
      clientName: "Codex Relay Web",
      clientSessionId: getClientSessionId(),
      secure: {
        clientEphemeralPublicKey: securePairing.clientEphemeralPublicKey,
        clientNonce: securePairing.clientNonce,
        protocolVersion: 1,
      },
    },
    method: "POST",
    parse: PairResponseSchema.parse,
    withAuth: false,
  });
  if (!pending.approvalCode) {
    throw new Error("Pairing response did not include an approval code.");
  }

  attachApprovalCode(securePairing, pending.approvalCode);
  setPairing({
    approvalCode: pending.approvalCode,
    errorMessage: null,
    expiresAt: pending.approvalExpiresAt ?? null,
    serverUrl: normalizedServerUrl,
    state: "waitingApproval",
  });

  const approved = await waitForPairingApproval(normalizedServerUrl, pending.approvalCode);
  const session = completeSecurePairing(securePairing, approved);
  localStorage.setItem(clientTokenStorageKey, session.clientToken);
  localStorage.setItem(clientTokenExpiresAtStorageKey, session.clientTokenExpiresAt);
  localStorage.setItem(relayUrlStorageKey, normalizedServerUrl);
  setPairing({
    approvalCode: pending.approvalCode,
    errorMessage: null,
    expiresAt: session.clientTokenExpiresAt,
    serverUrl: normalizedServerUrl,
    state: "paired",
  });
  await onPaired();
}

async function waitForPairingApproval(serverUrl: string, approvalCode: string) {
  const deadline = Date.now() + pairingTimeoutMs;
  while (Date.now() < deadline) {
    const result = await fetchJson(`${serverUrl}${apiPaths.pairApproval(approvalCode)}`, {
      headers: {
        accept: "application/json",
      },
    });
    if (result.status === 202) {
      await sleep(1000);
      continue;
    }
    if (!result.ok) {
      throw new Error(responseErrorMessage(result.body, result.status));
    }
    return PairResponseSchema.parse(result.body);
  }

  throw new Error("Pairing approval timed out.");
}

async function relayRequest<T>(
  url: string,
  options: {
    body?: unknown;
    method?: string;
    parse: (payload: unknown) => T;
    signal?: AbortSignal;
    withAuth?: boolean;
  },
) {
  const response = await fetch(url, {
    body: options.body === undefined ? undefined : encryptRequestPayload(options.body),
    headers: requestHeaders({
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    }, options.withAuth),
    method: options.method ?? "GET",
    signal: options.signal,
  });
  const payload = decryptResponsePayload(await response.json().catch(() => undefined));

  if (!response.ok) {
    throw new Error(responseErrorMessage(payload, response.status));
  }

  return options.parse(payload);
}

async function rawRelayRequest(
  url: string,
  options: {
    body?: unknown;
    method?: string;
  } = {},
) {
  const response = await fetch(url, {
    body: options.body === undefined ? undefined : encryptRequestPayload(options.body),
    headers: requestHeaders({
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    }),
    method: options.method ?? "GET",
  });
  if (!response.ok) {
    const payload = decryptResponsePayload(await response.json().catch(() => undefined));
    throw new Error(responseErrorMessage(payload, response.status));
  }
}

async function uploadImageAttachments(url: string, files: File[]) {
  const form = new FormData();
  files.slice(0, 6).forEach((file) => form.append("images", file, file.name));
  const response = await fetch(url, {
    body: form,
    headers: requestHeaders({ accept: "application/json" }),
    method: "POST",
  });
  const payload = decryptResponsePayload(await response.json().catch(() => undefined));
  if (!response.ok) {
    throw new Error(responseErrorMessage(payload, response.status));
  }
  return ImageAttachmentUploadResponseSchema.parse(payload);
}

async function fetchJson(url: string, init?: RequestInit): Promise<JsonResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        ...headersToRecord(init?.headers),
      },
      signal: controller.signal,
    });
    const body = await readJsonBody(response);
    return {
      body,
      ok: response.ok,
      status: response.status,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

function isScrollContainerNearBottom(element: HTMLElement) {
  const scrollableDistance = element.scrollHeight - element.clientHeight;
  if (scrollableDistance <= 0) {
    return true;
  }
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= scrollableDistance * 0.05;
}

function toolGroupForTab(tab: ToolTab) {
  return toolGroups.find((group) => group.tabs.includes(tab)) ?? toolGroups[0];
}

async function openWorkspaceFileWithSystem(
  file: WorkspaceFileContentResponse,
  setMessage: Dispatch<SetStateAction<string | null>>,
) {
  if (file.binary || file.truncated) {
    setMessage("当前只支持完整文本文件。二进制文件需要 relay 提供原始下载接口。");
    return;
  }

  const exportedFile = new File([file.content], file.name, {
    type: workspaceFileMimeType(file),
  });

  try {
    if (navigator.canShare?.({ files: [exportedFile] })) {
      await navigator.share({
        files: [exportedFile],
        title: file.name,
        text: file.path,
      });
      setMessage("已交给系统分享面板。");
      return;
    }
  } catch (error) {
    setMessage(errorMessage(error));
    return;
  }

  downloadWorkspaceTextFile(exportedFile);
  setMessage("浏览器不支持直接交给系统 App，已改为下载文件。");
}

function downloadWorkspaceTextFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function workspaceFileMimeType(file: WorkspaceFileContentResponse) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "css":
      return "text/css;charset=utf-8";
    case "csv":
      return "text/csv;charset=utf-8";
    case "html":
    case "htm":
      return "text/html;charset=utf-8";
    case "js":
    case "mjs":
    case "cjs":
      return "text/javascript;charset=utf-8";
    case "json":
    case "jsonl":
    case "map":
      return "application/json;charset=utf-8";
    case "md":
    case "markdown":
      return "text/markdown;charset=utf-8";
    case "svg":
      return "image/svg+xml;charset=utf-8";
    case "ts":
    case "tsx":
      return "text/typescript;charset=utf-8";
    case "xml":
      return "application/xml;charset=utf-8";
    case "yml":
    case "yaml":
      return "application/yaml;charset=utf-8";
    default:
      return "text/plain;charset=utf-8";
  }
}

async function streamRelayEvents(input: {
  body: { prompt?: string };
  onEvent: (event: StreamThreadRunEvent) => void;
  signal: AbortSignal;
  threadId: string;
  url: string;
}) {
  const response = await fetch(input.url, {
    body: encryptRequestPayload(input.body),
    headers: requestHeaders({
      accept: "text/event-stream",
      "content-type": "application/json",
    }),
    method: "POST",
    signal: input.signal,
  });

  if (!response.ok) {
    const payload = decryptResponsePayload(await response.json().catch(() => undefined));
    throw new Error(responseErrorMessage(payload, response.status));
  }
  if (!response.body) {
    throw new Error("Relay stream response did not include a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    pending += decoder.decode(value, { stream: true });
    const chunks = pending.split(/\r?\n\r?\n/);
    pending = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const event = parseSseChunk(chunk);
      if (event) {
        input.onEvent(event);
      }
    }
  }

  pending += decoder.decode();
  if (pending.trim()) {
    const event = parseSseChunk(pending);
    if (event) {
      input.onEvent(event);
    }
  }
}

function parseSseChunk(chunk: string) {
  const data = chunk
    .split(/\r?\n/)
    .reduce<string[]>((lines, line) => {
      if (line.startsWith("data:")) {
        lines.push(line.slice("data:".length).trimStart());
      }
      return lines;
    }, [])
    .join("\n");
  if (!data) {
    return undefined;
  }

  const payload = decryptResponsePayload(JSON.parse(data));
  return StreamThreadRunEventSchema.parse(payload);
}

function applyStreamEvent(
  current: ThreadWorkspace,
  event: StreamThreadRunEvent,
  fallbackThreadId: string,
): ThreadWorkspace {
  switch (event.type) {
    case "thread.message.created":
      return withThreadDetail(current, event.thread, (messages) => upsertMessage(messages, event.message));
    case "thread.message.delta":
      return updateMessageContent(current, event.threadId, event.messageId, event.delta);
    case "thread.message.completed":
      return withThreadDetail(current, event.thread, (messages) => upsertMessage(messages, event.message));
    case "thread.state.changed":
      return {
        ...current,
        detail: current.detail
          ? { ...current.detail, thread: event.thread }
          : current.detail,
        pendingInputRequests: current.pendingInputRequests,
        queuedInputs: event.thread.state === "running" ? current.queuedInputs : [],
        streamStatus: event.thread.state === "running" ? "运行中" : threadStateLabel(event.thread.state),
        threads: upsertThread(current.threads, event.thread),
      };
    case "thread.goal.updated":
      return {
        ...current,
        detail: current.detail
          ? { ...current.detail, thread: { ...event.thread, goal: event.goal } }
          : current.detail,
        threads: upsertThread(current.threads, { ...event.thread, goal: event.goal }),
      };
    case "thread.error":
      return {
        ...current,
        errorMessage: event.error.message,
        threads: event.thread ? upsertThread(current.threads, event.thread) : current.threads,
      };
    case "thread.input_request.created":
      return {
        ...current,
        pendingInputRequests: upsertById(current.pendingInputRequests, event.request),
        threads: upsertThread(current.threads, event.thread),
      };
    case "thread.input_request.resolved":
      return {
        ...current,
        pendingInputRequests: current.pendingInputRequests.filter(
          (request) => request.id !== event.requestId,
        ),
      };
    case "thread.preview_target.detected":
      return {
        ...current,
        previewTarget: event.target,
        streamStatus: `检测到预览端口 ${event.target.port}`,
        selectedThreadId: event.threadId || fallbackThreadId,
      };
    default:
      return current;
  }
}

function withThreadDetail(
  current: ThreadWorkspace,
  thread: ThreadSummary,
  updateMessages: (messages: ChatMessage[]) => ChatMessage[],
): ThreadWorkspace {
  const detail =
    current.detail && current.detail.thread.id === thread.id
      ? {
          ...current.detail,
          messages: updateMessages(current.detail.messages),
          thread,
        }
      : {
          messages: updateMessages([]),
          pendingInputRequests: [],
          thread,
        };
  return {
    ...current,
    detail,
    selectedThreadId: thread.id,
    threads: upsertThread(current.threads, thread),
  };
}

function updateMessageContent(
  current: ThreadWorkspace,
  threadId: string,
  messageId: string,
  delta: string,
): ThreadWorkspace {
  if (!current.detail || current.detail.thread.id !== threadId) {
    return current;
  }
  const now = new Date().toISOString();
  const messages = current.detail.messages.some((message) => message.id === messageId)
    ? current.detail.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: `${message.content}${delta}`,
              state: "streaming" as const,
              updatedAt: now,
            }
          : message,
      )
    : [
        ...current.detail.messages,
        {
          content: delta,
          createdAt: now,
          id: messageId,
          kind: "chat" as const,
          role: "assistant" as const,
          state: "streaming" as const,
          threadId,
          updatedAt: now,
        },
      ];
  return { ...current, detail: { ...current.detail, messages } };
}

function markApprovalResolved(
  current: ThreadWorkspace,
  messageId: string,
  decision: ApprovalDecision,
): ThreadWorkspace {
  if (!current.detail) {
    return current;
  }
  return {
    ...current,
    detail: {
      ...current.detail,
      messages: current.detail.messages.map((message) =>
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
    },
  };
}

function approvalDecisionCopy(decision: ApprovalDecision) {
  if (decision === "approve") {
    return {
      confirmLabel: "允许",
      summary: "这会批准这一次 Codex 请求。",
      title: "确认允许",
    };
  }
  if (decision === "approve-for-session") {
    return {
      confirmLabel: "本次",
      summary: "这会在当前会话内允许同类请求。",
      title: "确认本次允许",
    };
  }
  return {
    confirmLabel: "拒绝",
    summary: "这会拒绝当前 Codex 请求。",
    title: "确认拒绝",
  };
}

function upsertThread(threads: ThreadSummary[], thread: ThreadSummary) {
  return upsertById(threads, thread).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function filterThreads(threads: ThreadSummary[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return threads;
  }
  return threads.filter((thread) =>
    [
      thread.title,
      thread.lastMessagePreview,
      thread.lastPrompt,
      thread.cwd,
      thread.id,
      thread.state,
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
}

function upsertMessage(messages: ChatMessage[], message: ChatMessage) {
  return upsertById(messages, message).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const exists = items.some((existing) => existing.id === item.id);
  return exists
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];
}

function mergeTerminalOutput(
  current: TerminalState,
  response: WorkspaceTerminalOutputResponse,
): TerminalState {
  const existingSeqs = new Set(current.output.map((chunk) => chunk.seq));
  return {
    ...current,
    errorMessage: null,
    isLoading: false,
    nextSeq: response.nextSeq,
    output: [
      ...current.output,
      ...response.chunks.filter((chunk) => !existingSeqs.has(chunk.seq)),
    ].slice(-500),
  };
}

function parseWorkspacePromptReferences(prompt: string): {
  body: string;
  references: WorkspacePromptReference[];
} {
  const references: WorkspacePromptReference[] = [];
  const bodyLines: string[] = [];
  for (const line of prompt.split(/\r?\n/)) {
    const match = /^@(file|dir)\s+(.+)$/.exec(line.trim());
    if (!match) {
      bodyLines.push(line);
      continue;
    }
    references.push({ kind: match[1] as WorkspacePromptReference["kind"], path: match[2].trim() });
  }
  return {
    body: bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    references: dedupeWorkspaceReferences(references),
  };
}

function promptWithWorkspaceReferences(body: string, references: WorkspacePromptReference[]) {
  const dedupedReferences = dedupeWorkspaceReferences(references);
  const referenceLines = dedupedReferences.map((reference) => `@${reference.kind} ${reference.path}`);
  const trimmedBody = body.trim();
  return [trimmedBody, ...referenceLines].filter(Boolean).join("\n");
}

function dedupeWorkspaceReferences(references: WorkspacePromptReference[]) {
  const seen = new Set<string>();
  const deduped: WorkspacePromptReference[] = [];
  for (const reference of references) {
    const path = reference.path.trim();
    if (!path) {
      continue;
    }
    const key = `${reference.kind}:${path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({ kind: reference.kind, path });
  }
  return deduped;
}

function workspaceReferenceKindLabel(kind: WorkspacePromptReference["kind"]) {
  return kind === "file" ? "文件" : "目录";
}

function workspaceReferenceChipLabel(reference: WorkspacePromptReference) {
  const name = workspacePathBasename(reference.path) || reference.path;
  return `${workspaceReferenceKindLabel(reference.kind)} ${name}`;
}

function workspacePathBasename(path: string) {
  const normalized = path.replace(/[/\\]+$/, "");
  const parts = normalized.split(/[/\\]/).filter(Boolean);
  return parts.at(-1) ?? normalized;
}

function promptRunContext(
  prompt: string,
  context: { attachments: PromptAttachment[]; skills: PromptSkill[] },
) {
  return {
    ...(context.attachments.length > 0 ? { attachments: context.attachments } : {}),
    prompt,
    ...(context.skills.length > 0 ? { skills: context.skills } : {}),
  };
}

function requestHeaders(
  extraHeaders: Record<string, string> = {},
  withAuth: boolean | undefined = true,
) {
  const headers: Record<string, string> = {
    ...extraHeaders,
    "x-codex-relay-client-session-id": getClientSessionId(),
  };
  const clientToken = localStorage.getItem(clientTokenStorageKey);
  if (withAuth && clientToken) {
    headers.authorization = `Bearer ${clientToken}`;
  }
  return headers;
}

function headersToRecord(headers: HeadersInit | undefined) {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(new Headers(headers).entries());
}

async function readJsonBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function responseErrorMessage(body: unknown, status: number) {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") {
      return error.message;
    }
  }

  return `Relay returned HTTP ${status}.`;
}

function normalizeRelayUrl(url: string) {
  const trimmedUrl = url.trim() || defaultRelayUrl;
  return trimmedUrl.replace(/\/+$/, "");
}

function readInitialRelayUrl() {
  return localStorage.getItem(relayUrlStorageKey) ?? defaultRelayUrl;
}

function parsePairingPayloadResponse(response: PairingPayloadResponse) {
  return parsePairingQrPayload(response.pairingPayload);
}

function parsePairingQrPayload(payload: unknown): PairingQrPayload {
  if (typeof payload !== "string" || !payload.trim()) {
    throw new Error("Pairing link is empty.");
  }

  const rawPayload = payload.trim();
  if (rawPayload.startsWith("{")) {
    return parsePairingJsonPayload(rawPayload);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawPayload);
  } catch {
    throw new Error("Paste the pairing link printed by Codex Relay.");
  }

  const isSupportedProtocol =
    (parsed.protocol === "codex-relay:" || parsed.protocol === "jlt-relay:") &&
    parsed.hostname === "pair";
  if (!isSupportedProtocol) {
    throw new Error("Pairing link must start with codex-relay://pair or jlt-relay://pair.");
  }

  const serverUrl = parsed.searchParams.get("serverUrl");
  const serverPublicKey = parsed.searchParams.get("serverPublicKey")?.trim();
  if (!serverUrl || !serverPublicKey) {
    throw new Error("Pairing link is missing serverUrl or serverPublicKey.");
  }

  const normalizedServerUrl = normalizeRelayUrl(serverUrl);
  return {
    serverPublicKey,
    serverUrl: normalizedServerUrl,
    serverUrls: parsePairingServerUrls(parsed, normalizedServerUrl),
  };
}

function parsePairingJsonPayload(payload: string): PairingQrPayload {
  const parsed = JSON.parse(payload) as Partial<PairingQrPayload>;
  if (typeof parsed.serverUrl !== "string" || typeof parsed.serverPublicKey !== "string") {
    throw new Error("Pairing JSON is missing serverUrl or serverPublicKey.");
  }
  const serverUrl = normalizeRelayUrl(parsed.serverUrl);
  return {
    serverPublicKey: parsed.serverPublicKey,
    serverUrl,
    serverUrls: dedupeServerUrls([serverUrl, ...(parsed.serverUrls ?? [])]),
  };
}

function parsePairingServerUrls(parsed: URL, fallbackServerUrl: string) {
  const urls = [
    fallbackServerUrl,
    ...parseCompactPairingHosts(parsed.searchParams.get("h"), fallbackServerUrl),
    ...parseCompactPairingHosts(parsed.searchParams.get("serverHosts"), fallbackServerUrl),
    ...parsePairingServerUrlsParam(parsed.searchParams.get("serverUrls")),
  ];
  return dedupeServerUrls(urls);
}

function parseCompactPairingHosts(value: string | null, fallbackServerUrl: string) {
  if (!value) {
    return [];
  }

  try {
    const fallback = new URL(fallbackServerUrl);
    const port = fallback.port ? `:${fallback.port}` : "";
    return value
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean)
      .map((host) => `${fallback.protocol}//${host}${port}`);
  } catch {
    return [];
  }
}

function parsePairingServerUrlsParam(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((url): url is string => typeof url === "string")
      : [];
  } catch {
    return [];
  }
}

function dedupeServerUrls(urls: string[]) {
  const deduped = new Set<string>();
  for (const url of urls) {
    try {
      deduped.add(normalizeRelayUrl(url));
    } catch {
      continue;
    }
  }
  return [...deduped];
}

function statusLabel(state: ProbeState) {
  switch (state) {
    case "checking":
      return "探测中";
    case "online":
      return "已连接";
    case "needsPairing":
      return "需要配对";
    case "offline":
      return "离线";
    default:
      return "待探测";
  }
}

function sessionValue(probe: ProbeResult) {
  if (probe.status) {
    return "已授权";
  }
  if (probe.state === "offline") {
    return "不可用";
  }
  return "等待探测";
}

function pairingStateLabel(state: PairingState) {
  switch (state) {
    case "starting":
      return "发起中";
    case "waitingApproval":
      return "等待 Mac approve";
    case "paired":
      return "已配对";
    case "failed":
      return "失败";
    default:
      return "未开始";
  }
}

function threadStateLabel(state: ThreadSummary["state"]) {
  switch (state) {
    case "running":
      return "运行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return "空闲";
  }
}

function promptTitle(value: string) {
  const title = value.split(/\r?\n/)[0]?.trim() || "New Codex Thread";
  return title.length > 80 ? `${title.slice(0, 77)}...` : title;
}

function stringDetail(details: ChatMessage["details"] | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value : undefined;
}

function booleanDetail(details: ChatMessage["details"] | undefined, key: string) {
  return details?.[key] === true;
}

function messageDetailKey(messageId: string, field: ThreadMessageDetailField) {
  return `${messageId}:${field}`;
}

function hasDetailHints(message: ChatMessage) {
  return Boolean(
    message.details &&
      ("output" in message.details ||
        "patch" in message.details ||
        "command" in message.details ||
        "exitCode" in message.details ||
        "files" in message.details),
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hasClientToken() {
  return Boolean(localStorage.getItem(clientTokenStorageKey));
}

function getClientSessionId() {
  const existing = localStorage.getItem(clientSessionIdStorageKey);
  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID?.() ?? createUuidV4();
  localStorage.setItem(clientSessionIdStorageKey, next);
  return next;
}

function createUuidV4() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function queryString(input: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value?.trim()) {
      params.set(key, value.trim());
    }
  }
  return params.toString();
}

function contextPercent(tokensUsed: number, tokenLimit: number) {
  if (tokenLimit <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((tokensUsed / tokenLimit) * 100));
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function countLines(value: string) {
  if (!value) {
    return 0;
  }
  return value.split("\n").length;
}

function gitActionMessage(message: string, output: string) {
  return [message, output.trim()].filter(Boolean).join("\n\n");
}

function chooseAutomationWorkspacePath(
  automation: AutomationSummary,
  currentWorkspacePath: string | undefined,
) {
  if (currentWorkspacePath && automation.cwds.includes(currentWorkspacePath)) {
    return currentWorkspacePath;
  }
  return automation.cwds[0] ?? currentWorkspacePath;
}

function compactText(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatUnixTime(value: number | undefined) {
  if (!value) {
    return "-";
  }
  return new Date(value * 1000).toLocaleString();
}

function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Relay request timed out.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown relay error.";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
