<script setup lang="ts">
import { useSettingsDialog } from "@/settings/useSettingsDialog";
import { useWindowControls } from "@/composables/useWindowControls";
import { useThemeStore } from "@/stores/theme";
import { useUpdateStore } from "@/stores/update";
import { mobileSidebarOpen } from "@/composables/useResponsive";
import type { DropdownMenuItem } from "@/components/ui/SDropdownMenu.vue";
import IconSun from "~icons/lucide/sun";
import IconMoon from "~icons/lucide/moon";
import IconMonitor from "~icons/lucide/monitor";
import IconRefreshCw from "~icons/lucide/refresh-cw";
import IconSettings from "~icons/lucide/settings";
import IconLucideMenu from "~icons/lucide/menu";

const router = useRouter();
const { t } = useI18n();
const { show: showSettings } = useSettingsDialog();
const theme = useThemeStore();
const update = useUpdateStore();
const { isBorderless } = useWindowControls();

const menuItems = computed<DropdownMenuItem[]>(() => [
  {
    key: "theme:light",
    label: t("settings.themeMode.light"),
    icon: IconSun,
    active: theme.mode === "light",
    disabled: theme.appearanceStyle === "image",
  },
  {
    key: "theme:dark",
    label: t("settings.themeMode.dark"),
    icon: IconMoon,
    active: theme.mode === "dark",
    disabled: theme.appearanceStyle === "image",
  },
  {
    key: "theme:system",
    label: t("settings.themeMode.system"),
    icon: IconMonitor,
    active: theme.mode === "system",
    disabled: theme.appearanceStyle === "image",
  },
  { key: "reload", label: t("nav.reload"), icon: IconRefreshCw, separator: true },
  { key: "settings", label: t("nav.globalSettings"), icon: IconSettings },
]);

const onMenuSelect = (key: string): void => {
  if (key.startsWith("theme:")) {
    const targetMode = key.replace("theme:", "") as "light" | "dark" | "system";
    theme.mode = targetMode;
  } else if (key === "reload") {
    location.reload();
  } else if (key === "settings") {
    showSettings();
  }
};
</script>

<template>
  <div class="flex items-center justify-between flex-1 h-full min-w-0 app-drag-region">
    <!-- 左侧 -->
    <div class="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
      <SButton
        class="app-no-drag shrink-0 md:hidden"
        variant="tertiary"
        circle
        :size="40"
        :icon-size="20"
        aria-label="Menu"
        @click="mobileSidebarOpen = true"
      >
        <template #icon><IconLucideMenu /></template>
      </SButton>
      <NavSearch />
      <SButton
        v-if="update.hasUpdate"
        class="app-no-drag shrink-0"
        variant="tertiary"
        circle
        :size="40"
        :icon-size="20"
        :title="t('update.dialogTitle')"
        @click="update.openDialog()"
      >
        <template #icon><IconLucideCircleArrowUp /></template>
      </SButton>
    </div>
    <!-- 中间 -->
    <div class="flex-1 h-full min-w-4" />
    <!-- 右侧 -->
    <div class="flex items-center gap-2 sm:gap-3 shrink-0">
      <NavUser />
      <SDropdownMenu :items="menuItems" @select="onMenuSelect">
        <template #trigger>
          <SButton class="app-no-drag shrink-0" variant="tertiary" circle :size="40">
            <template #icon><IconLucideSettings /></template>
          </SButton>
        </template>
      </SDropdownMenu>
    </div>
  </div>
</template>
