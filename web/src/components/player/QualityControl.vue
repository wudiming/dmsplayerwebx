<script setup lang="ts">
import { useMediaStore } from "@/stores/media";
import { useSettingsStore } from "@/stores/settings";
import { toast } from "@/composables/useToast";
import * as player from "@/core/player";
import IconLucideCheck from "~icons/lucide/check";

withDefaults(defineProps<{ cover?: boolean }>(), { cover: false });

const { t } = useI18n();
const media = useMediaStore();
const settings = useSettingsStore();

const popoverOpen = ref(false);

interface QualityOption {
  value: string;
  label: string;
  badge: string;
  size: string;
}

const qualityOptions: QualityOption[] = [
  { value: "lq", label: "标准音质", badge: "标准", size: "3.8 MB" },
  { value: "sq", label: "较高音质", badge: "较高", size: "5.7 MB" },
  { value: "hq", label: "极高音质", badge: "极高", size: "9.6 MB" },
  { value: "lossless", label: "无损音质", badge: "无损", size: "55.5 MB" },
  { value: "hi-res", label: "高清臻音", badge: "臻音", size: "94.1 MB" },
  { value: "surround", label: "沉浸环绕", badge: "环绕", size: "30.1 MB" },
  { value: "master", label: "超清母带", badge: "母带", size: "165.8 MB" },
];

const currentLevel = computed<string>(() => {
  return (settings.player.songLevel as string) || "hq";
});

const currentBadge = computed(() => {
  const opt = qualityOptions.find((o) => o.value === currentLevel.value);
  return opt?.badge || "极高";
});

const selectQuality = (val: string): void => {
  settings.player.songLevel = val as any;
  const opt = qualityOptions.find((o) => o.value === val);
  if (opt) {
    toast.success(`已切换至「${opt.label}」`);
  }
  popoverOpen.value = false;
  void player.reloadCurrentTrack();
};
</script>

<template>
  <SPopover
    v-if="media.track"
    v-model:open="popoverOpen"
    trigger="click"
    side="top"
    :side-offset="10"
    :cover="cover"
    content-class="w-64 !p-0 overflow-hidden"
  >
    <template #trigger>
      <span
        class="inline-flex min-w-9 h-6 items-center justify-center px-2 py-0.5 rounded border border-solid text-xs font-semibold cursor-pointer transition-colors select-none"
        :class="[
          cover
            ? 'border-cover/40 text-cover/90 hover:border-cover hover:text-cover'
            : 'border-on-surface-variant/35 text-on-surface-variant hover:border-primary hover:text-primary',
          popoverOpen ? (cover ? 'border-cover text-cover' : 'border-primary text-primary') : '',
        ]"
      >
        {{ currentBadge }}
      </span>
    </template>

    <div class="flex flex-col select-none">
      <!-- 头部 -->
      <div
        class="px-3.5 pt-3 pb-2 border-b border-solid"
        :class="cover ? 'border-white/10' : 'border-on-surface/8'"
      >
        <div
          class="text-sm font-semibold"
          :class="cover ? 'text-cover' : 'text-on-surface'"
        >
          {{ t("settings.songLevel.switchTitle") || "音质切换" }}
        </div>
        <div
          class="mt-0.5 text-xs"
          :class="cover ? 'text-cover/60' : 'text-on-surface-variant/60'"
        >
          {{ t("settings.songLevel.switchHint") || "以账号具体权限为准" }}
        </div>
      </div>

      <!-- 选项列表 -->
      <div class="flex flex-col gap-0.5 p-1.5">
        <div
          v-for="opt in qualityOptions"
          :key="opt.value"
          class="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors duration-150"
          :class="[
            currentLevel === opt.value
              ? (cover ? 'bg-white/15 text-cover font-semibold' : 'bg-primary/10 text-primary font-semibold')
              : (cover ? 'text-cover/85 hover:bg-white/8' : 'text-on-surface hover:bg-on-surface/6'),
          ]"
          @click="selectQuality(opt.value)"
        >
          <span class="text-sm">{{ opt.label }}</span>
          <div class="flex items-center gap-3">
            <span
              class="text-xs tabular-nums"
              :class="[
                currentLevel === opt.value
                  ? (cover ? 'text-cover/90' : 'text-primary')
                  : (cover ? 'text-cover/50' : 'text-on-surface-variant/60'),
              ]"
            >
              {{ opt.size }}
            </span>
            <div class="w-4 flex items-center justify-center">
              <IconLucideCheck
                v-if="currentLevel === opt.value"
                class="size-4"
                :class="cover ? 'text-cover' : 'text-primary'"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </SPopover>
</template>
