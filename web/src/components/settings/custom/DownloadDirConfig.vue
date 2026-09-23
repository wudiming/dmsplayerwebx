<script setup lang="ts">
import IconLucideFolderDown from "~icons/lucide/folder-down";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();
</script>

<template>
  <div
    class="flex items-center justify-between gap-4 rounded-xl border border-solid border-outline-variant/15 bg-surface-panel px-4 py-3.5"
  >
    <div class="flex items-center gap-3 min-w-0 flex-1">
      <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary shrink-0">
        <IconLucideFolderDown class="size-5" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-base font-medium">{{ t("settings.downloadDir.label") }}</div>
        <div class="mt-0.5 truncate text-sm text-on-surface-variant/70">
          系统默认下载文件夹（由浏览器自动接管，直接保存无需询问）
        </div>
      </div>
    </div>
    <div class="shrink-0 text-xs px-2.5 py-1 rounded-full bg-surface-variant/40 text-on-surface-variant">
      浏览器管理
    </div>
  </div>
</template>

