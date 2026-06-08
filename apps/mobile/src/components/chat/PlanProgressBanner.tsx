import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { Colors, Spacing } from "@/constants/theme";
import { hapticSelection } from "@/lib/haptics";

import {
  activePlanProgressStep,
  type TimelinePlanProgress,
  type TimelinePlanProgressStepStatus,
} from "./plan-progress";

export function PlanProgressBanner({
  isRunning,
  progress,
}: {
  isRunning?: boolean;
  progress?: TimelinePlanProgress;
}) {
  const [isExpanded, setExpanded] = useState(false);

  if (!progress && !isRunning) {
    return null;
  }

  if (!progress) {
    return (
      <Animated.View entering={FadeIn.duration(160)} style={styles.bannerHost}>
        <View
          accessible
          accessibilityLabel="Codex is working"
          accessibilityRole="progressbar"
          style={styles.banner}
        >
          <View style={styles.summaryContent}>
            <ThemedText type="code" style={styles.label}>
              Plan
            </ThemedText>
            <View style={styles.summaryRow}>
              <PlanProgressMarker status="inProgress" />
              <ThemedText type="small" numberOfLines={1} style={styles.summaryText}>
                Working...
              </ThemedText>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  const completedStepCount = progress.steps.filter((step) => step.status === "completed").length;
  const stepCount = progress.steps.length;
  const activeStep = activePlanProgressStep(progress);

  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.bannerHost}>
      <Pressable
        accessibilityLabel={`Plan progress: ${completedStepCount} of ${stepCount} steps completed`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityValue={{ max: stepCount, min: 0, now: completedStepCount }}
        onPress={() => {
          hapticSelection();
          setExpanded((current) => !current);
        }}
        style={({ pressed }) => [styles.banner, pressed && styles.bannerPressed]}
      >
        <View style={styles.summaryContent}>
          <ThemedText type="code" style={styles.label}>
            Plan
          </ThemedText>
          <View style={styles.summaryRow}>
            {activeStep ? <PlanProgressMarker status={activeStep.status} /> : null}
            <ThemedText type="small" numberOfLines={1} style={styles.summaryText}>
              {activeStep ? activeStep.text : "Updating plan"}
            </ThemedText>
            <View style={styles.trailingGroup}>
              <ThemedText type="code" style={styles.countText}>
                {completedStepCount}/{stepCount}
              </ThemedText>
              <Icon
                name={isExpanded ? "expand" : "chevronRight"}
                size={16}
                tintColor={Colors.dark.textSecondary}
              />
            </View>
          </View>
        </View>
      </Pressable>

      {isExpanded ? (
        <Animated.View entering={FadeIn.duration(120)} style={styles.expandedPanel}>
          {progress.steps.map((step) => (
            <View
              key={step.id}
              accessible
              accessibilityLabel={`${planProgressStatusLabel(step.status)}: ${step.text}`}
              style={styles.stepRow}
            >
              <View style={styles.stepMarkerSlot}>
                <PlanProgressMarker status={step.status} />
              </View>
              <ThemedText
                numberOfLines={2}
                type="small"
                style={[styles.stepText, step.status === "pending" && styles.stepTextPending]}
              >
                {step.text}
              </ThemedText>
            </View>
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function planProgressStatusLabel(status: TimelinePlanProgressStepStatus) {
  switch (status) {
    case "completed":
      return "Completed";
    case "inProgress":
      return "In progress";
    case "pending":
      return "Pending";
  }
}

function PlanProgressMarker({ status }: { status: TimelinePlanProgressStepStatus }) {
  const rotation = useSharedValue(0);
  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  useEffect(() => {
    if (status !== "inProgress") {
      rotation.value = 0;
      return;
    }
    rotation.value = withRepeat(withTiming(360, { duration: 900 }), -1, false);
  }, [rotation, status]);

  if (status === "completed") {
    return (
      <View style={[styles.marker, styles.markerCompleted]}>
        <Icon name="check" size={8} tintColor="#151515" strokeWidth={3} />
      </View>
    );
  }

  if (status === "inProgress") {
    return (
      <View style={[styles.marker, styles.markerActive]}>
        <Animated.View style={spinnerStyle}>
          <Icon name="running" size={9} tintColor="#151515" strokeWidth={2.8} />
        </Animated.View>
      </View>
    );
  }

  return <View style={[styles.marker, styles.markerPending]} />;
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "rgba(42, 42, 42, 0.9)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  bannerHost: {
    elevation: 20,
    left: Spacing.four,
    position: "absolute",
    right: Spacing.four,
    top: 58,
    zIndex: 20,
  },
  bannerPressed: {
    opacity: 0.78,
  },
  countText: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
  },
  expandedPanel: {
    backgroundColor: "rgba(42, 42, 42, 0.96)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    elevation: 20,
    gap: Spacing.one,
    left: 0,
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    position: "absolute",
    right: 0,
    top: "100%",
    zIndex: 20,
  },
  label: {
    color: "#9B8BD4",
    fontSize: 12,
    lineHeight: 16,
  },
  marker: {
    alignItems: "center",
    borderRadius: 7,
    height: 14,
    justifyContent: "center",
    width: 14,
  },
  markerActive: {
    backgroundColor: "#9B8BD4",
  },
  markerCompleted: {
    backgroundColor: "#8FD19E",
  },
  markerPending: {
    borderColor: "rgba(176, 180, 186, 0.42)",
    borderWidth: 1,
  },
  stepRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 7,
    minHeight: 22,
  },
  stepMarkerSlot: {
    paddingTop: 2,
  },
  stepText: {
    color: Colors.dark.text,
    flex: 1,
    lineHeight: 18,
  },
  stepTextPending: {
    color: Colors.dark.textSecondary,
  },
  summaryContent: {
    gap: 2,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  summaryText: {
    color: Colors.dark.text,
    flex: 1,
    lineHeight: 20,
    minWidth: 0,
  },
  trailingGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.one,
  },
});
