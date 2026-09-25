import type { CoverItem } from "@/types/artist";
import type { Track } from "@shared/types/player";
import {
  fetchTopPlaylists,
  fetchPlaylistCatlist,
  fetchArtistList,
  fetchToplists,
  fetchNewAlbums,
  fetchNewSongs,
  type PlaylistCategoryGroup,
  type ToplistItem,
} from "@/apis/discover/netease";
import { prefetchHomeDiscover } from "@/composables/home/useHomeDiscover";
import { songsToTracks } from "@/utils/format/netease";

/** 发现页缓存有效期：15 分钟 */
const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry<T> {
  at: number;
  data: T;
}

export interface PlaylistCacheData {
  categoryGroups: PlaylistCategoryGroup[];
  items: CoverItem[];
  more: boolean;
}

export interface ArtistCacheData {
  items: CoverItem[];
  more: boolean;
}

export interface ToplistCacheData {
  official: ToplistItem[];
  selected: CoverItem[];
}

export interface NewAlbumCacheData {
  items: CoverItem[];
  more: boolean;
}

let playlistCache: CacheEntry<PlaylistCacheData> | null = null;
let artistCache: CacheEntry<ArtistCacheData> | null = null;
let toplistCache: CacheEntry<ToplistCacheData> | null = null;
let newAlbumCache: CacheEntry<NewAlbumCacheData> | null = null;
let newSongCache: CacheEntry<Track[]> | null = null;

const isValid = <T>(entry: CacheEntry<T> | null): boolean => {
  return entry !== null && Date.now() - entry.at < CACHE_TTL_MS;
};

// ─── 缓存读取与写入接口 ───

export const getPlaylistCache = (): PlaylistCacheData | null => {
  return isValid(playlistCache) ? playlistCache!.data : null;
};

export const setPlaylistCache = (data: PlaylistCacheData): void => {
  playlistCache = { at: Date.now(), data };
};

export const getArtistCache = (): ArtistCacheData | null => {
  return isValid(artistCache) ? artistCache!.data : null;
};

export const setArtistCache = (data: ArtistCacheData): void => {
  artistCache = { at: Date.now(), data };
};

export const getToplistCache = (): ToplistCacheData | null => {
  return isValid(toplistCache) ? toplistCache!.data : null;
};

export const setToplistCache = (data: ToplistCacheData): void => {
  toplistCache = { at: Date.now(), data };
};

export const getNewAlbumCache = (): NewAlbumCacheData | null => {
  return isValid(newAlbumCache) ? newAlbumCache!.data : null;
};

export const setNewAlbumCache = (data: NewAlbumCacheData): void => {
  newAlbumCache = { at: Date.now(), data };
};

export const getNewSongCache = (): Track[] | null => {
  return isValid(newSongCache) ? newSongCache!.data : null;
};

export const setNewSongCache = (data: Track[]): void => {
  newSongCache = { at: Date.now(), data };
};

/** 是否正在预拉取 */
let isPrefetching = false;

/**
 * 在起始页动画期间后台静默并行预加载核心页面数据：
 * 1. 首页推荐（Home Discover）
 * 2. 歌单广场（Playlists）
 * 3. 艺术家列表（Artists）
 * 4. 音乐排行榜（Toplists）
 * 5. 最新音乐与新碟（New Albums & Songs）
 */
export const prefetchDiscoverData = async (): Promise<void> => {
  if (isPrefetching) return;
  isPrefetching = true;

  try {
    await Promise.allSettled([
      // 1. 首页推荐数据（填充 useHomeDiscover 模块缓存）
      (async () => {
        try {
          await prefetchHomeDiscover();
        } catch (e) {
          console.warn("[prefetch] home discover failed:", e);
        }
      })(),

      // 2. 歌单分类与推荐歌单首屏
      (async () => {
        try {
          const [catRes, listRes] = await Promise.all([
            fetchPlaylistCatlist(),
            fetchTopPlaylists({ cat: "全部", limit: 36, offset: 0, hq: false }),
          ]);
          setPlaylistCache({
            categoryGroups: catRes.groups ?? [],
            items: listRes.items ?? [],
            more: listRes.more,
          });
        } catch (e) {
          console.warn("[prefetch] playlists failed:", e);
        }
      })(),

      // 3. 热门艺术家首屏
      (async () => {
        try {
          const res = await fetchArtistList({
            type: -1,
            area: -1,
            initial: -1,
            offset: 0,
            limit: 40,
          });
          setArtistCache({
            items: res.items ?? [],
            more: res.more,
          });
        } catch (e) {
          console.warn("[prefetch] artists failed:", e);
        }
      })(),

      // 4. 排行榜数据
      (async () => {
        try {
          const res = await fetchToplists();
          setToplistCache({
            official: res.official ?? [],
            selected: res.selected ?? [],
          });
        } catch (e) {
          console.warn("[prefetch] toplists failed:", e);
        }
      })(),

      // 5. 新碟上架首屏与新歌速递
      (async () => {
        try {
          const [albumRes, rawSongs] = await Promise.all([
            fetchNewAlbums({ area: "ALL", limit: 40, offset: 0 }),
            fetchNewSongs(0),
          ]);
          setNewAlbumCache({
            items: albumRes.items ?? [],
            more: albumRes.more,
          });
          setNewSongCache(songsToTracks(rawSongs));
        } catch (e) {
          console.warn("[prefetch] new albums/songs failed:", e);
        }
      })(),
    ]);
  } finally {
    isPrefetching = false;
  }
};
