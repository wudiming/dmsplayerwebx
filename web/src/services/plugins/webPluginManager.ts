import type {
  PluginInfo,
  PluginQuality,
  MusicUrlReq,
} from "@shared/types/plugin";

const STORAGE_KEY = "splayer_web_plugins_v1";

export const DEFAULT_NETEASE_ENHANCED_PLUGIN: PluginInfo = {
  manifest: {
    id: "npi.netease.source",
    name: "网易云·增强版",
    version: "1.0.0",
    description: "基于 NeteaseCloudMusicApi Enhanced 自建服务的音源插件，支持播放地址解析（含解灰）、歌词、封面、评论兜底",
    author: "you",
    homepage: "https://npi.881128.xyz",
    type: "source",
    grant: ["network"],
    apiLevel: 3,
    hash: "npi-netease-100-hash",
    installedAt: Date.now(),
    fileName: "npi.netease.source.js",
    changelog: "初始化增强版音源服务",
  },
  enabled: true,
  status: {
    state: "ready",
    sources: {
      wy: {
        name: "网易云·增强版",
        actions: ["musicUrl", "musicSearch", "musicLyric", "musicPic", "musicComment"],
        qualities: ["hi-res", "lossless", "hq", "sq", "lq"],
      },
    },
    settings: [],
  },
  settingsValues: {},
};

type StatusListener = (info: PluginInfo) => void;

class WebPluginManager {
  private plugins: PluginInfo[] = [];
  private statusListeners: Set<StatusListener> = new Set();

  constructor() {
    this.loadFromStorage();
    void this.syncServerConfig();
  }

  public async syncServerConfig(): Promise<void> {
    try {
      const res = await fetch("/api/plugins/config");
      if (res.ok) {
        const data = await res.json();
        const npi = this.plugins.find((p) => p.manifest.id === DEFAULT_NETEASE_ENHANCED_PLUGIN.manifest.id);
        if (data?.neteaseEnhanced && npi) {
          const { enabled, baseUrl } = data.neteaseEnhanced;
          npi.enabled = Boolean(enabled);
          if (!enabled) {
            npi.status = { state: "disabled" };
          } else {
            npi.status = { ...DEFAULT_NETEASE_ENHANCED_PLUGIN.status, state: "ready" };
            if (baseUrl) {
              npi.manifest.homepage = baseUrl;
            }
          }
          this.saveToStorage();
          this.emitStatus(npi);
        }
      }
    } catch {}
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.plugins = JSON.parse(data);
      }
    } catch {
      this.plugins = [];
    }

    // 清理旧版 ChKSz 插件
    this.plugins = this.plugins.filter((p) => p.manifest?.id !== "chksz.splayer-source");

    // 确保默认包含网易云增强版插件并处于启用状态
    const npi = this.plugins.find((p) => p.manifest.id === DEFAULT_NETEASE_ENHANCED_PLUGIN.manifest.id);
    if (!npi) {
      this.plugins.unshift(JSON.parse(JSON.stringify(DEFAULT_NETEASE_ENHANCED_PLUGIN)));
      this.saveToStorage();
    } else {
      npi.enabled = true;
      if (!npi.status || npi.status.state === "unloaded" || npi.status.state === "disabled") {
        npi.status = DEFAULT_NETEASE_ENHANCED_PLUGIN.status;
      }
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.plugins));
    } catch {
      // 忽略异常
    }
  }

  private emitStatus(info: PluginInfo) {
    this.saveToStorage();
    for (const fn of this.statusListeners) {
      try {
        fn(info);
      } catch (err) {
        console.error("[WebPluginManager] listener error", err);
      }
    }
  }

  public onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  public async list(): Promise<PluginInfo[]> {
    return [...this.plugins];
  }

  public async setEnabled(id: string, enabled: boolean): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.id === id);
    if (!plugin) return;
    plugin.enabled = enabled;
    if (enabled && plugin.status.state === "disabled") {
      plugin.status = { ...DEFAULT_NETEASE_ENHANCED_PLUGIN.status, state: "ready" };
    } else if (!enabled) {
      plugin.status = { state: "disabled" };
    }
    this.emitStatus(plugin);
  }

  public async setSetting(id: string, key: string, value: unknown): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.id === id);
    if (!plugin) return;
    if (!plugin.settingsValues) plugin.settingsValues = {};
    plugin.settingsValues[key] = value;
    this.emitStatus(plugin);
  }

  public async checkUpdate(
    id: string,
  ): Promise<{ ok: boolean; hasUpdate: boolean; plugin?: PluginInfo; error?: string }> {
    const plugin = this.plugins.find((p) => p.manifest.id === id);
    if (!plugin) return { ok: false, hasUpdate: false, error: "插件未找到" };
    return { ok: true, hasUpdate: false, plugin };
  }

  public async applyUpdate(
    id: string,
  ): Promise<{ ok: boolean; plugin?: PluginInfo; error?: string }> {
    const plugin = this.plugins.find((p) => p.manifest.id === id);
    if (!plugin) return { ok: false, error: "插件未找到" };
    return { ok: true, plugin };
  }

  /** 经网易云增强版插件解析在线音频源 */
  public async resolveUrl(params: {
    pluginId: string;
    source: string;
    quality: PluginQuality;
    musicInfo: any;
  }): Promise<{ ok: boolean; url?: string; error?: string }> {
    const plugin = this.plugins.find((p) => p.manifest.id === params.pluginId);
    if (plugin && !plugin.enabled) {
      return { ok: false, error: "插件未启用" };
    }

    try {
      const res = await fetch("/api/plugins/resolveUrl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.url) return { ok: true, url: data.url };
        if (data?.error && !data.ok) return { ok: false, error: data.error };
      }
    } catch (err: any) {
      console.warn("[WebPluginManager] resolveUrl fetch failed:", err);
    }

    // 兜底直接请求增强版接口 (仅当插件启用时)
    if (!plugin?.enabled) {
      return { ok: false, error: "网易云增强版音源插件未启用" };
    }

    try {
      const songId = String(params.musicInfo.id || params.musicInfo.songmid || params.musicInfo.songId || "").trim();
      if (!songId) return { ok: false, error: "缺少歌曲 ID" };
      const baseUrl = plugin?.manifest?.homepage || "https://npi.881128.xyz";
      const directRes = await fetch(`${baseUrl}/song/url/match?id=${songId}`);
      if (directRes.ok) {
        const directData = await directRes.json();
        if (typeof directData.data === "string" && directData.data) {
          const directUrl = directData.data.startsWith("http://")
            ? "https://" + directData.data.slice(7)
            : directData.data;
          return { ok: true, url: directUrl };
        }
      }
    } catch {}

    return { ok: false, error: "网易云增强版音源解析失败" };
  }

  public async uninstall(id: string): Promise<{ ok: boolean }> {
    this.plugins = this.plugins.filter((p) => p.manifest.id !== id);
    this.saveToStorage();
    return { ok: true };
  }
}

export const webPluginManager = new WebPluginManager();
