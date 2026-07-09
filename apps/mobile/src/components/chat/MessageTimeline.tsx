import type { ChatMessage } from "codex-relay/api-schema";
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
  type MaintainScrollAtEndOptions,
  type MaintainVisibleContentPositionConfig,
} from "@legendapp/list/react-native";
import { useCallback, useEffect, useRef, useState, type ElementRef, type Ref } from "react";
import { ActivityIndicator, View, type ScrollViewProps } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  KeyboardChatScrollView,
  type KeyboardChatScrollViewProps,
} from "react-native-keyboard-controller";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Colors, Spacing } from "@/constants/theme";

import { MessageBubble } from "./MessageBubble";
import type { WorkspaceMarkdownPreviewTarget } from "./workspace-preview/markdown-target";

type KeyboardListScrollViewProps = ScrollViewProps & KeyboardChatScrollViewProps;

const MESSAGE_ESTIMATED_ITEM_SIZE = 76;
const RUNNING_PULSE_HALF_DURATION_MS = 760;
const RUNNING_DOT_STAGGER_MS = RUNNING_PULSE_HALF_DURATION_MS / 3;
const MAINTAIN_SCROLL_AT_END: MaintainScrollAtEndOptions = {
  animated: false,
  on: {
    dataChange: true,
    itemLayout: true,
    layout: true,
  },
};
const MAINTAIN_VISIBLE_CONTENT_POSITION: MaintainVisibleContentPositionConfig<ChatMessage> = {
  data: false,
  size: true,
};
const MAINTAIN_SCROLL_AT_END_THRESHOLD = 0.1;
const TIMELINE_LOADING_ENTER = FadeIn.duration(140).easing(Easing.out(Easing.cubic));
const TIMELINE_LOADING_EXIT = FadeOut.duration(120).easing(Easing.out(Easing.cubic));
const TIMELINE_CONTENT_SETTLE_OFFSET = 10;

function KeyboardListScrollView({
  ref,
  ...props
}: KeyboardListScrollViewProps & {
  ref?: Ref<ElementRef<typeof KeyboardChatScrollView>>;
}) {
  const { bottom } = useSafeAreaInsets();

  return (
    <KeyboardChatScrollView
      ref={ref}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
      keyboardLiftBehavior="whenAtEnd"
      offset={bottom - 24}
      scrollEventThrottle={48}
      {...props}
    />
  );
}

export function MessageTimeline({
  bottomAccessoryHeight = 0,
  isLoading,
  isRunning,
  keyboardLayoutFrozen = false,
  messages,
  onKeyboardDismissRequest,
  onMessageCopied,
  onOpenMarkdownAttachment,
  threadId,
}: {
  bottomAccessoryHeight?: number;
  isLoading?: boolean;
  isRunning: boolean;
  keyboardLayoutFrozen?: boolean;
  messages: ChatMessage[];
  onKeyboardDismissRequest?: () => void;
  onMessageCopied?: () => void;
  onOpenMarkdownAttachment?: (target: WorkspaceMarkdownPreviewTarget) => void;
  threadId?: string;
}) {
  const listRef = useRef<LegendListRef | null>(null);
  const rows = messages;
  const timelineKey = threadId ?? "no-thread";
  const [settledTimelineKey, setSettledTimelineKey] = useState<string | undefined>(undefined);
  const extraContentPadding = useSharedValue(0);
  const contentRevealProgress = useSharedValue(0);
  const hasRows = rows.length > 0;
  const isTimelineReady = !hasRows || settledTimelineKey === timelineKey;
  const showLoadingConversation = isLoading || (hasRows && !isTimelineReady);
  const timelineContentStyle = useAnimatedStyle(() => ({
    opacity: contentRevealProgress.value,
    transform: [{ translateY: TIMELINE_CONTENT_SETTLE_OFFSET * (1 - contentRevealProgress.value) }],
  }));

  useEffect(() => {
    extraContentPadding.value = withTiming(Math.max(0, bottomAccessoryHeight), {
      duration: 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [bottomAccessoryHeight, extraContentPadding]);

  useEffect(() => {
    setSettledTimelineKey(undefined);
  }, [timelineKey]);

  useEffect(() => {
    if (isLoading || !hasRows) {
      return;
    }
    let didCancel = false;
    let settleFrame: number | undefined;
    const layoutFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(() => {
        if (!didCancel) {
          setSettledTimelineKey(timelineKey);
        }
      });
    });
    return () => {
      didCancel = true;
      cancelAnimationFrame(layoutFrame);
      if (settleFrame !== undefined) {
        cancelAnimationFrame(settleFrame);
      }
    };
  }, [hasRows, isLoading, timelineKey]);

  useEffect(() => {
    contentRevealProgress.value = withTiming(showLoadingConversation ? 0 : 1, {
      duration: showLoadingConversation ? 120 : 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [contentRevealProgress, showLoadingConversation]);

  const renderMessage = useCallback(
    ({ item }: LegendListRenderItemProps<ChatMessage>) => (
      <MessageBubble
        message={item}
        onMessageCopied={onMessageCopied}
        onOpenMarkdownAttachment={onOpenMarkdownAttachment}
      />
    ),
    [onMessageCopied, onOpenMarkdownAttachment],
  );
  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <KeyboardListScrollView
        {...props}
        extraContentPadding={extraContentPadding}
        freeze={keyboardLayoutFrozen}
      />
    ),
    [extraContentPadding, keyboardLayoutFrozen],
  );
  const handleTimelineLoad = useCallback(() => {
    requestAnimationFrame(() => {
      setSettledTimelineKey(timelineKey);
    });
  }, [timelineKey]);

  return (
    <View onTouchStart={onKeyboardDismissRequest} style={styles.transitionHost}>
      {!isLoading ? (
        rows.length === 0 && !isRunning ? (
          <Animated.View style={[styles.transitionScene, timelineContentStyle]}>
            <View style={styles.empty}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Send a message to start the conversation.
              </ThemedText>
            </View>
          </Animated.View>
        ) : (
          <Animated.View style={[styles.transitionScene, timelineContentStyle]}>
            <LegendList
              key={timelineKey}
              ref={listRef}
              alignItemsAtEnd
              data={rows}
              estimatedItemSize={MESSAGE_ESTIMATED_ITEM_SIZE}
              getItemType={messageItemType}
              initialScrollAtEnd
              keyExtractor={messageKeyExtractor}
              renderItem={renderMessage}
              contentContainerStyle={styles.content}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              maintainScrollAtEnd={MAINTAIN_SCROLL_AT_END}
              maintainScrollAtEndThreshold={MAINTAIN_SCROLL_AT_END_THRESHOLD}
              maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION}
              onLoad={handleTimelineLoad}
              recycleItems={false}
              renderScrollComponent={renderScrollComponent}
              showsVerticalScrollIndicator={false}
              style={styles.list}
              ListFooterComponent={
                isRunning ? <RunningFooter /> : <View style={styles.listEndPad} />
              }
            />
          </Animated.View>
        )
      ) : null}
      {showLoadingConversation ? (
        <Animated.View
          key={`loading-${timelineKey}`}
          entering={TIMELINE_LOADING_ENTER}
          exiting={TIMELINE_LOADING_EXIT}
          style={styles.transitionScene}
        >
          <LoadingConversation />
        </Animated.View>
      ) : null}
    </View>
  );
}

function messageKeyExtractor(message: ChatMessage) {
  return message.id;
}

function messageItemType(message: ChatMessage) {
  if (message.kind === "plan") {
    return "plan";
  }
  if (message.kind === "fileChange") {
    return "protocol";
  }
  if (message.role === "status" || message.role === "tool" || message.role === "reasoning") {
    return "meta";
  }
  if (message.kind !== "chat" && message.kind !== "unknown") {
    return "protocol";
  }
  return message.role;
}

function LoadingConversation() {
  return (
    <View style={styles.empty} accessibilityRole="progressbar">
      <ActivityIndicator color={Colors.dark.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
        Loading conversation…
      </ThemedText>
    </View>
  );
}

export function implementablePlanId(messages: ChatMessage[]) {
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

function RunningFooter() {
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.runningFooter}>
      <View style={styles.dots}>
        <RunningDot delayMs={0} />
        <RunningDot delayMs={RUNNING_DOT_STAGGER_MS} />
        <RunningDot delayMs={RUNNING_DOT_STAGGER_MS * 2} />
      </View>
      <RunningLabel />
    </Animated.View>
  );
}

function RunningDot({ delayMs }: { delayMs: number }) {
  const motionProgress = useSharedValue(0);
  const pulseProgress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.58 + pulseProgress.value * 0.32,
    transform: [{ translateY: -2 * motionProgress.value }],
  }));

  useEffect(() => {
    motionProgress.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: RUNNING_PULSE_HALF_DURATION_MS,
            easing: Easing.inOut(Easing.cubic),
          }),
          withTiming(0, {
            duration: RUNNING_PULSE_HALF_DURATION_MS,
            easing: Easing.inOut(Easing.cubic),
          }),
        ),
        -1,
        false,
      ),
    );
    pulseProgress.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: RUNNING_PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(0, {
          duration: RUNNING_PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        }),
      ),
      -1,
      false,
    );
  }, [delayMs, motionProgress, pulseProgress]);

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

function RunningLabel() {
  const progress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.58 + progress.value * 0.32,
  }));

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: RUNNING_PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(0, {
          duration: RUNNING_PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        }),
      ),
      -1,
      false,
    );
  }, [progress]);

  return (
    <Animated.View style={animatedStyle}>
      <ThemedText type="code" themeColor="textSecondary">
        Working…
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  empty: {
    alignItems: "center",
    flex: 1,
    gap: Spacing.two,
    justifyContent: "center",
    padding: Spacing.four,
  },
  emptyText: {
    maxWidth: 260,
    textAlign: "center",
  },
  list: {
    flex: 1,
  },
  transitionHost: {
    flex: 1,
    overflow: "hidden",
  },
  transitionScene: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  listEndPad: {
    height: Spacing.two,
  },
  runningFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "center",
    paddingBottom: Spacing.four,
    paddingTop: Spacing.two,
  },
  dots: {
    flexDirection: "row",
    gap: 3,
  },
  dot: {
    backgroundColor: "rgba(176, 180, 186, 0.55)",
    borderRadius: 3,
    height: 6,
    width: 6,
  },
});
