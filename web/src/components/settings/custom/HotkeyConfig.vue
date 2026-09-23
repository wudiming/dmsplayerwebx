<script setup lang="ts">
import type { HotkeyActionId } from "@shared/types/hotkey";
import { HOTKEY_ACTIONS } from "@shared/defaults/hotkeys";
import { useHotkeyStore } from "@/stores/hotkey";
import { useHotkeyRecorder } from "@/core/hotkey/recorder";
import { formatAccelerator } from "@shared/utils/accelerator";
import { toast } from "@/composables/useToast";
import { dialog } from "@/composables/useDialog";
import IconLucideRotateCcw from "~icons/lucide/rotate-ccw";
import { isMac } from "@/utils/config";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();
const hotkey = useHotkeyStore();

/** 按 id 前缀分组 */
const groupedActions = computed(() => {
  const groups = new Map<string, typeof HOTKEY_ACTIONS>();
  for (const action of HOTKEY_ACTIONS) {
    const category = action.id.split(".")[0];
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(action);
  }
  return Array.from(groups, ([category, actions]) => ({ category, actions }));
});

/** 录入目标 */
const recordingTarget = ref<HotkeyActionId | null>(null);

/** 错误信息 */
const errorFor = ref<{
  id: HotkeyActionId;
  conflictWith?: HotkeyActionId;
} | null>(null);

/** 清除错误信息 */
const clearError = (): void => {
  errorFor.value = null;
};

/** 获取动作标签 */
const labelOf = (id: HotkeyActionId): string => {
  const meta = HOTKEY_ACTIONS.find((a) => a.id === id);
  return meta ? t(meta.labelKey) : "";
};

/** 录入器 */
const recorder = useHotkeyRecorder({
  isMac: isMac,
  requireModifier: () => false,
  onConfirm: async (accel) => {
    const target = recordingTarget.value;
    if (!target) return;
    recordingTarget.value = null;
    const dup = hotkey.findInAppDuplicate(accel, target);
    if (dup) {
      errorFor.value = { id: target, conflictWith: dup };
      toast.error(t("settings.hotkeys.duplicateWith", { action: labelOf(dup) }));
      return;
    }
    const cur = hotkey.bindings[target] ?? { inApp: null, global: null };
    await hotkey.updateBinding(target, { ...cur, inApp: accel });
  },
  onCancel: () => {
    recordingTarget.value = null;
  },
  onClear: async () => {
    const target = recordingTarget.value;
    recordingTarget.value = null;
    if (!target) return;
    clearError();
    const cur = hotkey.bindings[target] ?? { inApp: null, global: null };
    await hotkey.updateBinding(target, { ...cur, inApp: null });
  },
});

/** 开始录入 */
const startRecord = (id: HotkeyActionId): void => {
  clearError();
  if (recordingTarget.value === id) {
    recorder.cancel();
    return;
  }
  if (recordingTarget.value) recorder.cancel();
  recordingTarget.value = id;
  recorder.start();
};

/** 停止录入 */
const stopRecord = (): void => {
  if (recorder.isRecording.value) recorder.cancel();
  clearError();
};

/** 重置单个动作 */
const resetSingle = async (id: HotkeyActionId): Promise<void> => {
  clearError();
  await hotkey.resetBinding(id);
};

/** 重置全部动作 */
const resetAll = async (): Promise<void> => {
  const ok = await dialog.confirm({
    title: t("settings.hotkeys.confirmResetTitle"),
    description: t("settings.hotkeys.confirmResetDesc"),
    type: "warning",
    confirmText: t("settings.hotkeys.resetRow"),
  });
  if (!ok) return;
  clearError();
  await hotkey.resetBinding();
};

/** 获取值 */
const valueOf = (id: HotkeyActionId): string => {
  if (recordingTarget.value === id) {
    return recorder.current.value;
  }
  const accel = hotkey.bindings[id]?.inApp;
  if (!accel) return "";
  return formatAccelerator(accel, isMac);
};

/** 获取占位符 */
const placeholderOf = (id: HotkeyActionId): string => {
  if (recordingTarget.value === id) {
    return t("settings.hotkeys.recording");
  }
  return t("settings.hotkeys.unbound");
};

/** 检查状态 */
const statusOf = (id: HotkeyActionId): "default" | "error" => {
  if (errorFor.value && errorFor.value.id === id) return "error";
  return "default";
};

/** 获取错误标题 */
const errorTitleOf = (id: HotkeyActionId): string => {
  const err = errorFor.value;
  if (err && err.id === id && err.conflictWith) {
    return t("settings.hotkeys.duplicateWith", { action: labelOf(err.conflictWith) });
  }
  return "";
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- 绑定表：按类分组 -->
    <div
      v-for="group in groupedActions"
      :key="group.category"
      class="rounded-xl bg-surface-panel border border-solid border-outline-variant/15 overflow-hidden"
    >
      <div class="px-4 py-2.5 flex items-center gap-3 text-sm">
        <span class="flex-1 text-on-surface-variant/80">
          {{ t(`settings.hotkeys.groups.${group.category}`) }}
        </span>
        <span class="w-56 text-center text-on-surface-variant/60">
          快捷键
        </span>
        <span class="w-9" />
      </div>
      <SDivider />
      <div class="flex flex-col">
        <template v-for="(action, idx) in group.actions" :key="action.id">
          <div class="px-4 py-2.5 flex items-center gap-3">
            <span class="flex-1 text-sm">{{ t(action.labelKey) }}</span>

            <div class="w-56" :title="errorTitleOf(action.id)">
              <SInput
                readonly
                :model-value="valueOf(action.id)"
                :placeholder="placeholderOf(action.id)"
                :status="statusOf(action.id)"
                @click="startRecord(action.id)"
                @blur="stopRecord"
              />
            </div>

            <SButton
              variant="ghost"
              circle
              :title="t('settings.hotkeys.resetRow')"
              @click="resetSingle(action.id)"
            >
              <template #icon><IconLucideRotateCcw /></template>
            </SButton>
          </div>
          <SDivider v-if="idx < group.actions.length - 1" />
        </template>
      </div>
    </div>

    <div
      class="rounded-xl bg-surface-panel border border-solid border-outline-variant/15 px-4 py-3.5 flex items-center justify-between gap-4"
    >
      <div class="min-w-0 flex-1">
        <div class="text-base">{{ t("settings.hotkeys.resetAll") }}</div>
        <div class="text-sm text-on-surface-variant/70 mt-0.5">
          {{ t("settings.hotkeys.resetAllHint") }}
        </div>
      </div>
      <SButton variant="secondary" @click="resetAll">
        {{ t("settings.hotkeys.resetRow") }}
      </SButton>
    </div>
  </div>
</template>
