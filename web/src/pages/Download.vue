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
import IconLucidePlay from "~icons/lucide/play";
import IconLucidePause from "~icons/lucide/pause";
import IconLucideTrash2 from "~icons/lucide/trash-2";
import IconLucideMusic from "~icons/lucide/music";
import IconLucideDownload from "~icons/lucide/download";
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

/** 选中的任务集合（直接多选，无需专门进入批量模式） */
const selectedTaskIds = ref<Set<string>>(new Set());

watch(tab, () => {
  selectedTaskIds.value.clear();
});

const selectedCount = computed(() => selectedTaskIds.value.size);
const hasSelected = computed(() => selectedCount.value > 0);

const hasRunningInActive = computed(() =>
  downloadStore.activeTasks.some((t) => t.status === "downloading" || t.status === "queued"),
);
const hasPausedInActive = computed(() =>
  downloadStore.activeTasks.some((t) => t.status === "paused"),
);

const hasSelectedRunning = computed(() =>
  currentTasks.value.some(
    (t) => selectedTaskIds.value.has(t.taskId) && (t.status === "downloading" || t.status === "queued"),
  ),
);
const hasSelectedPaused = computed(() =>
  currentTasks.value.some(
    (t) => selectedTaskIds.value.has(t.taskId) && t.status === "paused",
  ),
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

/** 批量暂停 */
const batchPauseSelected = (): void => {
  const toPause = currentTasks.value
    .filter((t) => selectedTaskIds.value.has(t.taskId) && (t.status === "downloading" || t.status === "queued"))
    .map((t) => t.taskId);
  if (toPause.length > 0) {
    downloadStore.pauseMany(toPause);
    toast.success(`已暂停 ${toPause.length} 个下载任务`);
  }
};

/** 批量继续 */
const batchResumeSelected = (): void => {
  const toResume = currentTasks.value
    .filter((t) => selectedTaskIds.value.has(t.taskId) && t.status === "paused")
    .map((t) => t.taskId);
  if (toResume.length > 0) {
    downloadStore.resumeMany(toResume);
    toast.success(`已继续 ${toResume.length} 个下载任务`);
  }
};

/** 批量取消 */
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
    toast.success("已取消选中的下载任务");
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

        <!-- 右侧操作区：当有选中项时自动变为批量操作栏，无须专门切换模式 -->
        <div class="flex items-center gap-2.5 shrink-0">
          <template v-if="hasSelected">
            <span class="text-sm font-medium text-on-surface/80 mr-1 select-none">
              {{ t("download.batchSelected", { count: selectedCount }) }}
            </span>

            <!-- 待下载操作：暂停、继续、取消 -->
            <template v-if="tab === 'active'">
              <SButton
                v-if="hasSelectedRunning"
                variant="secondary"
                size="small"
                round
                @click="batchPauseSelected"
              >
                <template #icon><IconLucidePause class="size-4" /></template>
                {{ t("download.batchPause") }}
              </SButton>
              <SButton
                v-if="hasSelectedPaused"
                type="primary"
                size="small"
                round
                @click="batchResumeSelected"
              >
                <template #icon><IconLucidePlay class="size-4" /></template>
                {{ t("download.batchResume") }}
              </SButton>
              <SButton
                variant="secondary"
                size="small"
                round
                @click="batchCancelSelected"
              >
                <template #icon><IconLucideX class="size-4" /></template>
                {{ t("download.batchCancel") }}
              </SButton>
            </template>

            <!-- 下载出错操作：重试 -->
            <template v-else-if="tab === 'error'">
              <SButton
                type="primary"
                size="small"
                round
                @click="batchRetrySelected"
              >
                <template #icon><IconLucideRotateCcw class="size-4" /></template>
                {{ t("download.batchRetry") }}
              </SButton>
            </template>

            <!-- 已完成操作：播放 -->
            <template v-else-if="tab === 'done'">
              <SButton
                type="primary"
                size="small"
                round
                @click="batchPlaySelected"
              >
                <template #icon><IconLucidePlay class="size-4" /></template>
                {{ t("download.batchPlay") }}
              </SButton>
            </template>

            <!-- 批量删除记录 -->
            <SButton
              variant="secondary"
              size="small"
              round
              @click="batchDeleteSelected"
            >
              <template #icon><IconLucideTrash2 class="size-4" /></template>
              {{ t("download.batchDelete") }}
            </SButton>

            <!-- 取消选择 -->
            <SButton
              variant="ghost"
              size="small"
              round
              @click="selectedTaskIds.clear()"
            >
              {{ t("download.deselectAll") }}
            </SButton>
          </template>

          <!-- 常规操作栏（未选中任何项时展示） -->
          <template v-else>
            <template v-if="tab === 'active'">
              <SButton
                v-if="hasRunningInActive"
                variant="secondary"
                round
                @click="downloadStore.pauseAll()"
              >
                <template #icon><IconLucidePause /></template>
                {{ t("download.pauseAll") }}
              </SButton>
              <SButton
                v-if="hasPausedInActive"
                type="primary"
                variant="secondary"
                round
                @click="downloadStore.resumeAll()"
              >
                <template #icon><IconLucidePlay /></template>
                {{ t("download.resumeAll") }}
              </SButton>
            </template>
            <SButton
              v-else-if="tab === 'done'"
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
              variant="secondary"
              round
              :disabled="!hasFinished"
              @click="requestClearFinished"
            >
              <template #icon><IconLucideTrash2 /></template>
              {{ t("download.clearFinished") }}
            </SButton>
          </template>
        </div>
      </div>
    </div>

    <!-- 列表 -->
    <div class="flex-1 min-h-0">
      <DownloadList
        v-if="currentTasks.length > 0"
        ref="listRef"
        :tasks="currentTasks"
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
