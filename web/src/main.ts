import "./web-bridge";
import "virtual:uno.css";
import "@/styles/global.css";

import piniaPersistedstate from "pinia-plugin-persistedstate";
import App from "./App.vue";
import router from "./router";
import i18n from "./i18n";

import { useThemeStore } from "./stores/theme";
import { useSettingsStore } from "./stores/settings";
import { useMediaStore } from "./stores/media";
import { useHotkeyStore } from "./stores/hotkey";
import { initPlayer, playFiles, restoreLastTrack } from "./core/player";
import { handleOrpheus } from "./services/orpheus";
import { installHotkeyManager } from "./core/hotkey/manager";
import { vRipple } from "./directives/ripple";

import { useUserStore } from "./stores/user";

const pinia = createPinia();
pinia.use(piniaPersistedstate);

const app = createApp(App);
app.directive("ripple", vRipple);
app.use(pinia);
app.use(router);
app.use(i18n);

if (typeof window !== "undefined") {
  (window as any).pinia = pinia;
  (window as any).useUserStore = useUserStore;
}

// 初始化主题
useThemeStore().init();

// 立即从浏览器持久存储同步系统级配置（下载开关、流媒体开关等）
void useSettingsStore().syncSystem();

// 同步语言设置
watch(
  () => useSettingsStore().locale,
  (v) => {
    i18n.global.locale.value = v;
    window.api.system.setLocale(v);
  },
  { immediate: true },
);

import { prefetchDiscoverData } from "./services/discoverCache";
import { useLibraryStore } from "./stores/library";

/**
 * 启动页时间线精确控制：
 * 1. 文字动画绘制：1.8s (1800ms) - W, E, B, X 错峰入场，尾字符珊瑚粉高亮
 * 2. 绘制完成后完全静止停顿：0.5s (500ms) - 保证文字完整可见，静止停顿
 * -> 启动页内容在屏幕上保持完全不透明展示 2.3s (2300ms)
 * 3. 平滑淡出进入主界面：0.8s (800ms) - 优雅淡出过渡至主界面
 * -> 整体总时长：整整 3.1s (3100ms)
 */
const SPLASH_HOLD_MS = 2300;
const SPLASH_FADE_MS = 800;

let splashRemovalScheduled = false;

/**
 * 严格执行启动页时序控制：
 * 保证：文字动画 1.8s + 停顿 0.5s = 2.3s 之后才开始淡出，淡出时长 0.8s，总计 3.1s。
 */
const safeRemoveSplash = (): void => {
  if (splashRemovalScheduled) return;
  splashRemovalScheduled = true;

  const now = performance.now();
  const splashStart = (window as unknown as { __splashStart?: number }).__splashStart ?? now;
  const elapsed = now - splashStart;
  const remainingHold = Math.max(0, SPLASH_HOLD_MS - elapsed);

  setTimeout(() => {
    const el = document.getElementById("app-loading");
    if (!el) return;
    el.classList.add("hidden");
    setTimeout(() => {
      el.remove();
    }, SPLASH_FADE_MS + 50);
  }, remainingHold);
};

// 全局兜底保护（强制启动移除流程，避免任何未知挂起）
setTimeout(safeRemoveSplash, SPLASH_HOLD_MS);

// 在起始页动画期间，后台静默并行预加载核心数据（首页、音乐库/歌单、艺术家、排行榜、最新音乐、本地曲库）
setTimeout(() => {
  void prefetchDiscoverData();
  void useLibraryStore().loadLibrary().catch(() => {});
}, 100);

/**
 * 启动播放服务并分发冷启动任务
 */
const bootstrapPlayback = async (): Promise<void> => {
  await initPlayer();

  const pendingAudioFiles = await window.api.system.consumePendingAudioFiles();
  const pendingOrpheusUrl = await window.api.system.consumePendingProtocolUrl();

  if (pendingAudioFiles && pendingAudioFiles.length > 0) {
    await playFiles(pendingAudioFiles);
  } else if (pendingOrpheusUrl) {
    await handleOrpheus(pendingOrpheusUrl);
  } else {
    await restoreLastTrack();
  }
};

// 初始化程序
router
  .isReady()
  .then(async () => {
    // 挂载应用至后台
    try {
      app.mount("#app");
    } catch (mountErr) {
      console.error("[app.mount error]", mountErr);
    }

    // 启动播放服务
    void bootstrapPlayback().catch(console.error);

    // 计划启动页平滑退出
    safeRemoveSplash();

    // 初始化快捷键
    useHotkeyStore()
      .init()
      .then(installHotkeyManager)
      .catch((err) => console.error("[hotkey] init failed", err));
  })
  .catch((err) => {
    console.error("[router] ready failed:", err);
    safeRemoveSplash();
  });
