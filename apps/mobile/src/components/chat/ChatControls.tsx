import type { CodexModel, ReasoningEffort, RuntimeMode } from "codex-relay/api-schema";
import { useState } from "react";
import { Pressable, Switch, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { AppBottomSheet, SheetActionRow, SheetSelectedDot } from "@/components/ui/bottom-sheet";
import { Icon, type AppIconName } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hapticSelection } from "@/lib/haptics";

type PickerOption = {
  compactLabel?: string;
  icon?: AppIconName;
  iconBackgroundColor?: string;
  iconTintColor?: string;
  label: string;
  selectedTitleColor?: string;
  subtitle?: string;
  value: string;
};

export type ChatControlPicker = "model" | "runtime";

type ChatControlSelectionProps = {
  models: CodexModel[];
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onSelectedModelChange: (model: string) => void;
  onSelectedReasoningEffortChange: (reasoningEffort: ReasoningEffort | undefined) => void;
  onSelectedServiceTierChange: (serviceTier: string | undefined) => void;
  runtimeMode: RuntimeMode;
  selectedModel?: string;
  selectedReasoningEffort?: ReasoningEffort;
  selectedServiceTier?: string;
};

export function ChatControls({
  models,
  onRequestPicker,
  onRuntimeModeChange,
  onSelectedModelChange,
  onSelectedReasoningEffortChange,
  onSelectedServiceTierChange,
  presentation = "rail",
  runtimeMode,
  selectedModel,
  selectedReasoningEffort,
  selectedServiceTier,
}: {
  models: CodexModel[];
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onSelectedModelChange: (model: string) => void;
  onSelectedReasoningEffortChange: (reasoningEffort: ReasoningEffort | undefined) => void;
  onSelectedServiceTierChange: (serviceTier: string | undefined) => void;
  presentation?: "menu" | "rail";
  runtimeMode: RuntimeMode;
  selectedModel?: string;
  selectedReasoningEffort?: ReasoningEffort;
  selectedServiceTier?: string;
  onRequestPicker?: (picker: ChatControlPicker) => void;
}) {
  const [activePicker, setActivePicker] = useState<ChatControlPicker | undefined>();
  const activeModel = models.find((model) => model.model === selectedModel) ?? models[0];
  const fastServiceTier = fastServiceTierForModel(activeModel);
  const isFastModeEnabled = Boolean(fastServiceTier && selectedServiceTier === fastServiceTier.id);
  const effectiveReasoningEffort = reasoningEffortForModel(activeModel, selectedReasoningEffort);
  const selectedRuntimeOption = runtimeOptionForMode(runtimeMode);
  const modelLabel = modelButtonLabel(activeModel, effectiveReasoningEffort);
  const modelOptions = models.map((model) => ({
    label: model.displayName,
    subtitle: model.description ?? model.model,
    value: model.model,
  }));

  function closePicker() {
    setActivePicker(undefined);
  }

  function openPicker(picker: ChatControlPicker) {
    hapticSelection();
    if (presentation === "menu" && onRequestPicker) {
      onRequestPicker(picker);
      return;
    }
    setActivePicker(picker);
  }

  const picker = (
    <ChatControlPickerSheet
      activePicker={activePicker}
      models={models}
      onClose={closePicker}
      onRuntimeModeChange={onRuntimeModeChange}
      onSelectedModelChange={onSelectedModelChange}
      onSelectedReasoningEffortChange={onSelectedReasoningEffortChange}
      onSelectedServiceTierChange={onSelectedServiceTierChange}
      runtimeMode={runtimeMode}
      selectedModel={selectedModel}
      selectedReasoningEffort={selectedReasoningEffort}
      selectedServiceTier={selectedServiceTier}
    />
  );

  if (presentation === "menu") {
    return (
      <>
        <SheetActionRow
          accessibilityLabel={`Permissions ${selectedRuntimeOption.label}`}
          icon={selectedRuntimeOption.icon ?? "permissions"}
          iconBackgroundColor={selectedRuntimeOption.iconBackgroundColor}
          iconTintColor={selectedRuntimeOption.iconTintColor}
          onPress={() => openPicker("runtime")}
          selectedTitleColor={selectedRuntimeOption.selectedTitleColor}
          subtitle={selectedRuntimeOption.subtitle}
          title={`Permissions: ${selectedRuntimeOption.compactLabel ?? selectedRuntimeOption.label}`}
        />
        <SheetActionRow
          accessibilityLabel={`Model ${modelLabel}`}
          disabled={modelOptions.length === 0}
          icon={isFastModeEnabled ? "fast" : "model"}
          iconTintColor={isFastModeEnabled ? "rgba(255, 214, 102, 0.9)" : undefined}
          onPress={() => openPicker("model")}
          subtitle={activeModel?.description ?? activeModel?.model}
          title={`Model: ${modelLabel}`}
        />
        {onRequestPicker ? null : picker}
      </>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.controlRail}>
        <RuntimeModeButton option={selectedRuntimeOption} onPress={() => openPicker("runtime")} />
        <ModelButton
          disabled={modelOptions.length === 0}
          isFastModeEnabled={isFastModeEnabled}
          label={modelLabel}
          onPress={() => openPicker("model")}
        />
      </View>
      {picker}
    </View>
  );
}

export function ChatControlPickerSheet({
  activePicker,
  models,
  onClose,
  onRuntimeModeChange,
  onSelectedModelChange,
  onSelectedReasoningEffortChange,
  onSelectedServiceTierChange,
  runtimeMode,
  selectedModel,
  selectedReasoningEffort,
  selectedServiceTier,
}: ChatControlSelectionProps & {
  activePicker?: ChatControlPicker;
  onClose: () => void;
}) {
  const activeModel = models.find((model) => model.model === selectedModel) ?? models[0];
  const fastServiceTier = fastServiceTierForModel(activeModel);
  const isFastModeEnabled = Boolean(fastServiceTier && selectedServiceTier === fastServiceTier.id);
  const effectiveReasoningEffort = reasoningEffortForModel(activeModel, selectedReasoningEffort);
  const modelOptions = models.map((model) => ({
    label: model.displayName,
    subtitle: model.description ?? model.model,
    value: model.model,
  }));
  const reasoningOptions = reasoningDisplayOptions(activeModel?.supportedReasoningEfforts ?? []);
  const runtimeOptions = runtimeDisplayOptions();

  return (
    <OptionSheet
      activePicker={activePicker}
      onClose={onClose}
      onSelect={(value) => {
        if (activePicker === "model") {
          onSelectedModelChange(value);
        } else {
          onRuntimeModeChange(value as RuntimeMode);
        }
        onClose();
      }}
      options={activePicker === "model" ? modelOptions : runtimeOptions}
      onReasoningSelect={(value) => {
        onSelectedReasoningEffortChange(value as ReasoningEffort);
        onClose();
      }}
      onFastModeChange={(enabled) => {
        onSelectedServiceTierChange(enabled ? fastServiceTier?.id : undefined);
      }}
      fastServiceTier={fastServiceTier}
      isFastModeEnabled={isFastModeEnabled}
      reasoningOptions={reasoningOptions}
      selectedReasoningEffort={effectiveReasoningEffort}
      selectedValue={
        activePicker === "model" ? activeModel?.model : normalizeRuntimeMode(runtimeMode)
      }
      title={activePicker === "model" ? "Model" : "Permissions"}
      visible={Boolean(activePicker)}
    />
  );
}

function RuntimeModeButton({ option, onPress }: { option: PickerOption; onPress: () => void }) {
  const label = option.compactLabel ?? option.label;
  return (
    <ControlPillButton
      accessibilityLabel={`Runtime mode ${label}`}
      icon={option.icon ?? "permissions"}
      label={label}
      onPress={onPress}
      style={styles.runtimeButton}
      tintColor={option.iconTintColor}
    />
  );
}

function ModelButton({
  disabled,
  isFastModeEnabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  isFastModeEnabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <ControlPillButton
      accessibilityLabel={`Model ${label}`}
      disabled={disabled}
      icon={isFastModeEnabled ? "fast" : undefined}
      label={label}
      onPress={onPress}
      style={styles.modelButton}
      textAlign="center"
      tintColor={isFastModeEnabled ? "rgba(255, 214, 102, 0.9)" : undefined}
    />
  );
}

function ControlPillButton({
  accessibilityLabel,
  disabled,
  icon,
  label,
  onPress,
  style,
  textAlign,
  tintColor = "rgba(243, 244, 246, 0.72)",
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon?: AppIconName;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textAlign?: "center";
  tintColor?: string;
}) {
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.controlButton,
        style,
        disabled && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.controlButtonContent}>
        {icon ? (
          <View style={styles.controlButtonIconSlot}>
            <Icon name={icon} size={12} strokeWidth={1.9} tintColor={tintColor} />
          </View>
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            styles.controlButtonLabel,
            { color: tintColor },
            textAlign === "center" && styles.controlButtonLabelCentered,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function modelButtonLabel(
  model: CodexModel | undefined,
  reasoningEffort: ReasoningEffort | undefined,
) {
  const modelLabel = model?.displayName ?? "No models";
  if (!model || !reasoningEffort) {
    return modelLabel;
  }
  return `${modelLabel} ${compactReasoningTitle(reasoningEffort)}`;
}

function fastServiceTierForModel(model: CodexModel | undefined) {
  return model?.serviceTiers.find((tier) => {
    const label = `${tier.id} ${tier.name}`.toLowerCase();
    return label.includes("fast") || label.includes("priority");
  });
}

function reasoningEffortForModel(
  model: CodexModel | undefined,
  selectedReasoningEffort: ReasoningEffort | undefined,
) {
  const supported = model?.supportedReasoningEfforts ?? [];
  if (supported.length === 0) {
    return undefined;
  }
  if (selectedReasoningEffort && supported.includes(selectedReasoningEffort)) {
    return selectedReasoningEffort;
  }
  if (model?.defaultReasoningEffort && supported.includes(model.defaultReasoningEffort)) {
    return model.defaultReasoningEffort;
  }
  return supported.includes("medium") ? "medium" : supported[0];
}

function reasoningDisplayOptions(efforts: ReasoningEffort[]) {
  return efforts
    .map((effort) => ({
      label: reasoningTitle(effort),
      subtitle: reasoningSubtitle(effort),
      value: effort,
    }))
    .sort((left, right) => reasoningRank(right.value) - reasoningRank(left.value));
}

function reasoningTitle(effort: string) {
  switch (effort) {
    case "minimal":
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Extra High";
    default:
      return effort;
  }
}

function compactReasoningTitle(effort: string) {
  switch (effort) {
    case "minimal":
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Extra High";
    default:
      return effort;
  }
}

function reasoningSubtitle(effort: string) {
  switch (effort) {
    case "minimal":
    case "low":
      return "Fast replies";
    case "medium":
      return "Balanced reasoning";
    case "high":
      return "Deeper reasoning";
    case "xhigh":
      return "Deepest reasoning";
    default:
      return undefined;
  }
}

function reasoningRank(effort: string) {
  switch (effort) {
    case "minimal":
    case "low":
      return 0;
    case "medium":
      return 1;
    case "high":
      return 2;
    case "xhigh":
      return 3;
    default:
      return 4;
  }
}

function runtimeDisplayOptions(): PickerOption[] {
  return [
    {
      compactLabel: "Default",
      icon: "permissionsDefault",
      iconBackgroundColor: "rgba(255, 255, 255, 0.08)",
      iconTintColor: "rgba(243, 244, 246, 0.72)",
      label: "Default permissions",
      selectedTitleColor: "rgba(243, 244, 246, 0.86)",
      subtitle: "Ask before sensitive actions",
      value: "default",
    },
    {
      compactLabel: "Auto",
      icon: "permissionsAuto",
      iconBackgroundColor: "rgba(125, 211, 252, 0.1)",
      iconTintColor: "rgba(125, 211, 252, 0.76)",
      label: "Auto",
      selectedTitleColor: "rgba(125, 211, 252, 0.9)",
      subtitle: "Run in workspace, ask after sandbox failures",
      value: "auto",
    },
    {
      compactLabel: "Full access",
      icon: "permissionsFull",
      iconBackgroundColor: "rgba(255, 138, 69, 0.1)",
      iconTintColor: "rgba(255, 171, 116, 0.76)",
      label: "Full access",
      selectedTitleColor: "rgba(255, 171, 116, 0.9)",
      subtitle: "Run without permission prompts",
      value: "full-access",
    },
  ];
}

function runtimeOptionForMode(runtimeMode: RuntimeMode) {
  const normalized = normalizeRuntimeMode(runtimeMode);
  return (
    runtimeDisplayOptions().find((option) => option.value === normalized) ??
    runtimeDisplayOptions()[0]
  );
}

function normalizeRuntimeMode(runtimeMode: RuntimeMode) {
  return runtimeMode === "on-request" ? "default" : runtimeMode;
}

function OptionSheet({
  activePicker,
  fastServiceTier,
  isFastModeEnabled,
  onClose,
  onFastModeChange,
  onReasoningSelect,
  onSelect,
  options,
  reasoningOptions,
  selectedReasoningEffort,
  selectedValue,
  title,
  visible,
}: {
  activePicker?: "model" | "runtime";
  fastServiceTier?: CodexModel["serviceTiers"][number];
  isFastModeEnabled?: boolean;
  onClose: () => void;
  onFastModeChange: (enabled: boolean) => void;
  onReasoningSelect: (value: string) => void;
  onSelect: (value: string) => void;
  options: PickerOption[];
  reasoningOptions: PickerOption[];
  selectedReasoningEffort?: string;
  selectedValue?: string;
  title: string;
  visible: boolean;
}) {
  const isModelPicker = activePicker === "model";

  return (
    <AppBottomSheet
      title={title}
      subtitle={
        isModelPicker
          ? "Choose the model for the next reply."
          : "Set how much permission Codex can use."
      }
      enableDynamicSizing={!isModelPicker}
      expandedSnapPercent={isModelPicker ? 98 : undefined}
      initialSnapIndex={isModelPicker ? 1 : 0}
      onClose={onClose}
      scrollable={!isModelPicker}
      visible={visible}
    >
      {options.map((option) => {
        const selected = option.value === selectedValue;
        return (
          <SheetActionRow
            key={option.value}
            accessibilityLabel={option.label}
            icon={isModelPicker ? "model" : (option.icon ?? "permissions")}
            iconBackgroundColor={isModelPicker ? undefined : option.iconBackgroundColor}
            iconTintColor={isModelPicker ? undefined : option.iconTintColor}
            onPress={() => onSelect(option.value)}
            selected={selected}
            subtitle={option.subtitle ?? runtimeOptionDetail(isModelPicker, option.value)}
            selectedTitleColor={isModelPicker ? undefined : option.selectedTitleColor}
            title={option.label}
            trailing={<SheetSelectedDot selected={selected} />}
          />
        );
      })}
      {isModelPicker && reasoningOptions.length > 0 ? (
        <>
          <SheetSectionLabel title="Reasoning" />
          {reasoningOptions.map((option) => {
            const selected = option.value === selectedReasoningEffort;
            return (
              <SheetActionRow
                key={`reasoning:${option.value}`}
                accessibilityLabel={`Reasoning ${option.label}`}
                icon="controls"
                onPress={() => onReasoningSelect(option.value)}
                selected={selected}
                subtitle={option.subtitle}
                title={option.label}
                trailing={<SheetSelectedDot selected={selected} />}
              />
            );
          })}
        </>
      ) : null}
      {isModelPicker && fastServiceTier ? (
        <>
          <SheetSectionLabel title="Speed" />
          <SheetActionRow
            accessibilityLabel="Fast mode"
            icon="fast"
            iconBackgroundColor="rgba(255, 214, 102, 0.11)"
            iconTintColor="rgba(255, 214, 102, 0.88)"
            onPress={() => onFastModeChange(!isFastModeEnabled)}
            selected={isFastModeEnabled}
            subtitle="1.5x faster, uses more tokens"
            selectedTitleColor="rgba(255, 214, 102, 0.95)"
            title={fastServiceTier.name}
            trailing={
              <Switch
                accessibilityLabel="Toggle fast mode"
                ios_backgroundColor="rgba(243, 244, 246, 0.18)"
                onValueChange={onFastModeChange}
                thumbColor="#F3F4F6"
                trackColor={{
                  false: "rgba(243, 244, 246, 0.18)",
                  true: "rgba(255, 214, 102, 0.42)",
                }}
                value={Boolean(isFastModeEnabled)}
              />
            }
          />
        </>
      ) : null}
    </AppBottomSheet>
  );
}

function SheetSectionLabel({ title }: { title: string }) {
  const theme = useTheme();
  return <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{title}</Text>;
}

function runtimeOptionDetail(isModelPicker: boolean, value: string) {
  if (isModelPicker) {
    return undefined;
  }
  if (value === "default" || value === "on-request") {
    return "Ask before sensitive actions";
  }
  if (value === "auto") {
    return "Run in workspace, ask after sandbox failures";
  }
  if (value === "full-access") {
    return "Allow workspace changes without prompting";
  }
  return undefined;
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  controlRail: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    height: 30,
    justifyContent: "flex-start",
    minWidth: 0,
    width: "100%",
  },
  controlButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 12,
    borderWidth: 1,
    flexShrink: 0,
    height: 23,
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  runtimeButton: {
    flexShrink: 0,
  },
  modelButton: {
    flexShrink: 1,
    maxWidth: "60%",
    minWidth: 0,
    overflow: "hidden",
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  controlButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    height: 23,
    justifyContent: "center",
    minWidth: 0,
  },
  controlButtonIconSlot: {
    alignItems: "center",
    height: 12,
    justifyContent: "center",
    width: 12,
  },
  controlButtonLabel: {
    color: "rgba(243, 244, 246, 0.76)",
    flexShrink: 1,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10.5,
    lineHeight: 13,
    minWidth: 0,
  },
  controlButtonLabelCentered: {
    textAlign: "center",
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    lineHeight: 14,
    paddingHorizontal: 10,
    paddingBottom: 3,
    paddingTop: 10,
    textTransform: "uppercase",
  },
  pressed: {
    opacity: 0.72,
  },
});
