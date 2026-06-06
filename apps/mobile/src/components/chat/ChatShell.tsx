import type {
  ChatMessage,
  AgentSkill,
  ContextWindowUsage,
  PendingInputRequest,
  RateLimitBucket,
  ThreadCollaborationMode,
  ThreadGoal,
} from "codex-relay/api-schema";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Keyboard, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  KeyboardController,
  KeyboardGestureArea,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Icon, type AppIconName } from "@/components/ui/icon";
import { Colors, MaxContentWidth, Spacing } from "@/constants/theme";
import { hapticSelection } from "@/lib/haptics";
import type { QueuedComposerPrompt } from "@/state/chat-store";

import { ChatComposer } from "./ChatComposer";
import { implementablePlanId, MessageTimeline } from "./MessageTimeline";
import type { WorkspaceMarkdownPreviewTarget } from "./workspace-preview/markdown-target";

export type ChatShellAction = {
  disabled?: boolean;
  icon: AppIconName;
  label: string;
  onPress: () => void;
};

type ChatShellComposerFooterRender = (actions: { closeAddSheet: () => void }) => ReactNode;

export function ChatShell({
  banner,
  composerDisabled,
  composerDisabledPlaceholder,
  composerFooter,
  composerFocusRequestKey,
  composerFocusRecoveryKey,
  composerInputEditable,
  contextWindowUsage,
  collaborationMode,
  goal,
  inputNativeID,
  isAttachingImage,
  isLoadingMessages,
  isRunning,
  leadingAction,
  messages,
  onAttachImage,
  onCancel,
  onCollaborationModeChange,
  onAddPlanContext,
  onImplementPlan,
  onIgnoreInputRequest,
  onOpenMarkdownAttachment,
  onMessageCopied,
  onRefreshUsageStatus,
  onSubmitInputRequest,
  onRemoveQueuedPrompt,
  onRestoreQueuedPrompt,
  onSend,
  onSteerQueuedPrompt,
  onClearGoal,
  onSaveGoal,
  onToggleGoalPause,
  queuedPrompts,
  rateLimitBuckets,
  pendingInputRequest,
  skills,
  skillsLoadState,
  subtitle,
  threadId,
  title,
  trailingActions,
  workspacePath,
}: {
  banner?: ReactNode;
  composerDisabled: boolean;
  composerDisabledPlaceholder?: string;
  composerFooter?: ReactNode | ChatShellComposerFooterRender;
  composerFocusRequestKey?: number;
  composerFocusRecoveryKey?: number | string;
  composerInputEditable?: boolean;
  contextWindowUsage?: ContextWindowUsage;
  collaborationMode: ThreadCollaborationMode;
  goal?: ThreadGoal | null;
  inputNativeID: string;
  isAttachingImage: boolean;
  isLoadingMessages?: boolean;
  isRunning: boolean;
  leadingAction: ChatShellAction;
  messages: ChatMessage[];
  onAttachImage: () => Promise<void> | void;
  onCancel: () => void;
  onCollaborationModeChange: (mode: ThreadCollaborationMode) => void;
  onAddPlanContext?: (context: string) => void;
  onImplementPlan?: () => void;
  onIgnoreInputRequest?: (request: PendingInputRequest) => void;
  onMessageCopied?: () => void;
  onOpenMarkdownAttachment?: (target: WorkspaceMarkdownPreviewTarget) => void;
  onRefreshUsageStatus?: () => Promise<void> | void;
  onSubmitInputRequest?: (request: PendingInputRequest, answers: string[]) => void;
  onRemoveQueuedPrompt?: (item: QueuedComposerPrompt) => void;
  onRestoreQueuedPrompt?: (item: QueuedComposerPrompt) => void;
  onSend: () => void;
  onSteerQueuedPrompt?: (item: QueuedComposerPrompt) => void;
  onClearGoal?: () => void;
  onSaveGoal?: (objective: string) => void;
  onToggleGoalPause?: () => void;
  queuedPrompts: QueuedComposerPrompt[];
  rateLimitBuckets: RateLimitBucket[];
  pendingInputRequest?: PendingInputRequest;
  skills: AgentSkill[];
  skillsLoadState: "idle" | "loading" | "loaded" | "failed";
  subtitle: string;
  threadId?: string;
  title: string;
  trailingActions: ChatShellAction[];
  workspacePath?: string;
}) {
  const insets = useSafeAreaInsets();
  const [isKeyboardLayoutFrozen, setKeyboardLayoutFrozen] = useState(false);
  const [queuedPromptPanelHeight, setQueuedPromptPanelHeight] = useState(0);
  const implementablePlanMessageId = useMemo(
    () => (!isRunning ? implementablePlanId(messages) : undefined),
    [isRunning, messages],
  );
  const handleQueuedPromptPanelHeightChange = useCallback((height: number) => {
    setQueuedPromptPanelHeight((current) => (Math.abs(current - height) < 1 ? current : height));
  }, []);
  const handleTimelineKeyboardDismissRequest = useCallback(() => {
    setKeyboardLayoutFrozen(false);
    Keyboard.dismiss();
    void KeyboardController.dismiss().catch(() => undefined);
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={[
          styles.safeArea,
          { paddingBottom: Math.max(Spacing.one, insets.bottom - Spacing.four) },
        ]}
      >
        <View style={styles.shell}>
          <View pointerEvents="box-none" style={styles.header}>
            <HeaderButton action={leadingAction} />
            <View pointerEvents="none" style={styles.titleGroup}>
              <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
                {title}
              </ThemedText>
              <ThemedText
                type="code"
                themeColor="textSecondary"
                style={styles.subtitle}
                numberOfLines={1}
              >
                {subtitle}
              </ThemedText>
            </View>
            <View pointerEvents="box-none" style={styles.headerActions}>
              {trailingActions.map((action) => (
                <HeaderButton key={action.label} action={action} />
              ))}
            </View>
          </View>

          {banner}

          <KeyboardGestureArea
            interpolator="ios"
            style={styles.chatBody}
            textInputNativeID={inputNativeID}
          >
            <View style={styles.timeline}>
              <MessageTimeline
                isLoading={isLoadingMessages}
                isRunning={isRunning}
                keyboardLayoutFrozen={isKeyboardLayoutFrozen}
                messages={messages}
                onMessageCopied={onMessageCopied}
                onOpenMarkdownAttachment={onOpenMarkdownAttachment}
                onKeyboardDismissRequest={handleTimelineKeyboardDismissRequest}
                bottomAccessoryHeight={queuedPromptPanelHeight}
                threadId={threadId}
              />
            </View>

            <KeyboardStickyView style={styles.composerDock}>
              <ChatComposer
                collaborationMode={collaborationMode}
                composerThreadId={threadId}
                contextWindowUsage={contextWindowUsage}
                goal={goal}
                disabled={composerDisabled}
                disabledPlaceholder={composerDisabledPlaceholder}
                inputEditable={composerInputEditable}
                focusRequestKey={composerFocusRequestKey}
                focusRecoveryKey={composerFocusRecoveryKey}
                isAttachingImage={isAttachingImage}
                isRunning={isRunning}
                nativeID={inputNativeID}
                onAttachImage={onAttachImage}
                onCancel={onCancel}
                onCollaborationModeChange={onCollaborationModeChange}
                onAddPlanContext={onAddPlanContext}
                onImplementPlan={onImplementPlan}
                onIgnoreInputRequest={onIgnoreInputRequest}
                onRefreshUsageStatus={onRefreshUsageStatus}
                onSubmitInputRequest={onSubmitInputRequest}
                onKeyboardLayoutFrozenChange={setKeyboardLayoutFrozen}
                onRemoveQueuedPrompt={onRemoveQueuedPrompt}
                onRestoreQueuedPrompt={onRestoreQueuedPrompt}
                onSend={onSend}
                onSteerQueuedPrompt={onSteerQueuedPrompt}
                onClearGoal={onClearGoal}
                onSaveGoal={onSaveGoal}
                onToggleGoalPause={onToggleGoalPause}
                onQueuedPromptPanelHeightChange={handleQueuedPromptPanelHeightChange}
                planConfirmationId={implementablePlanMessageId}
                pendingInputRequest={pendingInputRequest}
                queuedPrompts={queuedPrompts}
                rateLimitBuckets={rateLimitBuckets}
                skills={skills}
                skillsLoadState={skillsLoadState}
                footer={composerFooter}
                workspacePath={workspacePath}
              />
            </KeyboardStickyView>
          </KeyboardGestureArea>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function HeaderButton({ action }: { action: ChatShellAction }) {
  return (
    <Pressable
      accessibilityLabel={action.label}
      accessibilityRole="button"
      disabled={action.disabled}
      hitSlop={8}
      onPress={action.onPress}
      onPressIn={action.disabled ? undefined : hapticSelection}
      pressRetentionOffset={12}
      style={({ pressed }) => [
        styles.headerButton,
        action.disabled && styles.headerButtonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={action.icon} size={17} tintColor={Colors.dark.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  shell: {
    backgroundColor: Colors.dark.background,
    flex: 1,
    gap: 0,
    paddingTop: Spacing.one,
  },
  header: {
    alignItems: "center",
    elevation: 4,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 8,
    paddingHorizontal: 18,
    paddingTop: 6,
    zIndex: 4,
  },
  headerActions: {
    elevation: 6,
    flexDirection: "row",
    flexShrink: 0,
    gap: 10,
    zIndex: 6,
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: "rgba(42, 42, 42, 0.8)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    position: "relative",
    width: 36,
    zIndex: 7,
  },
  headerButtonDisabled: {
    opacity: 0.45,
  },
  titleGroup: {
    alignItems: "center",
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 10,
    lineHeight: 14,
    maxWidth: "100%",
    opacity: 0.84,
    textAlign: "center",
  },
  timeline: {
    flex: 1,
    minHeight: 0,
  },
  chatBody: {
    flex: 1,
    minHeight: 0,
  },
  composerDock: {
    elevation: 8,
    flexShrink: 0,
    position: "relative",
    zIndex: 8,
  },
  pressed: {
    opacity: 0.7,
  },
});
