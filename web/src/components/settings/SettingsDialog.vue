<script setup lang="ts">
import { useSettingsDialog } from "@/settings/useSettingsDialog";
import { useResponsive } from "@/composables/useResponsive";

const dialog = useSettingsDialog();
const { open } = dialog;
const { isMobile } = useResponsive();

const unsubscribe = window.api.system.onOpenSettings(({ category, highlight }) => {
  dialog.show(category, highlight);
});

onBeforeUnmount(() => unsubscribe());
</script>

<template>
  <SDialog
    v-model:open="open"
    :auto-focus="false"
    :width="isMobile ? '100vw' : 'min(1080px, calc(100vw - 32px))'"
    :height="isMobile ? '100dvh' : 'min(820px, 85vh)'"
    :dialog-class="
      isMobile
        ? '!rounded-none !top-0 !left-0 !translate-x-0 !translate-y-0 !max-h-none !h-[100dvh] !w-[100vw] !border-none'
        : ''
    "
    destroy-on-close
  >
    <SettingsContent class="h-full" />
  </SDialog>
</template>

