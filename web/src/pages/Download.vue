<script setup lang="ts">
defineOptions({ name: "Download" });

import type { DownloadTask, DownloadStatus } from "@shared/types/download";
import type { TabItem } from "@/components/ui/STabs.vue";
import { useDownloadStore } from "@/stores/download";
import { useDownload } from "@/composables/useDownload";
import { dialog } from "@/composables/useDialog";
import { toast } from "@/composables/useToast";
import * as player from "@/core/player";
import DownloadList from "@/components/list/DownloadList.vue";
import SCheckbox from "@/components/ui/SCheckbox.vue";
import IconLucidePlay from "~icons/lucide/play";
import IconLucideTrash2 from "~icons/lucide/trash-2";
import IconLucideMusic from "~icons/lucide/music";
import IconLucideDownload from "~icons/lucide/download";
import IconLucideListChecks from "~icons/lucide/list-checks";
import IconLucideX from "~icons/lucide/x";
import IconLucideRotateCcw from "~icons/lucide/rotate-ccw";

const { t } = useI18n();
const downloadStore = useDownloadStore();
const { retryMany } = useDownload();

type DownloadTab = "active" | "error" | "done";
const tab = ref<DownloadTab>("active");

const tabs = computed<TabItem[]>(() => [
  { key: "active", label: t("download.tabActive") },
  { key: "error", label: t("download.tabError") },
  { key: "done", label: t("download.tabDone") },
]);

const isError = (status: DownloadStatus): boolean =>
  status === "failed" || status === "canceled" || status === "interrupted";

/** 当前 tab 的任务 */
const currentTasks = computed<DownloadTask[]>(() => {
  if (tab.value === "active") return downloadStore.activeTasks;
  if (tab.value === "error")
    return downloadStore.historyTasks.filter((task) => isError(task.status));
  return downloadStore.historyTasks.filter((task) => task.status === "done");
});

/** 批量管理模式与选中集合 */
const isBatchMode = ref(false);
const selectedTaskIds = ref<Set<string>>(new Set());

watch(tab, () => {
  selectedTaskIds.value.clear();
});

const selectedCount = computed(() => selectedTaskIds.value.size);
const isAllSelected = computed(
  () => currentTasks.value.length > 0 && selectedCount.value === currentTasks.value.length,
);
const isIndeterminate = computed(
  () => selectedCount.value > 0 && !isAllSelected.value,
);

const toggleSelect = (taskId: string) => {
  const next = new Set(selectedTaskIds.value);
  if (next.has(taskId)) {
    next.delete(taskId);
  } else {
    next.add(taskId);
  }
  selectedTaskIds.value = next;
};

const toggleSelectAll = (checked: boolean) => {
  if (checked) {
    selectedTaskIds.value = new Set(currentTasks.value.map((t) => t.taskId));
  } else {
    selectedTaskIds.value = new Set();
  }
};

/** 批量暂停/取消 */
const batchCancelSelected = async (): Promise<void> => {
  if (selectedCount.value === 0) return;
  const count = selectedCount.value;
  const confirmed = await dialog.confirm({
    title: t("download.batchCancelConfirmTitle"),
    content: t("download.batchCancelConfirmContent", { count }),
    type: "warning",
  });
  if (confirmed) {
    downloadStore.cancelMany([...selectedTaskIds.value]);
    selectedTaskIds.value = new Set();
    toast.success("已暂停/取消选中的任务");
  }
};

/** 批量重试 */
const batchRetrySelected = async (): Promise<void> => {
  if (selectedCount.value === 0) return;
  const tasksToRetry = currentTasks.value.filter((t) => selectedTaskIds.value.has(t.taskId));
  selectedTaskIds.value = new Set();
  await retryMany(tasksToRetry);
};

/** 批量播放 */
const batchPlaySelected = (): void => {
  const tasksToPlay = currentTasks.value.filter(
    (t) => selectedTaskIds.value.has(t.taskId) && t.status === "done" && t.filePath,
  );
  if (tasksToPlay.length > 0) {
    const tracks = tasksToPlay.map((task) => ({
      ...task.track,
      source: "local" as const,
      path: task.filePath,
      id: task.filePath!,
    }));
    void player.playAll(tracks);
  }
};

/** 批量删除下载记录 */
const batchDeleteSelected = async (): Promise<void> => {
  if (selectedCount.value === 0) return;
  const count = selectedCount.value;
  const confirmed = await dialog.confirm({
    title: t("download.batchDeleteConfirmTitle"),
    content: t("download.batchDeleteConfirmContent", { count }),
    type: "warning",
  });
  if (confirmed) {
    downloadStore.removeMany([...selectedTaskIds.value]);
    selectedTaskIds.value = new Set();
    toast.success(`已删除 ${count} 条下载记录`);
  }
};

/** 是否有可清空的已结束任务 */
const hasFinished = computed(() => downloadStore.historyTasks.length > 0);

/** 二次确认后清空已结束任务记录（不删本地文件） */
const requestClearFinished = async (): Promise<void> => {
  const confirmed = await dialog.confirm({
    title: t("download.clearConfirmTitle"),
    content: t("download.clearConfirmContent"),
    type: "warning",
  });
  if (confirmed) downloadStore.clearFinished();
};

const listRef = ref<InstanceType<typeof DownloadList> | null>(null);

const emptyText = computed(() =>
  tab.value === "done" ? t("download.emptyDone") : t("download.empty"),
);

onMounted(() => void downloadStore.init());
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 顶栏 -->
    <div class="shrink-0 px-5 pb-2">
      <div class="flex items-baseline gap-4 mt-2 mb-4 min-w-0">
        <h1 class="text-3xl font-bold text-on-surface shrink-0 text-balance">
          {{ t("download.title") }}
        </h1>
        <span class="flex items-center gap-1.5 text-sm text-on-surface-variant/50 shrink-0">
          <IconLucideMusic class="size-3.5" />
          {{ t("common.totalSongs", { count: currentTasks.length }) }}
        </span>
      </div>
      <div class="flex items-center justify-between gap-4">
        <STabs
          :model-value="tab"
          :tabs="tabs"
          type="bar"
          size="large"
          @update:model-value="(key) => (tab = key as DownloadTab)"
        />
        <div class="flex items-center gap-3 shrink-0">
          <SButton
            variant="secondary"
            round
            :disabled="currentTasks.length === 0"
            @click="isBatchMode = !isBatchMode"
          >
            <template #icon><IconLucideListChecks /></template>
            {{ isBatchMode ? t("download.batchExit") : t("download.batchManage") }}
          </SButton>
          <SButton
            v-if="!isBatchMode && tab === 'done'"
            type="primary"
            variant="secondary"
            round
            :disabled="currentTasks.length === 0"
            @click="listRef?.playAll()"
          >
            <template #icon><IconLucidePlay /></template>
            {{ t("common.playAll") }}
          </SButton>
          <SButton
            v-if="!isBatchMode"
            variant="secondary"
            round
            :disabled="!hasFinished"
            @click="requestClearFinished"
          >
            <template #icon><IconLucideTrash2 /></template>
            {{ t("download.clearFinished") }}
          </SButton>
        </div>
      </div>

      <!-- 批量管理操作栏 -->
      <div
        v-if="isBatchMode"
        class="mt-3 flex items-center justify-between gap-4 py-2 px-4 rounded-xl bg-surface-panel border border-primary/20 shadow-sm"
      >
        <div class="flex items-center gap-3">
          <SCheckbox
            :checked="isAllSelected"
            :indeterminate="isIndeterminate"
            @update:checked="toggleSelectAll"
          >
            <span class="text-sm font-medium">
              {{ t("download.batchSelected", { count: selectedCount }) }}
            </span>
          </SCheckbox>
        </div>
        <div class="flex items-center gap-2">
          <!-- 待下载：批量暂停/取消 -->
          <SButton
            v-if="tab === 'active'"
            variant="secondary"
            size="small"
            round
            :disabled="selectedCount === 0"
            @click="batchCancelSelected"
          >
            <template #icon><IconLucideX class="size-4" /></template>
            {{ t("download.batchCancel") }}
          </SButton>

          <!-- 下载出错：批量重试 -->
          <SButton
            v-if="tab === 'error'"
            type="primary"
            size="small"
            round
            :disabled="selectedCount === 0"
            @click="batchRetrySelected"
          >
            <template #icon><IconLucideRotateCcw class="size-4" /></template>
            {{ t("download.batchRetry") }}
          </SButton>

          <!-- 已完成：批量播放 -->
          <SButton
            v-if="tab === 'done'"
            type="primary"
            size="small"
            round
            :disabled="selectedCount === 0"
            @click="batchPlaySelected"
          >
            <template #icon><IconLucidePlay class="size-4" /></template>
            {{ t("download.batchPlay") }}
          </SButton>

          <!-- 批量删除任务/记录 -->
          <SButton
            variant="secondary"
            size="small"
            round
            :disabled="selectedCount === 0"
            @click="batchDeleteSelected"
          >
            <template #icon><IconLucideTrash2 class="size-4" /></template>
            {{ t("download.batchDelete") }}
          </SButton>
        </div>
      </div>
    </div>

    <!-- 列表 -->
    <div class="flex-1 min-h-0">
      <DownloadList
        v-if="currentTasks.length > 0"
        ref="listRef"
        :tasks="currentTasks"
        :batch-mode="isBatchMode"
        :selected-task-ids="selectedTaskIds"
        @toggle-select="toggleSelect"
        @toggle-select-all="toggleSelectAll"
      />
      <div v-else class="h-full flex items-center justify-center">
        <div class="text-center text-on-surface-variant/50">
          <IconLucideDownload class="size-12 mx-auto mb-3 opacity-30" />
          <div class="text-sm">{{ emptyText }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
