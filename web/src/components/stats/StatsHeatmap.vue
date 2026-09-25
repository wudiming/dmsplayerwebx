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

interface BezierSegment {
  p0: ChartPoint;
  cp1: ChartPoint;
  cp2: ChartPoint;
  p1: ChartPoint;
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
  listenedMs: number;
  date: Date;
  isFuture: boolean;
}

/** 按周排列的半年网格数据（固定 26~27 周，每周严格 7 天） */
const heatWeeks = computed<(HeatCell | null)[][]>(() => {
  const map = new Map(props.daily.map((item) => [item.day, item]));
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
        const dayData = map.get(key);
        week.push({
          day: key,
          playCount: isFuture ? 0 : (dayData?.playCount ?? 0),
          listenedMs: isFuture ? 0 : (dayData?.listenedMs ?? 0),
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

/** 当前半年中有收听记录的天数 */
const activeDaysCount = computed(() => {
  let count = 0;
  for (const week of heatWeeks.value) {
    for (const cell of week) {
      if (cell && (cell.listenedMs > 0 || cell.playCount > 0)) count++;
    }
  }
  return count;
});

/** 10分钟、30分钟、1小时、1.5小时、2小时（毫秒） */
const MS_10_MIN = 10 * 60 * 1000;
const MS_30_MIN = 30 * 60 * 1000;
const MS_1_HOUR = 60 * 60 * 1000;
const MS_1_5_HOUR = 90 * 60 * 1000;
const MS_2_HOUR = 120 * 60 * 1000;

/** 未到日期（未来）的占位底色（浅色色块平铺占位） */
const FUTURE_PLACEHOLDER_BG = "rgb(var(--s-primary) / 0.05)";

/** 5 级颜色深浅阶梯 (少 -> 多，与无收听空心线框形成鲜明对比) */
const HEATMAP_LEVEL_ALPHAS = [0.28, 0.46, 0.64, 0.82, 1.0];

/**
 * 按收听时长映射基础背景色（0级: <10m 用空心线框; 1级: 10m~30m, 2级: 30m~1h, 3级: 1h~1.5h, 4级: 1.5h~2h, 5级: >2h）
 * @param listenedMs - 收听时长（毫秒）
 * @returns 样式对象
 */
const colorFromDuration = (listenedMs: number): Record<string, string> => {
  if (listenedMs < MS_10_MIN) {
    return {
      backgroundColor: "transparent",
      border: "1px solid rgb(var(--s-on-surface) / 0.16)",
      boxSizing: "border-box",
    };
  }
  let alpha = HEATMAP_LEVEL_ALPHAS[0];
  if (listenedMs >= MS_2_HOUR) {
    alpha = HEATMAP_LEVEL_ALPHAS[4];
  } else if (listenedMs >= MS_1_5_HOUR) {
    alpha = HEATMAP_LEVEL_ALPHAS[3];
  } else if (listenedMs >= MS_1_HOUR) {
    alpha = HEATMAP_LEVEL_ALPHAS[2];
  } else if (listenedMs >= MS_30_MIN) {
    alpha = HEATMAP_LEVEL_ALPHAS[1];
  }
  return {
    backgroundColor: `rgb(var(--s-primary) / ${alpha})`,
    border: "1px solid transparent",
    boxSizing: "border-box",
  };
};

/**
 * 格子样式：
 * - 没到的日子（未来）：浅色色块占位
 * - 过去的日子（无收听）：中性空心线框
 * - 过去的日子（有收听）：从少到多的 5 级鲜明主题色块
 * @param cell - 格子数据
 * @returns 样式对象
 */
const cellStyle = (cell: HeatCell): Record<string, string> => {
  if (cell.isFuture) {
    return {
      backgroundColor: FUTURE_PLACEHOLDER_BG,
      border: "1px solid transparent",
      boxSizing: "border-box",
    };
  }
  return colorFromDuration(cell.listenedMs);
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
 * 格式化毫秒为精简时长描述（h / m 极简呈现）
 * @param ms - 毫秒数
 */
const formatDurationText = (ms: number): string => {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return "< 1m";
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

/**
 * 生成格子简明收听描述（化繁为简：时长 + 次数）
 * @param cell - 格子数据
 */
const cellSummary = (cell: HeatCell | null): string => {
  if (!cell) return "";
  const isZh = locale.value?.startsWith("zh");
  if (cell.isFuture) return isZh ? "未到" : "Upcoming";
  if (cell.listenedMs <= 0 && cell.playCount <= 0) {
    return isZh ? "0次" : "0 plays";
  }
  const durStr = formatDurationText(cell.listenedMs);
  const playStr = isZh ? `${cell.playCount}次` : `${cell.playCount} plays`;
  return `${durStr} · ${playStr}`;
};

const hourlyMax = computed(() => Math.max(0, ...props.hourly.map((item) => item.playCount)));
const hourlyTotal = computed(() => props.hourly.reduce((sum, item) => sum + item.playCount, 0));
const peakHour = computed(() =>
  props.hourly.reduce<HourlyPlayStats | null>(
    (peak, item) => (!peak || item.playCount > peak.playCount ? item : peak),
    null,
  ),
);

/**
 * 24 小时连续高斯核密度估计（Gaussian KDE）流动波形：
 * - 结合小时参考容量（保底 10 首）避免生硬断崖，高程温润舒展；
 * - 产生数学上无限阶连续可导（C^∞）的纯净流体波浪；
 * - 彻底根除任何阶梯折角、平台平顶与离散机械感，达到终极视觉顺滑。
 */
const HOURLY_REFERENCE_CAPACITY = 10;
const hourlyReferenceMax = computed(() =>
  Math.max(HOURLY_REFERENCE_CAPACITY, Math.ceil(hourlyMax.value * 1.15)),
);

const MAX_CHART_AMPLITUDE = 60;
const KDE_SIGMA = 0.85;

const kdeValueAt = (hour: number): number => {
  let sum = 0;
  for (const item of props.hourly) {
    if (item.playCount > 0) {
      const d = hour - item.hour;
      sum += item.playCount * Math.exp(-(d * d) / (2 * KDE_SIGMA * KDE_SIGMA));
    }
  }
  return sum;
};

const maxKde = computed(() => {
  if (hourlyTotal.value === 0) return 0;
  let max = 0;
  const samples = 100;
  for (let i = 0; i <= samples; i++) {
    const h = (i / samples) * 23;
    const v = kdeValueAt(h);
    if (v > max) max = v;
  }
  return max;
});

const kdePeakHeight = computed(() => {
  if (hourlyReferenceMax.value <= 0) return 0;
  return (hourlyMax.value / hourlyReferenceMax.value) * MAX_CHART_AMPLITUDE;
});

const kdeYAt = (hour: number): number => {
  if (hourlyTotal.value === 0 || maxKde.value <= 0) return 118;
  const v = kdeValueAt(hour);
  const ratio = v / maxKde.value;
  // 底部极微小外延平滑贴地归零
  if (ratio <= 0.008) return 118;
  return 118 - ratio * kdePeakHeight.value;
};

/** 64 点高密度连续采样，生成极致顺滑的流动波形 */
const kdeSamples = computed<ChartPoint[]>(() => {
  if (hourlyTotal.value === 0 || maxKde.value <= 0) {
    return [
      { x: 0, y: 118 },
      { x: 240, y: 118 },
    ];
  }
  const samples = 64;
  const pts: ChartPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const h = (i / samples) * 23;
    pts.push({
      x: (i / samples) * 240,
      y: kdeYAt(h),
    });
  }
  return pts;
});

/** 极致顺滑的 SVG 路径 */
const hourlyLinePath = computed(() => {
  const pts = kdeSamples.value;
  if (pts.length < 2) return "";
  let path = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
});

const hourlyAreaPath = computed(() => `${hourlyLinePath.value} L 240 118 L 0 118 Z`);

/** 24 个时段在连续高斯流动曲线上严格对应的锚点 */
const hourlyPoints = computed<ChartPoint[]>(() =>
  Array.from({ length: 24 }, (_, hour) => ({
    x: (hour / 23) * 240,
    y: kdeYAt(hour),
  })),
);

const hoveredHour = ref<number | null>(null);

const activeHourlyItem = computed(() => {
  if (hoveredHour.value === null) return null;
  const item = props.hourly.find((h) => h.hour === hoveredHour.value);
  return {
    hour: hoveredHour.value,
    playCount: item?.playCount ?? 0,
    isHovered: true,
  };
});

const activePoint = computed(() =>
  activeHourlyItem.value ? hourlyPoints.value[activeHourlyItem.value.hour] : null,
);

const peakPoint = computed(() =>
  peakHour.value ? hourlyPoints.value[peakHour.value.hour] : null,
);

const activeLabelX = computed(() => Math.min(208, Math.max(32, activePoint.value?.x ?? 0)));
/** 优化悬浮色块位置：固定在图表顶部空旷优雅区（y: 18），跟随 X 轴滑动，不与曲线和圆点粘连 */
const activeLabelY = computed(() => 18);

/**
 * 命中检测：高精度计算鼠标到高斯连续流动曲线的实际几何距离
 * 仅当鼠标靠近曲线轨迹或对应锚点时才判定为在线上，激活悬浮提示；在上方或空白区域时不触发。
 */
const onHourlyMouseMove = (e: MouseEvent): void => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

  // 映射到 SVG 坐标系 (240 x 128)
  const svgX = (x / rect.width) * 240;
  const svgY = (y / rect.height) * 128;

  const hourFloat = (svgX / 240) * 23;
  const hourIdx = Math.round(hourFloat);
  const clampedHour = Math.max(0, Math.min(23, hourIdx));

  // 计算连续高斯曲线在当前 svgX 处的真实高程
  const lineY = kdeYAt(hourFloat);

  // 垂直距离与到最近锚点的几何距离
  const distY = Math.abs(svgY - lineY);
  const targetPoint = hourlyPoints.value[clampedHour];
  const distPoint = targetPoint
    ? Math.hypot(svgX - targetPoint.x, svgY - targetPoint.y)
    : Infinity;

  // 鼠标距离曲线不超过 16px 或靠近锚点 20px 时激活悬停
  if (distY <= 16 || distPoint <= 20) {
    hoveredHour.value = clampedHour;
  } else {
    hoveredHour.value = null;
  }
};

const onHourlyMouseLeave = (): void => {
  hoveredHour.value = null;
};

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
              :disabled="!cell"
              :delay="40"
              :side-offset="6"
              side="top"
              align="center"
              content-class="pointer-events-none z-50 whitespace-nowrap rounded-md bg-primary px-2.5 py-1 text-center font-semibold text-on-primary tabular-nums shadow-md"
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
              <template #content>
                <div v-if="cell" class="text-center">
                  <span
                    class="block whitespace-nowrap text-[9px] font-medium leading-none text-on-primary/80"
                  >
                    {{ cell.day }}
                  </span>
                  <span class="mt-1 block whitespace-nowrap text-xs font-bold leading-none">
                    {{ cellSummary(cell) }}
                  </span>
                </div>
              </template>
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

      <div
        class="relative min-h-0 flex-1 cursor-default select-none"
        @mousemove="onHourlyMouseMove"
        @mouseleave="onHourlyMouseLeave"
      >
        <svg class="absolute inset-0 size-full pointer-events-none" viewBox="0 0 240 128" preserveAspectRatio="none">
          <defs>
            <linearGradient id="hourlyAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgb(var(--s-primary))" stop-opacity="0.22" />
              <stop offset="100%" stop-color="rgb(var(--s-primary))" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          <template v-if="!loading && hourlyTotal > 0">
            <path :d="hourlyAreaPath" fill="url(#hourlyAreaGrad)" />
            <path
              :d="hourlyLinePath"
              fill="none"
              stroke="rgb(var(--s-primary))"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
            <!-- 悬停指示参考细虚线 (高精度发丝级 SVG 细虚线，轻柔精致) -->
            <line
              v-if="activePoint && hoveredHour !== null"
              :x1="activePoint.x"
              y1="6"
              :x2="activePoint.x"
              y2="118"
              stroke="rgb(var(--s-primary))"
              stroke-width="1"
              stroke-dasharray="2 3"
              stroke-opacity="0.32"
              vector-effect="non-scaling-stroke"
            />
          </template>
        </svg>

        <!-- 静态常驻最高峰值点（未悬停时静默呈现） -->
        <div
          v-if="!loading && hourlyTotal > 0 && peakPoint && hoveredHour === null"
          class="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/70 ring-2 ring-surface-panel shadow-sm"
          :style="{
            left: `${(peakPoint.x / 240) * 100}%`,
            top: `${(peakPoint.y / 128) * 100}%`,
          }"
        />

        <!-- 当前指示点（仅在鼠标在线上悬停时显示） -->
        <div
          v-if="!loading && hourlyTotal > 0 && activePoint && hoveredHour !== null"
          class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface-panel shadow-sm transition-[left,top] duration-75"
          :style="{
            left: `${(activePoint.x / 240) * 100}%`,
            top: `${(activePoint.y / 128) * 100}%`,
          }"
        />

        <!-- 当前时段提示气泡（仅在鼠标在线上悬停时显示，在空白区域不显示） -->
        <div
          v-if="!loading && hourlyTotal > 0 && activeHourlyItem && hoveredHour !== null"
          class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-primary px-2.5 py-1 text-center text-[10px] font-semibold text-on-primary tabular-nums shadow-md transition-[left,top] duration-75"
          :style="{
            left: `${(activeLabelX / 240) * 100}%`,
            top: `${(activeLabelY / 128) * 100}%`,
          }"
        >
          <span
            class="block whitespace-nowrap text-[9px] font-medium leading-none text-on-primary/80"
          >
            {{ t("stats.listeningHours") }}
          </span>
          <span class="mt-1 block whitespace-nowrap text-xs font-bold leading-none">
            {{ String(activeHourlyItem.hour).padStart(2, "0") }}:00 · {{ activeHourlyItem.playCount }}{{ t("stats.playsUnit") }}
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
        <span v-if="hoveredHour !== null && activeHourlyItem" class="text-primary font-medium">
          {{ String(activeHourlyItem.hour).padStart(2, "0") }}:00 · {{ t("stats.plays", { count: activeHourlyItem.playCount }, activeHourlyItem.playCount) }}
        </span>
        <span v-else>
          {{
            t("stats.favoriteHour", {
              hour: String(peakHour.hour).padStart(2, "0"),
              count: peakHour.playCount,
            })
          }}
        </span>
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
