import { observable } from "@legendapp/state";
import type { WorkspacePreviewTab } from "codex-relay/api-schema";

type PendingWorkspacePreviewRequest = {
  requestId: number;
  tab: Exclude<WorkspacePreviewTab, "markdown">;
  workspacePath?: string;
};

type PendingWorkspacePreviewState = {
  request?: PendingWorkspacePreviewRequest;
};

let nextRequestId = 1;

export const pendingWorkspacePreviewStore$ = observable<PendingWorkspacePreviewState>({
  request: undefined,
});

export function requestWorkspacePreviewOpen(
  tab: PendingWorkspacePreviewRequest["tab"],
  workspacePath?: string,
) {
  pendingWorkspacePreviewStore$.request.set({
    requestId: nextRequestId++,
    tab,
    workspacePath,
  });
}

export function clearPendingWorkspacePreviewRequest(requestId: number) {
  const current = pendingWorkspacePreviewStore$.request.peek();
  if (current?.requestId === requestId) {
    pendingWorkspacePreviewStore$.request.set(undefined);
  }
}
