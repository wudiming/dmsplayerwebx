<script setup lang="ts">
import type { CoverItem } from "@/types/artist";
import type { SVirtualListExposed } from "@/components/ui/SVirtualList.vue";
import { useFloatingPlayerBar } from "@/composables/useFloatingPlayerBar";

export interface CoverListProps {
  /** 列表数据 */
  items: CoverItem[];
  /** 列表类型 */
  type?: "default" | "artist" | "video";
  /** 是否虚拟滚动 */
  virtual?: boolean;
  /** 单项最小宽度（px） */
  minSize?: number;
  /** 项间距（px） */
  gap?: number;
  /** 封面圆角 class */
  rounded?: string;
  /** 封面占位图 */
  fallback?: string;
  /** 横向 padding（px） */
  paddingX?: number;
  /** 顶部 padding（px） */
  paddingTop?: number;
  /** 底部 padding（px） */
  paddingBottom?: number;
  /** 是否还能继续触底加载 */
  hasMore?: boolean;
  /** 触底加载中 */
  loadingMore?: boolean;
  /** 限制最大展示行数（设置为 2 时，根据当前真实列数动态截取 2 行完整填满，无多余未满项） */
  limitRows?: number;
  /** 最大列数（统一为 8 列） */
  maxColumns?: number;
  /** 强制固定列数 */
  columns?: number;
}

const props = withDefaults(defineProps<CoverListProps>(), {
  type: "default",
  virtual: true,
  minSize: 130,
  maxColumns: 8,
  gap: 20,
  rounded: "rounded-xl",
  paddingX: 0,
  paddingTop: 0,
  paddingBottom: 0,
  hasMore: false,
  loadingMore: false,
});

const { t } = useI18n();

const { isFloatingBar, PLAYER_BAR_GAP } = useFloatingPlayerBar();

/** 虚拟模式底部 padding：悬浮播放栏下留白避免遮挡 */
const virtualPaddingBottom = computed(() =>
  isFloatingBar.value ? PLAYER_BAR_GAP : props.paddingBottom,
);

const emit = defineEmits<{
  click: [item: CoverItem];
  reachBottom: [];
  scroll: [event: Event];
}>();

const virtualListRef = ref<SVirtualListExposed | null>(null);
const scrollEl = computed(() => virtualListRef.value?.scrollRef ?? null);

defineExpose({
  scrollTo: (top: number, behavior: ScrollBehavior = "smooth") => virtualListRef.value?.scrollTo(top, behavior),
  scrollToTop: (behavior: ScrollBehavior = "smooth") => virtualListRef.value?.scrollTo(0, behavior),
  getScrollTop: () => virtualListRef.value?.getScrollTop() ?? 0,
  scrollRef: scrollEl,
});
const { width: scrollWidth } = useElementSize(scrollEl);

const gridRef = shallowRef<HTMLElement | null>(null);
const { width: gridWidth } = useElementSize(gridRef);
let lastValidWidth = 0;

/** 实际可用网格宽度 = scrollEl 内容宽度 / gridRef 容器宽度 − 左右 padding */
const innerWidth = computed(() => {
  const currentW = props.virtual ? scrollWidth.value : gridWidth.value;
  if (currentW > 0) {
    lastValidWidth = currentW;
  }
  const w = currentW > 0 ? currentW : lastValidWidth > 0 ? lastValidWidth : 1200;
  return Math.max(0, w - props.paddingX * 2);
});

/** 信息区固定高度估算：标题 line-clamp-2 + 可选 subtitle + 上下 padding */
const INFO_HEIGHT = 76;

/** CSS 等价计算：列数 = floor((W + G) / (M + G))，统一最大 8 列 */
const columnCount = computed(() => {
  if (props.columns && props.columns > 0) return props.columns;
  if (!innerWidth.value) return props.maxColumns ?? 8;
  const calc = Math.floor((innerWidth.value + props.gap) / (props.minSize + props.gap));
  const maxCols = props.maxColumns ?? 8;
  return Math.max(1, Math.min(maxCols, calc));
});

/** 截取展示项目：如果设置了 limitRows，严格只展示充满整数行的卡片，绝不多出一星半点！ */
const displayItems = computed(() => {
  if (!props.limitRows || props.limitRows <= 0) return props.items;
  const cols = columnCount.value;
  if (cols <= 0 || props.items.length === 0) return [];
  const fullRows = Math.floor(props.items.length / cols);
  const rowsToShow = Math.min(props.limitRows, Math.max(1, fullRows));
  const maxCount = Math.min(props.items.length, cols * rowsToShow);
  return props.items.slice(0, maxCount);
});

/** 单列实际宽度 */
const colWidth = computed(() => {
  if (!innerWidth.value) return props.minSize;
  return (innerWidth.value - (columnCount.value - 1) * props.gap) / columnCount.value;
});

/** 行高 = 封面高度 + 信息区 + 行间距 */
const rowHeight = computed(() => {
  const coverH = props.type === "video" ? (colWidth.value * 9) / 16 : colWidth.value;
  return coverH + INFO_HEIGHT + props.gap;
});

interface Row {
  id: string;
  items: CoverItem[];
}

/** 把 items 按列数切成行 */
const rows = computed<Row[]>(() => {
  const cols = columnCount.value;
  if (cols <= 0 || props.items.length === 0) return [];
  const out: Row[] = [];
  for (let i = 0; i < props.items.length; i += cols) {
    const slice = props.items.slice(i, i + cols);
    out.push({ id: slice[0]?.id ?? `__pad_${i}`, items: slice });
  }
  return out;
});

const getRowKey = (row: Row): string => row.id;
</script>

<template>
  <!-- 虚拟滚动 -->
  <SVirtualList
    v-if="virtual"
    ref="virtualListRef"
    :items="rows"
    :item-height="rowHeight"
    item-fixed
    :get-item-key="getRowKey"
    :padding-top="paddingTop"
    :padding-bottom="virtualPaddingBottom"
    height="100%"
    @scroll="(e) => emit('scroll', e)"
    @reach-bottom="emit('reachBottom')"
  >
    <template #footer>
      <div
        v-if="rows.length > 0 && loadingMore"
        class="py-3 flex items-center justify-center gap-2 text-sm text-on-surface-variant/50"
      >
        <SLoading class="size-3.5 text-primary/70 shrink-0" />
        <span>{{ t("common.loading") }}</span>
      </div>
      <div
        v-else-if="rows.length > 0 && !hasMore"
        class="py-3 text-center text-sm text-on-surface-variant/40"
      >
        {{ t("common.noMore") }}
      </div>
    </template>
    <template #default="{ item: row }: { item: Row }">
      <div
        class="grid"
        :style="{
          paddingLeft: `${paddingX}px`,
          paddingRight: `${paddingX}px`,
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          gap: `${gap}px`,
        }"
      >
        <CoverCard
          v-for="item in row.items"
          :key="item.id"
          :item="item"
          :type="type"
          :rounded="rounded"
          :fallback="fallback"
          @click="emit('click', item)"
        />
      </div>
    </template>
  </SVirtualList>
  <!-- 普通网格：根据屏幕实际列数严格满格渲染，无零散错位 -->
  <div
    v-else
    ref="gridRef"
    class="grid w-full"
    :style="{
      padding: `${paddingTop}px ${paddingX}px ${paddingBottom}px`,
      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      gap: `${gap}px`,
    }"
  >
    <CoverCard
      v-for="item in displayItems"
      :key="item.id"
      :item="item"
      :type="type"
      :rounded="rounded"
      :fallback="fallback"
      @click="emit('click', item)"
    />
  </div>
</template>
