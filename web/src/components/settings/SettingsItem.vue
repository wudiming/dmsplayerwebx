<script setup lang="ts">
import type { SettingItem } from "@/types/settings-schema";
import { useSettingModel } from "@/settings/useSettingModel";
import { dialog } from "@/composables/useDialog";

const props = defineProps<{
  item: SettingItem;
  highlighted?: boolean;
}>();

const { t } = useI18n();

const model = props.item.binding ? useSettingModel(props.item.binding) : ref<any>();

/** 应用变更 */
const applyChange = async (next: unknown): Promise<void> => {
  const cfg = props.item.confirm;
  if (cfg && (!cfg.when || cfg.when(next))) {
    const content = cfg.getContent
      ? cfg.getContent(next)
      : (cfg.contentKey ? t(cfg.contentKey) : "");
    const confirmed = await dialog.confirm({
      title: cfg.titleKey ? t(cfg.titleKey) : undefined,
      content,
      type: cfg.type ?? "warning",
      confirmText: cfg.confirmTextKey ? t(cfg.confirmTextKey) : undefined,
      cancelText: cfg.cancelTextKey ? t(cfg.cancelTextKey) : undefined,
    });
    if (!confirmed) {
      const cur = model.value;
      model.value = undefined;
      nextTick(() => {
        model.value = cur;
      });
      return;
    }
  }
  model.value = next;
  await props.item.action?.(next);
};

const selectOptions = computed(() =>
  (props.item.options ?? []).map((o) => ({
    value: o.value,
    label: o.label ?? (o.labelKey ? t(o.labelKey) : String(o.value)),
  })),
);

const isChildrenActive = computed(() => {
  if (props.item.childrenCondition) return props.item.childrenCondition();
  return model.value === true;
});

const isDisabled = computed(() => props.item.disabled?.() ?? false);
const isVisible = computed(() => props.item.visible?.() ?? true);

const descriptionText = computed(() =>
  t(props.item.descriptionKey ?? `settings.${props.item.key}.description`),
);
</script>

<template>
  <div v-if="isVisible" :id="`setting-${item.key}`">
    <component
      :is="item.component"
      v-if="item.type === 'custom' && item.fullWidth && item.component"
      v-bind="item.componentProps"
      class="transition-all duration-300"
      :class="highlighted ? 'animate-highlight-pulse' : ''"
    />
    <div
      v-else
      class="flex items-center justify-between gap-3 sm:gap-4 rounded-xl bg-surface-panel border border-solid border-outline-variant/15 px-3.5 py-3 sm:px-4 sm:py-3.5 transition-all duration-300"
      :class="highlighted ? 'animate-highlight-pulse' : ''"
    >
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 text-sm sm:text-base font-medium">
          <span>{{ t(`settings.${item.key}.label`) }}</span>
          <STag v-if="item.tag" :type="item.tag.type ?? 'primary'" size="small">
            {{ item.tag.text }}
          </STag>
        </div>
        <div v-if="!item.hideDescription" class="text-xs sm:text-sm text-on-surface-variant/70 mt-0.5 break-words">
          {{ descriptionText }}
        </div>
      </div>

      <div class="shrink-0 flex items-center justify-end max-w-[55%]">
        <SSwitch
          v-if="item.type === 'switch'"
          :model-value="model"
          :disabled="isDisabled"
          @update:model-value="applyChange($event)"
        />
        <SSelect
          v-else-if="item.type === 'select'"
          :model-value="model"
          :options="selectOptions"
          :disabled="isDisabled"
          class="w-32 sm:w-44 max-w-full"
          @update:model-value="applyChange($event)"
        />
        <SSlider
          v-else-if="item.type === 'slider'"
          :model-value="model"
          :min="item.min ?? 0"
          :max="item.max ?? 100"
          :step="item.step ?? 1"
          :marks="item.marks"
          :disabled="isDisabled"
          class="w-28 sm:w-44 max-w-full"
          :thumb-size="14"
          :track-height="4"
          always-show-thumb
          show-popover
          @change="applyChange($event)"
        >
          <template #popover="{ value }">{{ value }}</template>
        </SSlider>
        <SColor
          v-else-if="item.type === 'color'"
          :model-value="model"
          :disabled="isDisabled"
          :show-alpha="item.showAlpha"
          :format="item.colorFormat"
          @update:model-value="applyChange($event)"
        />
        <SButton
          v-else-if="item.type === 'button'"
          type="primary"
          variant="secondary"
          size="small"
          @click="item.action?.()"
        >
          {{ t(`settings.${item.key}.label`) }}
        </SButton>
        <SNumberInput
          v-else-if="item.type === 'number'"
          :model-value="model"
          :min="item.min"
          :max="item.max"
          :step="item.step"
          :unit="item.unit"
          :placeholder="item.placeholderKey ? t(item.placeholderKey) : ''"
          :disabled="isDisabled"
          update-on="blur"
          class="w-24 sm:w-36 max-w-full"
          @update:model-value="applyChange($event)"
        />
        <SInput
          v-else-if="item.type === 'text'"
          :model-value="model"
          :placeholder="item.placeholderKey ? t(item.placeholderKey) : ''"
          :disabled="isDisabled"
          update-on="blur"
          clearable
          class="w-32 sm:w-48 max-w-full"
          @update:model-value="applyChange($event)"
        />
        <component
          :is="item.component"
          v-else-if="item.type === 'custom' && item.component"
          v-bind="item.componentProps"
          :model-value="model"
          class="max-w-full"
          @update:model-value="model = $event"
        />
      </div>
    </div>
    <div
      v-if="item.children?.length && (!item.hideChildren || isChildrenActive)"
      class="mt-2.5 flex flex-col gap-2.5 transition-opacity duration-200"
      :class="isChildrenActive ? '' : 'opacity-50 pointer-events-none'"
    >
      <SettingsItem v-for="child in item.children" :key="child.key" :item="child" />
    </div>
  </div>
</template>
