<script setup lang="ts">
import localforage from "localforage";
import { toast } from "@/composables/useToast";
import { dialog } from "@/composables/useDialog";
import { usePlaylistStore } from "@/stores/playlist";
import { useSettingsStore } from "@/stores/settings";
import { defaultSystemConfig } from "@shared/defaults/settings";
import { APP_VERSION } from "@/utils/config";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();

type ActionKey = "backup" | "restore" | "resetSettings" | "resetAll";

interface ActionRow {
  key: ActionKey;
  buttonKey: string;
  /** error 类型按钮（红色） */
  destructive?: boolean;
}

const rows: ActionRow[] = [
  { key: "backup", buttonKey: "backup.button" },
  { key: "restore", buttonKey: "restore.button" },
  { key: "resetSettings", buttonKey: "resetSettings.button" },
  { key: "resetAll", buttonKey: "resetAll.button", destructive: true },
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
  /** 渲染端 settings store 持久化 state */
  renderer: { settings?: unknown };
}

/** 校验是否本应用导出的备份 */
const isBackupPayload = (data: unknown): data is BackupPayload => {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return obj.type === BACKUP_TYPE && typeof obj.exportedAt === "number";
};

/** 备份导出 */
const handleBackup = async (): Promise<void> => {
  const main = await window.api.config.getAll();
  const rawRenderer = localStorage.getItem(SETTINGS_STORE_KEY);
  const rendererSettings = rawRenderer ? JSON.parse(rawRenderer) : undefined;
  const payload: BackupPayload = {
    type: BACKUP_TYPE,
    appVersion: APP_VERSION,
    exportedAt: Date.now(),
    main,
    renderer: { settings: rendererSettings },
  };
  const res = await window.api.config.exportToFile(payload);
  if (!res.ok && res.reason === "writeFailed") {
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

  await window.api.config.replaceAll(picked.data.main);
  const settingsState = picked.data.renderer?.settings;
  if (settingsState !== undefined) {
    localStorage.setItem(SETTINGS_STORE_KEY, JSON.stringify(settingsState));
  }
  await window.api.system.relaunch();
};

/** 重置设置：恢复默认设置 */
const handleResetSettings = async (): Promise<void> => {
  const confirmed = await dialog.confirm({
    title: t("settings.resetSettings.confirmTitle"),
    content: t("settings.resetSettings.confirmDesc"),
    type: "warning",
  });
  if (!confirmed) return;
  const settingsStore = useSettingsStore();
  settingsStore.$reset();
  await window.api.config.reset();
  try {
    localStorage.removeItem(SETTINGS_STORE_KEY);
    localStorage.removeItem("system.uiZoom");
    document.documentElement.style.zoom = "100%";
  } catch {}
  await settingsStore.syncSystem();
  toast.success(t("settings.resetSettings.done"));
};

/** 清除全部数据：彻底清空本地浏览器保存的全部数据并重置 */
const handleResetAll = async (): Promise<void> => {
  const confirmed = await dialog.confirm({
    title: t("settings.resetAll.confirmTitle"),
    content: t("settings.resetAll.confirmDesc"),
    type: "error",
  });
  if (!confirmed) return;

  // 1. 清除后端平台 Session
  try {
    await Promise.allSettled([
      window.api.apis.clearSession("netease"),
      window.api.apis.clearSession("qqmusic"),
      window.api.apis.clearSession("kugou"),
    ]);
  } catch {}

  // 2. 清理浏览器所有 IndexedDB 数据库
  try {
    if (typeof indexedDB !== "undefined") {
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name) indexedDB.deleteDatabase(db.name);
        }
      }
      indexedDB.deleteDatabase("splayer");
      indexedDB.deleteDatabase("localforage");
    }
  } catch {}

  // 3. 清理所有常用 localforage 实例
  const stores = [
    "playlists",
    "queue",
    "library",
    "local_stats",
    "data-cache",
    "lyrics",
    "covers",
    "history",
    "user-cache",
  ];
  await Promise.allSettled(
    stores.map((name) =>
      localforage.createInstance({ name: "splayer", storeName: name }).clear(),
    ),
  );

  // 4. 清除 CacheStorage 缓存
  try {
    if (typeof caches !== "undefined" && caches.keys) {
      const keys = await caches.keys();
      for (const k of keys) {
        await caches.delete(k);
      }
    }
  } catch {}

  // 5. 清除浏览器 LocalStorage 和 SessionStorage
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {}

  // 5. 写入纯净默认配置（引导设为已完成）
  try {
    const defaultCfg = structuredClone(defaultSystemConfig);
    defaultCfg.system.onboardingCompleted = true;
    localStorage.setItem("splayer_web_config", JSON.stringify(defaultCfg));
  } catch {}

  toast.success(t("settings.resetAll.done"));
  setTimeout(() => {
    window.location.reload();
  }, 500);
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
        {{ t(`settings.${row.buttonKey}`) }}
      </SButton>
    </div>
  </div>
</template>
