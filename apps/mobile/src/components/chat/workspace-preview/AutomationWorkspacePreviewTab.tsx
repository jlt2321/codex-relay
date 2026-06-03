import type { AutomationSummary } from "codex-relay/api-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { listAutomations, runAutomation } from "@/lib/codex-relay-api";
import { hapticSelection } from "@/lib/haptics";
import { serverStateKeys } from "@/lib/server-state";

const AUTOMATIONS_QUERY_KEY = ["codex-relay-automations"] as const;

export const AutomationWorkspacePreviewTab = memo(function AutomationWorkspacePreviewTab({
  workspacePath,
}: {
  workspacePath?: string;
}) {
  const queryClient = useQueryClient();
  const [isPullRefreshing, setPullRefreshing] = useState(false);
  const [lastRunThreadId, setLastRunThreadId] = useState<string | undefined>();
  const automationsQuery = useQuery({
    queryFn: listAutomations,
    queryKey: AUTOMATIONS_QUERY_KEY,
    staleTime: 10_000,
  });
  const runAutomationMutation = useMutation({
    mutationFn: (automation: AutomationSummary) =>
      runAutomation(automation.id, {
        workspacePath: workspacePath ?? automation.cwds[0],
      }),
    onSuccess: (response) => {
      setLastRunThreadId(response.threadId);
      void queryClient.invalidateQueries({ queryKey: serverStateKeys.threads() });
    },
  });
  const automations = automationsQuery.data?.automations ?? [];

  const refreshFromPull = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await automationsQuery.refetch();
    } finally {
      setPullRefreshing(false);
    }
  }, [automationsQuery]);

  function run(automation: AutomationSummary) {
    hapticSelection();
    runAutomationMutation.mutate(automation);
  }

  return (
    <View style={styles.contentPane}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[Colors.dark.text]}
            progressBackgroundColor={Colors.dark.backgroundElement}
            refreshing={isPullRefreshing}
            tintColor={Colors.dark.text}
            onRefresh={() => void refreshFromPull()}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Icon name="fast" size={18} tintColor={Colors.dark.text} />
          </View>
          <View style={styles.headerText}>
            <ThemedText type="smallBold" style={styles.title}>
              Automations
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Reuse local Codex automation prompts from this phone.
            </ThemedText>
          </View>
        </View>

        {lastRunThreadId ? (
          <View style={styles.notice}>
            <Icon name="check" size={14} tintColor="#8FE3B0" />
            <ThemedText type="small" style={styles.noticeText}>
              Started in thread {lastRunThreadId}.
            </ThemedText>
          </View>
        ) : null}

        {automationsQuery.isLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={Colors.dark.textSecondary} size="small" />
            <ThemedText type="small" themeColor="textSecondary">
              Loading automations
            </ThemedText>
          </View>
        ) : automationsQuery.error ? (
          <View style={styles.emptyState}>
            <ThemedText type="smallBold">Unable to load automations</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {errorMessage(automationsQuery.error)}
            </ThemedText>
          </View>
        ) : automations.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText type="smallBold">No automations found</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Create automations in the local Codex app first.
            </ThemedText>
          </View>
        ) : (
          automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              isRunning={
                runAutomationMutation.isPending &&
                runAutomationMutation.variables?.id === automation.id
              }
              onRun={() => run(automation)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
});

function AutomationCard({
  automation,
  isRunning,
  onRun,
}: {
  automation: AutomationSummary;
  isRunning: boolean;
  onRun: () => void;
}) {
  const isActive = automation.status === "ACTIVE";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleGroup}>
          <ThemedText type="smallBold" style={styles.cardTitle} numberOfLines={2}>
            {automation.name}
          </ThemedText>
          <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
            {automation.id}
          </ThemedText>
        </View>
        <View style={[styles.statusBadge, isActive && styles.statusBadgeActive]}>
          <ThemedText
            type="code"
            style={[styles.statusBadgeText, isActive && styles.statusBadgeTextActive]}
          >
            {automation.status}
          </ThemedText>
        </View>
      </View>

      <View style={styles.metaGrid}>
        <Meta label="Kind" value={automation.kind ?? "automation"} />
        <Meta label="Model" value={automation.model ?? "default"} />
        <Meta label="Schedule" value={automation.rrule ?? "manual"} />
        <Meta label="Workspace" value={automation.cwds[0] ?? "default"} />
      </View>

      <View style={styles.block}>
        <ThemedText type="code" themeColor="textSecondary">
          Prompt
        </ThemedText>
        <ThemedText type="small" style={styles.bodyText} numberOfLines={5}>
          {automation.prompt || "No prompt configured."}
        </ThemedText>
      </View>

      {automation.memory ? (
        <View style={styles.block}>
          <ThemedText type="code" themeColor="textSecondary">
            Memory
          </ThemedText>
          <ThemedText type="small" style={styles.bodyText} numberOfLines={4}>
            {automation.memory}
          </ThemedText>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Run ${automation.name}`}
        disabled={!automation.prompt || isRunning}
        onPress={onRun}
        style={({ pressed }) => [
          styles.runButton,
          (!automation.prompt || isRunning) && styles.runButtonDisabled,
          pressed && styles.pressed,
        ]}
      >
        {isRunning ? (
          <ActivityIndicator color={Colors.dark.text} size="small" />
        ) : (
          <Icon name="fast" size={14} tintColor={Colors.dark.text} />
        )}
        <ThemedText type="smallBold" style={styles.runButtonText}>
          {isRunning ? "Running" : "Run"}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <ThemedText type="code" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.metaValue} numberOfLines={2}>
        {value}
      </ThemedText>
    </View>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.one,
    marginTop: Spacing.three,
  },
  bodyText: {
    color: Colors.dark.text,
    lineHeight: 18,
  },
  card: {
    backgroundColor: Colors.dark.backgroundElement,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.two,
  },
  cardTitle: {
    lineHeight: 19,
  },
  cardTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  contentPane: {
    flex: 1,
    marginHorizontal: Spacing.three,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundElement,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.two,
    padding: Spacing.four,
  },
  header: {
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundElement,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.three,
    padding: Spacing.three,
  },
  headerIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  metaGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  metaItem: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 8,
    flexBasis: "48%",
    flexGrow: 1,
    gap: Spacing.half,
    minWidth: 120,
    padding: Spacing.two,
  },
  metaValue: {
    color: Colors.dark.text,
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 15,
  },
  notice: {
    alignItems: "center",
    backgroundColor: "rgba(74, 222, 128, 0.12)",
    borderColor: "rgba(74, 222, 128, 0.25)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.two,
    padding: Spacing.two,
  },
  noticeText: {
    color: "#B7F7C8",
    flex: 1,
  },
  pressed: {
    opacity: 0.78,
  },
  runButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "center",
    marginTop: Spacing.two,
    minHeight: 42,
    paddingHorizontal: Spacing.three,
  },
  runButtonDisabled: {
    opacity: 0.5,
  },
  runButtonText: {
    color: Colors.dark.text,
  },
  statusBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  statusBadgeActive: {
    backgroundColor: "rgba(74, 222, 128, 0.12)",
    borderColor: "rgba(74, 222, 128, 0.25)",
  },
  statusBadgeText: {
    color: Colors.dark.textSecondary,
    fontSize: 10,
  },
  statusBadgeTextActive: {
    color: "#B7F7C8",
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
  },
});
