<script setup lang="ts">
import type { Component } from "vue";
import localforage from "localforage";
import { toast } from "@/composables/useToast";
import { dialog } from "@/composables/useDialog";
import { useSettingsStore } from "@/stores/settings";
import { useThemeStore } from "@/stores/theme";
import { useMediaStore } from "@/stores/media";
import { useStatusStore } from "@/stores/status";
import { useHistoryStore } from "@/stores/history";
import { usePlaylistStore } from "@/stores/playlist";
import { useLibraryStore } from "@/stores/library";
import { useUserStore } from "@/stores/user";
import * as player from "@/core/player";
import * as queue from "@/stores/queue";
import * as playback from "@/services/playback";
import { defaultSystemConfig } from "@shared/defaults/settings";
import { APP_VERSION } from "@/utils/config";
import IconLucideDownload from "~icons/lucide/download";
import IconLucideUpload from "~icons/lucide/upload";
import IconLucideRotateCcw from "~icons/lucide/rotate-ccw";
import IconLucideTrash2 from "~icons/lucide/trash-2";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();

type ActionKey = "backup" | "restore" | "resetSettings" | "resetAll";

interface ActionRow {
  key: ActionKey;
  buttonKey: string;
  icon: Component;
  /** error 类型按钮（红色） */
  destructive?: boolean;
}

const rows: ActionRow[] = [
  { key: "backup", buttonKey: "backup.button", icon: IconLucideDownload },
  { key: "restore", buttonKey: "restore.button", icon: IconLucideUpload },
  { key: "resetSettings", buttonKey: "resetSettings.button", icon: IconLucideRotateCcw },
  { key: "resetAll", buttonKey: "resetAll.button", icon: IconLucideTrash2, destructive: true },
];

const running = ref<ActionKey | null>(null);

/** 备份文件标识：恢复时用以辨识是否本应用导出的 JSON */
const BACKUP_TYPE = "splayer-settings";
/** 渲染端 settings store 持久化到 localStorage 的 key（与 pinia store id 同名） */
const SETTINGS_STORE_KEY = "settings";

interface BackupPayload {
  type: typeof BACKUP_TYPE;
  /** 导出时的软件版本号 */
  appVersion: string;
  exportedAt: number;
  /** 主进程 SystemConfig */
  main: unknown;
  /** 渲染端 settings / theme / uiZoom 持久化 state */
  renderer: {
    settings?: unknown;
    theme?: unknown;
    uiZoom?: number;
  };
}

/** 校验是否本应用导出的备份 */
const isBackupPayload = (data: unknown): data is BackupPayload => {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return obj.type === BACKUP_TYPE && typeof obj.exportedAt === "number";
};

/** 备份导出 */
const handleBackup = async (): Promise<void> => {
  try {
    const main = await window.api.config.getAll();
    const rawRenderer = localStorage.getItem(SETTINGS_STORE_KEY);
    const rendererSettings = rawRenderer ? JSON.parse(rawRenderer) : undefined;
    const rawTheme = localStorage.getItem("theme");
    const themeSettings = rawTheme ? JSON.parse(rawTheme) : undefined;
    const rawZoom = localStorage.getItem("system.uiZoom");
    const uiZoom = rawZoom ? Number(rawZoom) : 100;

    const payload: BackupPayload = {
      type: BACKUP_TYPE,
      appVersion: APP_VERSION,
      exportedAt: Date.now(),
      main,
      renderer: {
        settings: rendererSettings,
        theme: themeSettings,
        uiZoom,
      },
    };
    const res = await window.api.config.exportToFile(payload);
    if (res.ok) {
      toast.success(t("settings.backup.exported"));
    } else if (res.reason === "writeFailed") {
      toast.error(t("settings.backup.failed"));
    }
  } catch (err) {
    console.error("Backup failed:", err);
    toast.error(t("settings.backup.failed"));
  }
};

/** 恢复设置 */
const handleRestore = async (): Promise<void> => {
  const picked = await window.api.config.importFromFile();
  if (!picked.ok) {
    if (picked.reason === "parseFailed") toast.error(t("settings.restore.parseFailed"));
    return;
  }
  if (!isBackupPayload(picked.data)) {
    toast.error(t("settings.restore.invalidFormat"));
    return;
  }
  const confirmed = await dialog.confirm({
    title: t("settings.restore.confirmTitle"),
    content: t("settings.restore.confirmDesc"),
    type: "warning",
  });
  if (!confirmed) return;

  try {
    if (picked.data.main) {
      await window.api.config.replaceAll(picked.data.main);
    }
    const settingsState = picked.data.renderer?.settings;
    if (settingsState !== undefined) {
      localStorage.setItem(SETTINGS_STORE_KEY, JSON.stringify(settingsState));
    }
    const themeState = (picked.data.renderer as any)?.theme;
    if (themeState !== undefined) {
      localStorage.setItem("theme", typeof themeState === "string" ? themeState : JSON.stringify(themeState));
    }
    const uiZoom = (picked.data.renderer as any)?.uiZoom;
    if (uiZoom !== undefined) {
      const zoomNum = Number(uiZoom) || 100;
      localStorage.setItem("system.uiZoom", String(zoomNum));
      try {
        document.documentElement.style.zoom = `${zoomNum}%`;
      } catch {}
    }
    toast.success(t("settings.restore.success"));
    setTimeout(async () => {
      await window.api.system.relaunch();
    }, 600);
  } catch (err) {
    console.error("Restore failed:", err);
    toast.error(t("settings.restore.failed"));
  }
};

/** 重置设置：恢复默认设置 */
const handleResetSettings = async (): Promise<void> => {
  const confirmed = await dialog.confirm({
    title: t("settings.resetSettings.confirmTitle"),
    content: t("settings.resetSettings.confirmDesc"),
    type: "warning",
  });
  if (!confirmed) return;

  try {
    const settingsStore = useSettingsStore();
    const themeStore = useThemeStore();
    settingsStore.$reset();
    themeStore.$reset();
    await window.api.config.reset();
    try {
      localStorage.removeItem(SETTINGS_STORE_KEY);
      localStorage.removeItem("theme");
      localStorage.removeItem("system.uiZoom");
      localStorage.removeItem("splayer_web_locale");
      document.documentElement.style.zoom = "100%";
    } catch {}
    await settingsStore.syncSystem();
    toast.success(t("settings.resetSettings.done"));
  } catch (err) {
    console.error("Reset settings failed:", err);
    toast.error(t("settings.resetSettings.failed"));
  }
};

/** 清除全部数据：彻底清空本地浏览器保存的全部数据并重置 */
const handleResetAll = async (): Promise<void> => {
  const confirmed = await dialog.confirm({
    title: t("settings.resetAll.confirmTitle"),
    content: t("settings.resetAll.confirmDesc"),
    type: "error",
  });
  if (!confirmed) return;

  try {
    // 0. 立即停止播放器并重置时间源
    try {
      await player.stop();
    } catch {}
    try {
      await window.api.player.stop();
    } catch {}
    try {
      playback.reset();
    } catch {}

    // 1. 立即清空播放队列与当前歌曲（底部播放栏立即隐藏）
    try {
      queue.clearQueue();
    } catch {}
    try {
      useMediaStore().clear();
    } catch {}
    try {
      useStatusStore().$reset();
    } catch {}

    // 2. 清空其余内存 stores
    try {
      useHistoryStore().clear();
    } catch {}
    try {
      await usePlaylistStore().clear();
    } catch {}
    try {
      useLibraryStore().$reset();
    } catch {}
    try {
      await useUserStore().logout();
    } catch {}
    try {
      useSettingsStore().$reset();
    } catch {}
    try {
      useThemeStore().$reset();
    } catch {}

    // 3. 清除后端平台 Session（设置超时防挂起）
    try {
      await Promise.race([
        Promise.allSettled([
          window.api.apis.clearSession("netease"),
          window.api.apis.clearSession("qqmusic"),
          window.api.apis.clearSession("kugou"),
        ]),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch {}

    // 4. 清理 IndexedDB 数据库（使用 dropInstance 关闭连接并彻底移除，避免死锁）
    try {
      await Promise.race([
        localforage.dropInstance({ name: "splayer" }),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch {}
    try {
      if (typeof indexedDB !== "undefined" && indexedDB.databases) {
        const dbs = await Promise.race([
          indexedDB.databases(),
          new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 500)),
        ]);
        for (const db of dbs) {
          if (db.name) {
            try {
              indexedDB.deleteDatabase(db.name);
            } catch {}
          }
        }
      }
    } catch {}

    // 5. 清除 CacheStorage 缓存
    try {
      if (typeof caches !== "undefined" && caches.keys) {
        const keys = await Promise.race([
          caches.keys(),
          new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 500)),
        ]);
        for (const k of keys) {
          await caches.delete(k);
        }
      }
    } catch {}

    // 6. 清除浏览器 LocalStorage 和 SessionStorage
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}

    // 7. 写入纯净默认配置（引导设为已完成）
    try {
      const defaultCfg = structuredClone(defaultSystemConfig);
      defaultCfg.system.onboardingCompleted = true;
      localStorage.setItem("splayer_web_config", JSON.stringify(defaultCfg));
      document.documentElement.style.zoom = "100%";
    } catch {}

    toast.success(t("settings.resetAll.done"));
    setTimeout(() => {
      window.location.reload();
    }, 600);
  } catch (err) {
    console.error("Reset all failed:", err);
    toast.error(t("settings.resetAll.failed"));
  }
};

/** 按 key 分发并互斥执行 */
const runAction = async (key: ActionKey): Promise<void> => {
  if (running.value) return;
  running.value = key;
  try {
    if (key === "backup") await handleBackup();
    else if (key === "restore") await handleRestore();
    else if (key === "resetSettings") await handleResetSettings();
    else await handleResetAll();
  } finally {
    running.value = null;
  }
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="row in rows"
      :key="row.key"
      class="rounded-xl bg-surface-panel border border-solid border-outline-variant/15 px-4 py-3.5 flex items-center justify-between gap-4"
    >
      <div class="min-w-0 flex-1">
        <div class="text-base">{{ t(`settings.${row.key}.label`) }}</div>
        <div class="text-sm text-on-surface-variant/70 mt-0.5">
          {{ t(`settings.${row.key}.description`) }}
        </div>
      </div>
      <SButton
        :type="row.destructive ? 'error' : 'primary'"
        variant="secondary"
        :loading="running === row.key"
        :disabled="running !== null && running !== row.key"
        @click="runAction(row.key)"
      >
        <template #icon>
          <component :is="row.icon" class="w-4 h-4" />
        </template>
        {{ t(`settings.${row.buttonKey}`) }}
      </SButton>
    </div>
  </div>
</template>
