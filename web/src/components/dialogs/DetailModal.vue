<script setup lang="ts">
import { useDetailModalStore } from "@/stores/detailModal";
import { useResponsive } from "@/composables/useResponsive";
import IconLucideX from "~icons/lucide/x";
import IconLucideArrowLeft from "~icons/lucide/arrow-left";
import IconLucideDisc3 from "~icons/lucide/disc-3";
import IconLucideListMusic from "~icons/lucide/list-music";
import IconLucideMic2 from "~icons/lucide/mic-2";
import IconLucideCalendarDays from "~icons/lucide/calendar-days";
import IconLucideRadio from "~icons/lucide/radio";

const Collection = defineAsyncComponent(() => import("@/pages/Collection.vue"));
const Artist = defineAsyncComponent(() => import("@/pages/Artist.vue"));
const Daily = defineAsyncComponent(() => import("@/pages/Daily.vue"));

const detailModal = useDetailModalStore();
const { isOpen, currentTarget, canBack, targetKey } = storeToRefs(detailModal);
const { isMobile } = useResponsive();

const { t } = useI18n();

const typeMeta = computed(() => {
  const target = currentTarget.value;
  if (!target) return { label: "", icon: null };
  if (target.kind === "collection") {
    if (target.type === "album") {
      return { label: t("collection.album") || "专辑", icon: IconLucideDisc3 };
    }
    if (target.type === "radio") {
      return { label: t("favorites.tabs.radio") || t("collection.radio") || "播客", icon: IconLucideRadio };
    }
    return { label: t("collection.playlist") || "歌单", icon: IconLucideListMusic };
  }
  if (target.kind === "artist") {
    return { label: t("artist.label") || "艺术家", icon: IconLucideMic2 };
  }
  return { label: t("daily.title") || "每日推荐", icon: IconLucideCalendarDays };
});

const handleClose = (): void => {
  detailModal.close();
};

const handleBack = (): void => {
  detailModal.back();
};

const handleOpenUpdate = (open: boolean): void => {
  if (!open) {
    detailModal.close();
  }
};
</script>

<template>
  <SDialog
    :open="isOpen"
    :closable="false"
    :content-style="{
      padding: 0,
      height: '100%',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }"
    :width="isMobile ? '100vw' : 'min(1120px, calc(100vw - 48px))'"
    :height="isMobile ? '100dvh' : '86vh'"
    :dialog-class="
      isMobile
        ? '!rounded-none !border-0 !inset-0 !translate-x-0 !translate-y-0 !w-full !h-full !max-w-none'
        : undefined
    "
    destroy-on-close
    @update:open="handleOpenUpdate"
  >
    <!-- 悬浮窗顶栏操作栏 -->
    <div
      class="h-11 sm:h-13 shrink-0 flex items-center justify-between px-3 sm:px-5 border-b border-solid border-primary/10 select-none bg-surface-panel/60 backdrop-blur-md"
    >
      <!-- 左侧：返回上一级 + 类型标签 + 标题 -->
      <div class="flex items-center gap-2 sm:gap-2.5 min-w-0">
        <SButton
          v-if="canBack"
          variant="ghost"
          size="small"
          circle
          class="size-8 text-on-surface-variant hover:text-on-surface hover:bg-on-surface/10 cursor-pointer"
          title="返回上一层"
          @click="handleBack"
        >
          <template #icon>
            <IconLucideArrowLeft class="size-4" />
          </template>
        </SButton>

        <STag v-if="typeMeta.label" type="primary" size="small" round class="gap-1 font-medium shrink-0">
          <component :is="typeMeta.icon" v-if="typeMeta.icon" class="size-3.5" />
          <span>{{ typeMeta.label }}</span>
        </STag>

        <span
          v-if="currentTarget && 'name' in currentTarget && currentTarget.name"
          class="truncate text-sm font-semibold text-on-surface-variant/80 max-w-[150px] sm:max-w-sm"
        >
          {{ currentTarget.name }}
        </span>
      </div>

      <!-- 右侧：关闭按钮 (X) -->
      <div class="flex items-center gap-1">
        <SButton
          variant="ghost"
          size="small"
          circle
          class="size-8 text-on-surface-variant/70 hover:text-on-surface hover:bg-on-surface/10 active:scale-95 transition-all cursor-pointer"
          title="关闭 (Esc)"
          @click="handleClose"
        >
          <template #icon>
            <IconLucideX class="size-4.5" />
          </template>
        </SButton>
      </div>
    </div>

    <!-- 悬浮窗内容区 -->
    <div class="flex-1 min-h-0 relative overflow-hidden">
      <template v-if="currentTarget">
        <!-- 歌单 / 专辑 / 排行榜详情 -->
        <Collection
          v-if="currentTarget.kind === 'collection'"
          :key="targetKey"
          :source="currentTarget.source"
          :type="currentTarget.type"
          :id="currentTarget.id"
          :name="currentTarget.name"
          :is-modal="true"
        />

        <!-- 艺术家详情 -->
        <Artist
          v-else-if="currentTarget.kind === 'artist'"
          :key="targetKey"
          :source="currentTarget.source"
          :id="currentTarget.id"
          :name="currentTarget.name"
          :is-modal="true"
        />

        <!-- 每日推荐详情 -->
        <Daily
          v-else-if="currentTarget.kind === 'daily'"
          :key="targetKey"
          :is-modal="true"
        />
      </template>
    </div>
  </SDialog>
</template>
