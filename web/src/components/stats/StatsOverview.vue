<script setup lang="ts">
import type { Component } from "vue";
import type { LibraryStats, PlayStatsSummary } from "@shared/types/stats";
import IconLucideMusic from "~icons/lucide/music";
import IconLucideDisc3 from "~icons/lucide/disc-3";
import IconLucideMic2 from "~icons/lucide/mic-2";
import IconLucideHeadphones from "~icons/lucide/headphones";
import IconLucideClock from "~icons/lucide/clock";
import IconLucideHardDrive from "~icons/lucide/hard-drive";

const props = defineProps<{
  /** 曲库统计概览 */
  stats: LibraryStats | null;
  /** 播放统计汇总 */
  summary?: PlayStatsSummary | null;
}>();

const { t } = useI18n();
const router = useRouter();

/** 概览卡片 */
interface OverviewCard {
  key: string;
  icon: Component;
  /** 主数字 */
  value: string;
  /** 主数字单位（h / m / GB） */
  unit?: string;
  /** 第二段数字 */
  value2?: string;
  /** 第二段数字单位 */
  unit2?: string;
  /** 点击跳转路由 */
  to?: string;
}

/**
 * 点击卡片跳转对应页面
 * @param card - 卡片数据
 */
const navigateCard = (card: OverviewCard): void => {
  if (card.to) router.push(card.to);
};

/**
 * 总时长拆分为小时和分钟
 * @param ms - 总时长（毫秒）
 * @returns 小时与分钟
 */
const formatDurationParts = (ms: number): { hours: number; minutes: number } => {
  const totalMin = Math.floor(ms / 60000);
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
};

/**
 * 字节数拆分为数值与单位（MB / GB）
 * @param bytes - 字节数
 * @returns 数值与单位
 */
const formatSizeParts = (bytes: number): { value: string; unit: string } => {
  if (bytes < 1024 * 1024 * 1024) return { value: (bytes / (1024 * 1024)).toFixed(1), unit: "MB" };
  return { value: (bytes / (1024 * 1024 * 1024)).toFixed(1), unit: "GB" };
};

/** 6格概览卡片列表 */
const overviewCards = computed<OverviewCard[]>(() => {
  const stats = props.stats;
  const duration = stats ? formatDurationParts(stats.totalDurationMs) : null;
  const size = stats ? formatSizeParts(stats.totalFileSize) : null;
  const plays = props.summary?.totalPlayCount !== undefined ? String(props.summary.totalPlayCount) : "--";

  return [
    {
      key: "songs",
      icon: IconLucideMusic,
      value: stats ? String(stats.trackCount) : "--",
    },
    {
      key: "albums",
      icon: IconLucideDisc3,
      value: stats ? String(stats.albumCount) : "--",
    },
    {
      key: "artists",
      icon: IconLucideMic2,
      value: stats ? String(stats.artistCount) : "--",
    },
    {
      key: "totalPlays",
      icon: IconLucideHeadphones,
      value: plays,
      unit: t("stats.playsUnit"),
    },
    duration
      ? {
          key: "totalDuration",
          icon: IconLucideClock,
          value: String(duration.hours),
          unit: "h",
          value2: String(duration.minutes),
          unit2: "m",
        }
      : { key: "totalDuration", icon: IconLucideClock, value: "--" },
    size
      ? { key: "totalSize", icon: IconLucideHardDrive, value: size.value, unit: size.unit }
      : { key: "totalSize", icon: IconLucideHardDrive, value: "--" },
  ];
});
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
    <SCard
      v-for="card in overviewCards"
      :key="card.key"
      radius="xl"
      :hoverable="!!card.to"
      class="relative overflow-hidden h-24 select-none min-w-0"
      @click="navigateCard(card)"
    >
      <!-- 衬底图标 -->
      <component
        :is="card.icon"
        class="pointer-events-none absolute -right-2 -bottom-3 size-16 -rotate-14 text-primary/15"
      />
      <div class="relative flex h-full flex-col justify-between py-0.5">
        <div class="flex items-baseline gap-0.5 min-w-0">
          <span class="text-2xl xl:text-3xl font-bold leading-none text-on-surface tabular-nums truncate">
            {{ card.value }}
          </span>
          <span v-if="card.unit" class="text-xs xl:text-sm font-medium text-on-surface-variant/70 shrink-0">
            {{ card.unit }}
          </span>
          <template v-if="card.value2 !== undefined">
            <span class="text-2xl xl:text-3xl font-bold leading-none text-on-surface tabular-nums ml-1">
              {{ card.value2 }}
            </span>
            <span v-if="card.unit2" class="text-xs xl:text-sm font-medium text-on-surface-variant/70 shrink-0">
              {{ card.unit2 }}
            </span>
          </template>
        </div>
        <div class="truncate text-xs text-on-surface-variant/55">
          {{ t(`stats.${card.key}`) }}
        </div>
      </div>
    </SCard>
  </div>
</template>
