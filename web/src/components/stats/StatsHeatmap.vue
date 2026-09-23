<script setup lang="ts">
import type { DailyPlayStats, HourlyPlayStats, LibraryStats } from "@shared/types/stats";
import { isLosslessCodec } from "@/utils/quality";
import StatsDonutChart from "./StatsDonutChart.vue";
import STabs from "@/components/ui/STabs.vue";
import IconLucideMusic from "~icons/lucide/music";

const halfTabs = [
  { key: "1", label: "1-6" },
  { key: "2", label: "7-12" },
];

const props = defineProps<{
  /** 每日播放统计 */
  daily: DailyPlayStats[];
  /** 各小时累计播放统计 */
  hourly: HourlyPlayStats[];
  /** 曲库统计概览（取格式分布） */
  stats: LibraryStats | null;
  /** 数据是否仍在加载 */
  loading: boolean;
}>();

const { t, locale } = useI18n();


interface ChartPoint {
  x: number;
  y: number;
}

interface CodecVisual {
  id: string;
  codec: string;
  count: number;
  percent: number;
  opacity: number;
}

/**
 * 日期格式化为 YYYY-MM-DD
 * @param value - 月或日数字
 * @returns 两位数补零字符串
 */
const pad2 = (value: number): string => String(value).padStart(2, "0");
const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const currentYear = new Date().getFullYear();
/** 当前选中的半年：1 为 1-6月（上半年），2 为 7-12月（下半年），默认选当前月份所在半年 */
const selectedHalf = ref<1 | 2>(new Date().getMonth() < 6 ? 1 : 2);

/** 当前半年的起始与结束日期计算 */
const halfRange = computed(() => {
  const isH1 = selectedHalf.value === 1;
  const startMonth = isH1 ? 0 : 6; // 0 = 1月, 6 = 7月
  const endMonth = isH1 ? 5 : 11;  // 5 = 6月, 11 = 12月
  const endDay = isH1 ? 30 : 31;   // 6月30日 或 12月31日

  const startDate = new Date(currentYear, startMonth, 1);
  const endDate = new Date(currentYear, endMonth, endDay);

  // 首周对齐周日
  const startSunday = new Date(startDate);
  startSunday.setDate(startDate.getDate() - startDate.getDay());
  startSunday.setHours(0, 0, 0, 0);

  // 末周对齐周六
  const endSaturday = new Date(endDate);
  endSaturday.setDate(endDate.getDate() + (6 - endDate.getDay()));
  endSaturday.setHours(0, 0, 0, 0);

  return {
    startDate,
    endDate,
    startSunday,
    endSaturday,
    isH1,
  };
});

interface HeatCell {
  day: string;
  playCount: number;
  date: Date;
  isFuture: boolean;
}

/** 按周排列的半年网格数据（固定 26~27 周，每周严格 7 天） */
const heatWeeks = computed<(HeatCell | null)[][]>(() => {
  const map = new Map(props.daily.map((item) => [item.day, item.playCount]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { startSunday, endSaturday, startDate, endDate } = halfRange.value;
  const weeks: (HeatCell | null)[][] = [];
  let currentSunday = new Date(startSunday);

  while (currentSunday.getTime() <= endSaturday.getTime()) {
    const week: (HeatCell | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(currentSunday);
      date.setDate(currentSunday.getDate() + d);

      // 仅在半年日期范围之外为空占位
      if (date.getTime() < startDate.getTime() || date.getTime() > endDate.getTime()) {
        week.push(null);
      } else {
        const isFuture = date.getTime() > today.getTime();
        const key = dayKey(date);
        week.push({
          day: key,
          playCount: isFuture ? 0 : (map.get(key) ?? 0),
          date,
          isFuture,
        });
      }
    }
    weeks.push(week);
    currentSunday.setDate(currentSunday.getDate() + 7);
  }
  return weeks;
});

const maxDayPlays = computed(() => Math.max(0, ...props.daily.map((item) => item.playCount)));

/** 当前半年中有收听记录的天数 */
const activeDaysCount = computed(() => {
  let count = 0;
  for (const week of heatWeeks.value) {
    for (const cell of week) {
      if (cell && cell.playCount > 0) count++;
    }
  }
  return count;
});

/** 5 级颜色深浅阶梯 (0 级底色 0.06，1~4 级从少到多逐步加深) */
const HEATMAP_LEVEL_ALPHAS = [0.06, 0.25, 0.48, 0.72, 0.95];

/**
 * 按播放次数映射基础背景色（5 级清晰色彩深度阶梯）
 * @param playCount - 播放次数
 * @returns 背景色样式
 */
const colorFromPlayCount = (playCount: number): Record<string, string> => {
  if (playCount <= 0) return { backgroundColor: `rgb(var(--s-primary) / ${HEATMAP_LEVEL_ALPHAS[0]})` };
  const max = maxDayPlays.value || 1;
  const ratio = playCount / max;
  let alpha = HEATMAP_LEVEL_ALPHAS[1];
  if (ratio > 0.75) {
    alpha = HEATMAP_LEVEL_ALPHAS[4];
  } else if (ratio > 0.5) {
    alpha = HEATMAP_LEVEL_ALPHAS[3];
  } else if (ratio > 0.25) {
    alpha = HEATMAP_LEVEL_ALPHAS[2];
  }
  return { backgroundColor: `rgb(var(--s-primary) / ${alpha})` };
};

/**
 * 格子样式，未来日期显示为轻微淡化的底色以保持整体网格结构完整
 * @param cell - 格子数据
 * @returns 样式对象
 */
const cellStyle = (cell: HeatCell): Record<string, string> => {
  if (cell.isFuture) {
    return {
      backgroundColor: "rgb(var(--s-primary) / 0.03)",
    };
  }
  return colorFromPlayCount(cell.playCount);
};

interface MonthPosition {
  label: string;
  weekIndex: number;
}

/** 顶部月份标签位置（半年各包含 6 个自然月） */
const monthPositions = computed<MonthPosition[]>(() => {
  const fmt = new Intl.DateTimeFormat(locale.value, { month: "short" });
  const result: MonthPosition[] = [];
  let lastMonth = -1;

  heatWeeks.value.forEach((week, weekIdx) => {
    for (let d = 0; d < 7; d++) {
      const date = new Date(halfRange.value.startSunday);
      date.setDate(halfRange.value.startSunday.getDate() + weekIdx * 7 + d);
      if (
        date.getTime() >= halfRange.value.startDate.getTime() &&
        date.getTime() <= halfRange.value.endDate.getTime()
      ) {
        const m = date.getMonth();
        if (m !== lastMonth) {
          result.push({
            label: fmt.format(date),
            weekIndex: weekIdx,
          });
          lastMonth = m;
          break;
        }
      }
    }
  });
  return result;
});

/** 月份标签对齐对应周列 */
const monthLabelStyle = (weekIndex: number): Record<string, string> => {
  const total = heatWeeks.value.length;
  if (total <= 1) return { left: "0%" };
  const percent = (weekIndex / total) * 100;
  return { left: `${percent}%` };
};

/** 左侧星期完整标签（日 ~ 六 全 7 天，去“周”字） */
const fullDowLabels = computed<string[]>(() => {
  const isZh = locale.value?.startsWith("zh");
  return isZh
    ? ["日", "一", "二", "三", "四", "五", "六"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
});

/** 按 7 天星期排列的网格行（周日=0 到 周六=6，每行 26~27 周，与标签同行锁定对齐） */
const heatRows = computed(() => {
  return fullDowLabels.value.map((label, dayIndex) => ({
    label,
    dayIndex,
    cells: heatWeeks.value.map((week) => week[dayIndex] ?? null),
  }));
});

/**
 * 生成格子提示文本
 * @param cell - 格子数据，空占位为 null
 * @returns 日期 + 播放次数
 */
const dayTooltip = (cell: HeatCell | null): string => {
  if (!cell) return "";
  if (cell.isFuture) return cell.day;
  return `${cell.day} · ${t("stats.plays", { count: cell.playCount }, cell.playCount)}`;
};

const hourlyMax = computed(() => Math.max(0, ...props.hourly.map((item) => item.playCount)));
const hourlyTotal = computed(() => props.hourly.reduce((sum, item) => sum + item.playCount, 0));
const peakHour = computed(() =>
  props.hourly.reduce<HourlyPlayStats | null>(
    (peak, item) => (!peak || item.playCount > peak.playCount ? item : peak),
    null,
  ),
);
/** 播放时段折线坐标 */
const hourlyPoints = computed<ChartPoint[]>(() =>
  Array.from({ length: 24 }, (_, hour) => {
    const count = props.hourly.find((item) => item.hour === hour)?.playCount ?? 0;
    const ratio = hourlyMax.value ? count / hourlyMax.value : 0;
    return {
      x: (hour / 23) * 240,
      y: 120 - ratio * 104,
    };
  }),
);
const peakPoint = computed(() => (peakHour.value ? hourlyPoints.value[peakHour.value.hour] : null));
const peakLabelX = computed(() => Math.min(212, Math.max(28, peakPoint.value?.x ?? 0)));
const peakLabelY = computed(() => Math.max(20, (peakPoint.value?.y ?? 0) - 20));

/** 使用 Catmull-Rom 转贝塞尔曲线平滑连接相邻时段 */
const hourlyLinePath = computed(() => {
  const points = hourlyPoints.value;
  if (points.length === 0) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const control1Y = Math.min(120, Math.max(8, p1.y + (p2.y - p0.y) / 6));
    const control2Y = Math.min(120, Math.max(8, p2.y - (p3.y - p1.y) / 6));
    path += ` C ${p1.x + (p2.x - p0.x) / 6} ${control1Y}, ${p2.x - (p3.x - p1.x) / 6} ${control2Y}, ${p2.x} ${p2.y}`;
  }
  return path;
});

const hourlyAreaPath = computed(() => `${hourlyLinePath.value} L 240 124 L 0 124 Z`);

const codecs = computed(() => (props.stats?.codecs ?? []).filter((item) => item.codec.trim()));
const chartCodecs = computed(() => codecs.value.slice(0, 4));
const totalCodecCount = computed(() =>
  chartCodecs.value.reduce((sum, item) => sum + item.count, 0),
);

/** 圆环分段数据 */
const codecVisuals = computed<CodecVisual[]>(() => {
  return chartCodecs.value.map((item, index) => ({
    ...item,
    id: item.codec,
    percent: totalCodecCount.value ? (item.count / totalCodecCount.value) * 100 : 0,
    opacity: Math.max(0.24, 0.92 - index * 0.14),
  }));
});

const losslessCount = computed(() =>
  chartCodecs.value.reduce((sum, item) => sum + (isLosslessCodec(item.codec) ? item.count : 0), 0),
);

const losslessPercent = computed(() =>
  totalCodecCount.value ? (losslessCount.value / totalCodecCount.value) * 100 : 0,
);

const codecPercent = (count: number): string => {
  if (!totalCodecCount.value) return "0%";
  return `${((count / totalCodecCount.value) * 100).toFixed(1)}%`;
};

const codecLabel = (codec: string): string => {
  return codec ? codec.toUpperCase() : t("stats.unknown");
};
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-[1.5fr_3fr_1.5fr] gap-5">
    <!-- 固定半年热力图 (1-6月 / 7-12月 分两次显示) -->
    <SCard radius="xl" class="flex h-52 min-w-0 flex-col justify-between p-4 select-none">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-base font-semibold text-on-surface">
          {{ t("stats.listeningActivity") }}
        </h3>
        <!-- 半年快捷切换标签 (参考音乐库右侧推荐歌单/精品歌单风格) -->
        <div class="w-28 shrink-0">
          <STabs
            :model-value="String(selectedHalf)"
            :tabs="halfTabs"
            type="segment"
            round
            size="small"
            @update:model-value="(val) => (selectedHalf = Number(val) as 1 | 2)"
          />
        </div>
      </div>

      <!-- 热力图区域：月份行 + (左侧周日~周六完整标签 与 26~27 周单网格自适应) -->
      <div class="my-auto flex flex-col justify-center select-none">
        <!-- 顶部月份行 -->
        <div class="flex items-center mb-1 text-[10px] font-medium text-on-surface-variant/50">
          <!-- 星期标签占位对齐 (22px) -->
          <div class="w-[22px] shrink-0" />
          <!-- 26~27 周相对月份容器 -->
          <div class="relative flex-1 h-3.5">
            <span
              v-for="m in monthPositions"
              :key="`${m.label}-${m.weekIndex}`"
              class="absolute leading-none whitespace-nowrap"
              :style="monthLabelStyle(m.weekIndex)"
            >
              {{ m.label }}
            </span>
          </div>
        </div>

        <!-- 7行网格：每行第一列为星期标签，后接 26~27 个自适应等宽正方形格子 -->
        <div
          class="grid gap-[2px] items-center"
          :style="{
            gridTemplateColumns: `22px repeat(${heatWeeks.length}, minmax(0, 1fr))`,
          }"
        >
          <template v-for="row in heatRows" :key="row.dayIndex">
            <!-- 星期标签（与该行格子严格同一行，基准完全对齐） -->
            <span
              class="pr-1 text-right text-[9px] font-medium leading-none text-on-surface-variant/45 whitespace-nowrap"
            >
              {{ row.label }}
            </span>
            <!-- 该星期 26~27 周的格子 -->
            <STooltip
              v-for="(cell, weekIdx) in row.cells"
              :key="weekIdx"
              :content="dayTooltip(cell)"
              :disabled="!cell"
              side="top"
              align="center"
            >
              <div
                class="w-full aspect-square rounded-[2px] transition-transform duration-100"
                :class="
                  cell
                    ? cell.isFuture
                      ? 'cursor-default'
                      : 'cursor-pointer hover:scale-125 hover:z-10'
                    : 'opacity-0 pointer-events-none'
                "
                :style="cell ? cellStyle(cell) : {}"
              />
            </STooltip>
          </template>
        </div>
      </div>

      <!-- 底部收听天数与图例 -->
      <div class="flex items-center justify-between text-xs text-on-surface-variant/60">
        <span class="text-xs tabular-nums font-medium text-on-surface-variant/70">
          <strong class="text-sm font-semibold text-on-surface">{{ activeDaysCount }}</strong>
          <span class="ml-1 text-[11px] text-on-surface-variant/50">
            {{ t("stats.daysListened") }}
          </span>
        </span>
        <div class="flex items-center gap-1.5 text-[11px] text-on-surface-variant/50">
          <span>{{ t("stats.less") }}</span>
          <div class="flex items-center gap-1">
            <div
              v-for="alpha in HEATMAP_LEVEL_ALPHAS"
              :key="alpha"
              class="size-2.5 rounded-[2px]"
              :style="{ backgroundColor: `rgb(var(--s-primary) / ${alpha})` }"
            />
          </div>
          <span>{{ t("stats.more") }}</span>
        </div>
      </div>
    </SCard>

    <!-- 播放时段分布 (3 格子) -->
    <SCard radius="xl" class="flex h-52 min-w-0 flex-col gap-2">
      <div class="flex items-baseline justify-between gap-3">
        <h3 class="text-base font-semibold text-on-surface">
          {{ t("stats.listeningHours") }}
        </h3>
      </div>

      <div class="relative min-h-0 flex-1">
        <svg class="absolute inset-0 size-full" viewBox="0 0 240 128" preserveAspectRatio="none">
          <template v-if="!loading && hourlyTotal > 0">
            <path :d="hourlyAreaPath" fill="rgb(var(--s-primary) / 0.08)" />
            <path
              :d="hourlyLinePath"
              fill="none"
              stroke="rgb(var(--s-primary))"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
          </template>
        </svg>
        <!-- 最高点指示点 -->
        <div
          v-if="!loading && hourlyTotal > 0 && peakHour"
          class="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface-panel shadow-sm"
          :style="{
            left: `${(hourlyPoints[peakHour.hour].x / 240) * 100}%`,
            top: `${(hourlyPoints[peakHour.hour].y / 128) * 100}%`,
          }"
        />
        <!-- 最高峰时段提示气泡 -->
        <div
          v-if="!loading && hourlyTotal > 0 && peakHour"
          class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-center text-[10px] font-semibold text-on-primary tabular-nums shadow-md"
          :style="{
            left: `${(peakLabelX / 240) * 100}%`,
            top: `${(peakLabelY / 128) * 100}%`,
          }"
        >
          <span
            class="block whitespace-nowrap text-[9px] font-medium leading-none text-on-primary/80"
          >
            {{ t("stats.peakListening") }}
          </span>
          <span class="mt-1 block whitespace-nowrap text-xs font-bold leading-none">
            {{ String(peakHour.hour).padStart(2, "0") }}:00
          </span>
        </div>
        <div
          v-if="!loading && hourlyTotal === 0"
          class="absolute inset-0 flex items-center justify-center text-sm text-on-surface-variant/40"
        >
          {{ t("stats.noPlayHistory") }}
        </div>
      </div>

      <div class="flex justify-between text-[10px] text-on-surface-variant/40 tabular-nums">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      <p v-if="hourlyTotal > 0 && peakHour" class="text-center text-xs text-on-surface-variant/55">
        {{
          t("stats.favoriteHour", {
            hour: String(peakHour.hour).padStart(2, "0"),
            count: peakHour.playCount,
          })
        }}
      </p>
    </SCard>

    <!-- 音质构成 (1.5 格子) -->
    <SCard radius="xl" class="flex h-52 min-w-0 flex-col gap-3">
      <div class="flex items-baseline justify-between gap-3">
        <h3 class="text-base font-semibold text-on-surface">
          {{ t("stats.audioQuality") }}
        </h3>
        <span class="text-xs text-on-surface-variant/45 tabular-nums">
          {{ loading ? "--" : t("stats.formatCount", { count: chartCodecs.length }) }}
        </span>
      </div>

      <div
        v-if="!loading && chartCodecs.length > 0"
        class="mx-auto flex min-h-0 w-full flex-1 items-center gap-3.5"
      >
        <StatsDonutChart :segments="codecVisuals">
          <span class="text-[9px] text-on-surface-variant/55">
            {{ t("stats.losslessRatio") }}
          </span>
          <span class="mt-0.5 text-base font-bold leading-none text-on-surface tabular-nums">
            {{ losslessPercent.toFixed(1) }}%
          </span>
        </StatsDonutChart>

        <div class="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div
            v-for="codec in codecVisuals"
            :key="codec.codec"
            class="flex min-w-0 items-center gap-2"
          >
            <span class="size-2 shrink-0 rounded-full bg-primary" :style="{ opacity: codec.opacity }" />
            <div class="min-w-0 flex-1 flex items-baseline justify-between gap-1">
              <span class="truncate text-xs font-medium text-on-surface">
                {{ codecLabel(codec.codec) }}
              </span>
              <span class="truncate text-[11px] text-on-surface-variant/50 tabular-nums shrink-0">
                {{ codec.count }} 首 · {{ codecPercent(codec.count) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="loading" class="flex min-h-0 flex-1 items-center justify-center">
        <SLoading class="size-6 text-primary/60" />
      </div>

      <div
        v-else
        class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-on-surface-variant/40"
      >
        <IconLucideMusic class="size-7" />
        <span class="text-sm">{{ t("stats.noDataHint") }}</span>
      </div>
    </SCard>
  </div>
</template>
