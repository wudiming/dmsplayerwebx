<script setup lang="ts">
import IconLucideFolderDown from "~icons/lucide/folder-down";
import IconLucideFolderCheck from "~icons/lucide/folder-check";
import IconLucideRotateCcw from "~icons/lucide/rotate-ccw";
import { toast } from "@/composables/useToast";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();

const customDirName = ref<string>("");
const supportsPicker = typeof window !== "undefined" && "showDirectoryPicker" in window;

const loadDir = () => {
  try {
    const saved = localStorage.getItem("splayer_web_custom_download_dir_name");
    if (saved) customDirName.value = saved;
  } catch {}
};

import { setStoredDownloadDirHandle } from "@/services/download/downloadDirStorage";

const pickCustomDir = async () => {
  if (!supportsPicker) {
    toast.info("当前浏览器环境由系统原生下载器接管保存至本地系统");
    return;
  }
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
    if (handle?.name) {
      customDirName.value = handle.name;
      await setStoredDownloadDirHandle(handle);
      toast.success(`已设置下载目录为当前设备上的 [${handle.name}] 文件夹`);
    }
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      toast.error("选择文件夹失败");
    }
  }
};

const resetToDefault = async () => {
  customDirName.value = "";
  await setStoredDownloadDirHandle(null);
  toast.success("已恢复为当前系统默认下载目录");
};

onMounted(loadDir);
</script>

<template>
  <div
    class="flex items-center justify-between gap-4 rounded-xl border border-solid border-outline-variant/15 bg-surface-panel px-4 py-3.5"
  >
    <div class="flex items-center gap-3 min-w-0 flex-1">
      <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary shrink-0">
        <IconLucideFolderCheck v-if="customDirName" class="size-5" />
        <IconLucideFolderDown v-else class="size-5" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-base font-medium">{{ t("settings.downloadDir.label") }}</div>
        <div class="mt-0.5 truncate text-sm text-on-surface-variant/70">
          <span v-if="customDirName">
            当前设备指定文件夹：<span class="font-medium text-primary">{{ customDirName }}</span>
          </span>
          <span v-else>
            当前设备系统默认下载目录
          </span>
        </div>
      </div>
    </div>
    <div class="shrink-0 flex items-center gap-2">
      <SButton
        v-if="customDirName"
        variant="ghost"
        circle
        :title="t('common.reset')"
        @click="resetToDefault"
      >
        <template #icon><IconLucideRotateCcw /></template>
      </SButton>
      <SButton
        v-if="supportsPicker"
        variant="secondary"
        size="small"
        @click="pickCustomDir"
      >
        {{ t("settings.downloadDir.change") }}
      </SButton>
      <div
        v-else
        class="text-xs px-2.5 py-1 rounded-full bg-surface-variant/40 text-on-surface-variant"
      >
        当前终端自动保存
      </div>
    </div>
  </div>
</template>

