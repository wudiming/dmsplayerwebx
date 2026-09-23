import { netease } from "@/apis/netease";
import type { CoverItem } from "@/types/artist";
import { withPicSize } from "@/utils/format/netease";

export interface PlaylistCatItem {
  name: string;
  category: number;
  hot?: boolean;
}

export interface PlaylistCatData {
  categories: Record<number, string>;
  sub: PlaylistCatItem[];
}

export interface ToplistOfficialTrack {
  first: string;
  second: string;
}

export interface ToplistItem {
  id: string;
  name: string;
  cover: string;
  updateFrequency?: string;
  toplistType?: string;
  tracks?: ToplistOfficialTrack[];
  playCount?: number;
}

/**
 * 获取歌单分类
 */
export const fetchPlaylistCats = async (): Promise<PlaylistCatData> => {
  try {
    const res = await netease.playlist_catlist();
    if (res && res.categories && Array.isArray(res.sub)) {
      return {
        categories: res.categories,
        sub: res.sub.map((s: any) => ({
          name: s.name,
          category: s.category,
          hot: !!s.hot,
        })),
      };
    }
  } catch (err) {
    console.warn("[discover/netease] fetchPlaylistCats error:", err);
  }
  return {
    categories: { 0: "语种", 1: "风格", 2: "场景", 3: "情感", 4: "主题" },
    sub: [
      { name: "华语", category: 0, hot: true },
      { name: "欧美", category: 0, hot: true },
      { name: "日语", category: 0 },
      { name: "韩语", category: 0 },
      { name: "粤语", category: 0, hot: true },
      { name: "流行", category: 1, hot: true },
      { name: "摇滚", category: 1, hot: true },
      { name: "民谣", category: 1, hot: true },
      { name: "电子", category: 1, hot: true },
      { name: "爵士", category: 1 },
      { name: "说唱", category: 1, hot: true },
      { name: "古风", category: 1, hot: true },
      { name: "ACG", category: 1, hot: true },
      { name: "清晨", category: 2 },
      { name: "夜晚", category: 2, hot: true },
      { name: "学习", category: 2 },
      { name: "工作", category: 2, hot: true },
      { name: "午休", category: 2 },
      { name: "运动", category: 2, hot: true },
      { name: "旅行", category: 2 },
      { name: "怀旧", category: 3, hot: true },
      { name: "清新", category: 3 },
      { name: "浪漫", category: 3, hot: true },
      { name: "伤感", category: 3, hot: true },
      { name: "治愈", category: 3, hot: true },
      { name: "放松", category: 3, hot: true },
      { name: "经典", category: 4, hot: true },
      { name: "翻唱", category: 4, hot: true },
      { name: "影视原声", category: 4, hot: true },
      { name: "榜单", category: 4, hot: true },
    ],
  };
};

/**
 * 获取歌单广场列表
 */
export const fetchTopPlaylists = async (params: {
  cat?: string;
  limit?: number;
  offset?: number;
  hq?: boolean;
}): Promise<{ items: CoverItem[]; total: number; more: boolean }> => {
  const { cat = "全部", limit = 40, offset = 0, hq = false } = params;
  try {
    const apiName = hq ? "top_playlist_highquality" : "top_playlist";
    const res = await netease[apiName]({
      cat: cat === "全部歌单" ? "全部" : cat,
      limit,
      offset,
    });
    const playlists = res?.playlists ?? res?.result ?? [];
    const items: CoverItem[] = playlists.map((pl: any) => ({
      id: String(pl.id),
      title: pl.name,
      cover: withPicSize(pl.coverImgUrl || pl.picUrl),
      subtitle: pl.copywriter || (pl.creator?.nickname ? `by ${pl.creator.nickname}` : undefined),
      trackCount: pl.trackCount || 0,
    }));
    return {
      items,
      total: res?.total ?? items.length,
      more: res?.more ?? (res?.total ? res.total > offset + limit : false),
    };
  } catch (err) {
    console.warn("[discover/netease] fetchTopPlaylists error:", err);
    return { items: [], total: 0, more: false };
  }
};

/**
 * 获取排行榜数据
 */
export const fetchToplists = async (): Promise<{
  official: ToplistItem[];
  selected: CoverItem[];
}> => {
  try {
    const res = await netease.toplist_detail();
    const rawList = res?.list ?? [];
    const official: ToplistItem[] = [];
    const selected: CoverItem[] = [];

    for (const item of rawList) {
      const cover = withPicSize(item.coverImgUrl || item.picUrl) || "/images/album.jpg";
      if (item.ToplistType !== undefined || (item.tracks && item.tracks.length > 0)) {
        official.push({
          id: String(item.id),
          name: item.name,
          cover,
          updateFrequency: item.updateFrequency,
          toplistType: item.ToplistType,
          tracks: (item.tracks ?? []).slice(0, 3).map((t: any) => ({
            first: t.first || t.name,
            second: t.second || t.ar?.[0]?.name || t.artists?.[0]?.name || "",
          })),
          playCount: item.playCount,
        });
      } else {
        selected.push({
          id: String(item.id),
          title: item.name,
          cover,
          subtitle: item.updateFrequency || "每周更新",
          trackCount: item.trackCount || 0,
        });
      }
    }
    return { official, selected };
  } catch (err) {
    console.warn("[discover/netease] fetchToplists error:", err);
    return { official: [], selected: [] };
  }
};

/**
 * 获取歌手分类列表
 */
export const fetchArtistList = async (params: {
  type?: number;
  area?: number;
  initial?: number | string;
  offset?: number;
  limit?: number;
}): Promise<{ items: CoverItem[]; more: boolean }> => {
  const { type = -1, area = -1, initial = -1, offset = 0, limit = 40 } = params;
  try {
    const res = await netease.artist_list({
      type,
      area,
      initial,
      offset,
      limit,
    });
    const artists = res?.artists ?? [];
    const items: CoverItem[] = artists.map((ar: any) => {
      const alias = ar.alias?.[0] || ar.trans || "";
      const title = alias && alias !== ar.name ? `${ar.name} (${alias})` : ar.name;
      return {
        id: String(ar.id),
        title,
        cover: withPicSize(ar.picUrl || ar.img1v1Url),
        subtitle: ar.musicSize ? `${ar.musicSize} 首单曲` : undefined,
        trackCount: ar.musicSize || ar.albumSize || 0,
      };
    });
    return {
      items,
      more: res?.more ?? false,
    };
  } catch (err) {
    console.warn("[discover/netease] fetchArtistList error:", err);
    return { items: [], more: false };
  }
};

export interface PlaylistCategoryGroup {
  id: number;
  name: string;
  sub: Array<{
    name: string;
    category: number;
    hot: boolean;
  }>;
}

/**
 * 获取歌单分类标签
 */
export const fetchPlaylistCatlist = async (): Promise<{
  all: { name: string };
  categories: Record<string, string>;
  sub: Array<{ name: string; category: number; hot: boolean }>;
  groups: PlaylistCategoryGroup[];
}> => {
  try {
    const res = await netease.playlist_catlist();
    const categories: Record<string, string> = res?.categories ?? {};
    const sub: Array<{ name: string; category: number; hot: boolean }> = res?.sub ?? [];
    const groups: PlaylistCategoryGroup[] = Object.entries(categories).map(([k, name]) => {
      const catId = Number(k);
      return {
        id: catId,
        name,
        sub: sub.filter((s) => s.category === catId),
      };
    });
    return {
      all: res?.all ?? { name: "全部" },
      categories,
      sub,
      groups,
    };
  } catch (err) {
    console.warn("[discover/netease] fetchPlaylistCatlist error:", err);
    return { all: { name: "全部" }, categories: {}, sub: [], groups: [] };
  }
};

/**
 * 获取新碟上架
 */
export const fetchNewAlbums = async (params: {
  area?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: CoverItem[]; total: number; more: boolean }> => {
  const { area = "ALL", limit = 40, offset = 0 } = params;
  try {
    const res = await netease.album_new({ area, limit, offset });
    const albums = res?.albums ?? [];
    const items: CoverItem[] = albums.map((al: any) => ({
      id: String(al.id),
      title: al.name,
      cover: withPicSize(al.picUrl),
      subtitle: al.artists?.map((a: any) => a.name).join(" / ") || al.artist?.name,
      trackCount: al.size || 0,
    }));
    return {
      items,
      total: res?.total ?? items.length,
      more: res?.total ? res.total > offset + limit : false,
    };
  } catch (err) {
    console.warn("[discover/netease] fetchNewAlbums error:", err);
    return { items: [], total: 0, more: false };
  }
};

/**
 * 获取新歌速递
 */
export const fetchNewSongs = async (type: number = 0): Promise<any[]> => {
  try {
    const res = await netease.top_song({ type });
    return res?.data ?? [];
  } catch (err) {
    console.warn("[discover/netease] fetchNewSongs error:", err);
    return [];
  }
};
