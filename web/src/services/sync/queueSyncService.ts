/**
 * 网易云账户跨设备播放列表同步服务
 *
 * 机制：
 * 1. 登录网易云账户后，在用户账号下维护一个专用的私密歌单「SPlayer 实时播放列表」
 * 2. 换设备登录同一个网易云账户时，自动从云端私密歌单恢复播放列表及播放进度
 * 3. 本地播放列表发生增删变动时，防抖（Debounce）自动将最新播放列表同步到网易云端
 * 4. 页面切回活跃（visibilitychange）或定时（60s）时检测云端更新，实现多设备间实时同步
 */

import { watch } from "vue";
import { useUserStore } from "@/stores/user";
import { useStatusStore } from "@/stores/status";
import * as queue from "@/stores/queue";
import { netease as neteaseApi } from "@/apis/netease";
import {
  createPlaylist,
  updatePlaylistDesc,
  addToPlaylist,
  removeFromPlaylist,
  fetchPlaylist,
} from "@/apis/playlist/netease";
import { songsByIds } from "@/apis/song/netease";
import { toast } from "@/composables/useToast";
import type { Track } from "@shared/types/player";

const SYNC_PLAYLIST_NAME = "SPlayer 实时播放列表";
const STORAGE_KEY_SYNC_META = "splayer_queue_sync_meta";
const DEBOUNCE_PUSH_DELAY = 4000;
const POLL_INTERVAL = 60000;

interface SyncMetadata {
  updatedAt: number;
  playIndex?: number;
  count?: number;
  client?: string;
  songIds?: string[];
}

let syncPlaylistId: string | null = null;
let lastLocalUpdatedAt = 0;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let isApplyingCloud = false;
let initialized = false;

/** 读取本地同步元数据 */
const getLocalSyncMeta = (): SyncMetadata | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYNC_META);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** 保存本地同步元数据 */
const saveLocalSyncMeta = (meta: SyncMetadata): void => {
  try {
    localStorage.setItem(STORAGE_KEY_SYNC_META, JSON.stringify(meta));
  } catch {}
};

/** 解析歌单描述中的元数据 */
const parseDescMetadata = (desc?: string): SyncMetadata | null => {
  if (!desc) return null;
  try {
    const trimmed = desc.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return JSON.parse(trimmed);
    }
  } catch {}
  return null;
};

/** 获取或创建专用的私密同步歌单 */
export const getOrCreateSyncPlaylist = async (): Promise<string | null> => {
  const userStore = useUserStore();
  if (!userStore.isLoggedIn || !userStore.userId) return null;
  if (syncPlaylistId) return syncPlaylistId;

  try {
    // 1. 查询用户自建歌单
    await userStore.initPlaylists();
    const existing = userStore.createdPlaylists.find(
      (p) => p.name === SYNC_PLAYLIST_NAME,
    );
    if (existing?.id) {
      syncPlaylistId = String(existing.id);
      return syncPlaylistId;
    }

    // 2. 若不存在则创建私密歌单 (privacy: 10)
    const newPlaylist = await createPlaylist(SYNC_PLAYLIST_NAME, 10);
    if (newPlaylist?.id) {
      syncPlaylistId = String(newPlaylist.id);
      // 刷新用户歌单缓存
      void userStore.initPlaylists(true);
      return syncPlaylistId;
    }
  } catch (err) {
    console.warn("[QueueSync] 获取或创建同步歌单失败:", err);
  }
  return null;
};

/**
 * 从网易云云端拉取并恢复播放列表
 * @param force 是否强制覆盖本地播放列表
 */
export const pullQueueFromCloud = async (force = false): Promise<boolean> => {
  const userStore = useUserStore();
  if (!userStore.isLoggedIn) return false;

  const playlistId = await getOrCreateSyncPlaylist();
  if (!playlistId) return false;

  try {
    // 获取歌单详情
    const body = await neteaseApi.playlist_detail({ id: playlistId });
    const rawPl = body?.playlist;
    if (!rawPl) return false;

    const cloudMeta = parseDescMetadata(rawPl.description);
    const cloudUpdatedAt = cloudMeta?.updatedAt ?? (rawPl.updateTime || 0);

    const localMeta = getLocalSyncMeta();
    const localUpdatedAt = localMeta?.updatedAt ?? lastLocalUpdatedAt;

    // 如果非强制模式，且本地有列表，且云端更新时间并不比本地新，则无需拉取
    if (!force && queue.queue.value.length > 0 && cloudUpdatedAt <= localUpdatedAt) {
      return false;
    }

    // 拉取云端曲目列表
    const tracks: Track[] = [];
    await fetchPlaylist(playlistId, {
      onBatch: (batch) => {
        tracks.push(...batch);
      },
    });

    if (tracks.length === 0 && (!cloudMeta?.songIds || cloudMeta.songIds.length === 0)) {
      return false;
    }

    // 若通过 fetchPlaylist 获取不全但元数据中有 songIds，兜底获取
    let finalTracks = tracks;
    if (finalTracks.length === 0 && cloudMeta?.songIds?.length) {
      finalTracks = await songsByIds(cloudMeta.songIds);
    }

    if (finalTracks.length === 0) return false;

    isApplyingCloud = true;
    try {
      queue.setQueue(finalTracks);
      // 恢复当前播放曲目索引
      if (typeof cloudMeta?.playIndex === "number" && cloudMeta.playIndex >= 0 && cloudMeta.playIndex < finalTracks.length) {
        useStatusStore().playIndex = cloudMeta.playIndex;
      }
      lastLocalUpdatedAt = cloudUpdatedAt;
      saveLocalSyncMeta({
        updatedAt: cloudUpdatedAt,
        playIndex: cloudMeta?.playIndex,
        count: finalTracks.length,
        songIds: finalTracks.map((t) => String(t.id)),
      });
      toast.success(`已恢复网易云同步播放列表（${finalTracks.length}首）`);
      return true;
    } finally {
      setTimeout(() => {
        isApplyingCloud = false;
      }, 500);
    }
  } catch (err) {
    console.warn("[QueueSync] 从云端拉取播放列表失败:", err);
    return false;
  }
};

/**
 * 将当前播放列表推送到网易云端同步歌单
 */
export const pushQueueToCloud = async (): Promise<boolean> => {
  const userStore = useUserStore();
  if (!userStore.isLoggedIn) return false;
  if (isApplyingCloud) return false;

  const currentTracks = queue.queue.value;
  // 提取网易云或具备有效数字 ID 的曲目（最多取前 300 首，保持同步高效）
  const neteaseSongIds = currentTracks
    .map((t) => String(t.id).trim())
    .filter((id) => /^\d+$/.test(id))
    .slice(0, 300);

  const playlistId = await getOrCreateSyncPlaylist();
  if (!playlistId) return false;

  try {
    const status = useStatusStore();
    const now = Date.now();
    const meta: SyncMetadata = {
      updatedAt: now,
      playIndex: status.playIndex >= 0 ? status.playIndex : 0,
      count: neteaseSongIds.length,
      client: "SPlayer-Web",
      songIds: neteaseSongIds,
    };

    // 1. 获取歌单当前已有的曲目
    const body = await neteaseApi.playlist_detail({ id: playlistId });
    const existingIds: string[] = (body?.playlist?.trackIds ?? [])
      .map((item: { id: number }) => String(item.id))
      .filter(Boolean);

    // 2. 清理需要移除的旧曲目
    const toRemove = existingIds.filter((id) => !neteaseSongIds.includes(id));
    if (toRemove.length > 0) {
      await removeFromPlaylist(playlistId, toRemove).catch(() => {});
    }

    // 3. 追加需要新增的曲目
    const toAdd = neteaseSongIds.filter((id) => !existingIds.includes(id));
    if (toAdd.length > 0) {
      await addToPlaylist(playlistId, toAdd).catch(() => {});
    }

    // 4. 将最新元数据更新至歌单描述
    await updatePlaylistDesc(playlistId, JSON.stringify(meta)).catch(() => {});

    lastLocalUpdatedAt = now;
    saveLocalSyncMeta(meta);
    return true;
  } catch (err) {
    console.warn("[QueueSync] 推送播放列表到云端失败:", err);
    return false;
  }
};

/** 防抖推送调度 */
export const schedulePushQueue = (): void => {
  const userStore = useUserStore();
  if (!userStore.isLoggedIn || isApplyingCloud) return;

  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void pushQueueToCloud();
  }, DEBOUNCE_PUSH_DELAY);
};

/** 检查云端是否有更新（多设备实时同步） */
export const checkCloudUpdate = async (): Promise<void> => {
  const userStore = useUserStore();
  if (!userStore.isLoggedIn || isApplyingCloud) return;

  const playlistId = await getOrCreateSyncPlaylist();
  if (!playlistId) return;

  try {
    const body = await neteaseApi.playlist_detail({ id: playlistId });
    const rawPl = body?.playlist;
    if (!rawPl) return;

    const cloudMeta = parseDescMetadata(rawPl.description);
    const cloudUpdatedAt = cloudMeta?.updatedAt ?? (rawPl.updateTime || 0);

    const localMeta = getLocalSyncMeta();
    const localUpdatedAt = localMeta?.updatedAt ?? lastLocalUpdatedAt;

    // 云端存在更新的时间戳，拉取更新
    if (cloudUpdatedAt > localUpdatedAt + 1000) {
      await pullQueueFromCloud(true);
    }
  } catch (err) {
    console.debug("[QueueSync] checkCloudUpdate check failed:", err);
  }
};

/**
 * 初始化播放列表跨设备同步服务
 */
export const initQueueSync = (): void => {
  if (initialized) return;
  initialized = true;

  const userStore = useUserStore();

  // 1. 监听网易云登录状态
  watch(
    () => userStore.isLoggedIn,
    async (loggedIn) => {
      if (loggedIn) {
        syncPlaylistId = null;
        // 登录时：如果本地播放列表为空，或者云端比本地新，自动拉取恢复
        const pulled = await pullQueueFromCloud(false);
        // 如果本地已有列表且云端未拉取，则同步当前列表到云端
        if (!pulled && queue.queue.value.length > 0) {
          schedulePushQueue();
        }
      } else {
        syncPlaylistId = null;
      }
    },
    { immediate: true },
  );

  // 2. 监听本地队列变动，防抖自动同步
  watch(
    () => queue.queueEntries.value,
    () => {
      if (isApplyingCloud) return;
      schedulePushQueue();
    },
    { deep: false },
  );

  // 3. 监听浏览器标签页切换激活（用户换设备或从其他窗口切回）
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void checkCloudUpdate();
      }
    });
  }

  // 4. 定时轮询多端同步（每隔 60 秒）
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      void checkCloudUpdate();
    }
  }, POLL_INTERVAL);
};
