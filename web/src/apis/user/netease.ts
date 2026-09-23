import type { Album, Artist, Playlist } from "@shared/types/player";
import type { UserRadio, UserSubcount, UserVideo } from "@/types/user";
import { netease as neteaseApi } from "@/apis/netease";
import { ensureOk, toAlbum, toArtist, toPlaylist, toSubcount } from "@/utils/format/netease";

const PAGE_SIZE = 50;

/**
 * 通用分页直到拉完
 * @param fetcher 第 N 页拉取函数（offset/limit），返回 `{ data, hasMore }`
 * @param extract 单项 raw → Item
 */
const fetchAllPages = async <Item>(
  fetcher: (offset: number, limit: number) => Promise<{ data?: any[]; hasMore?: boolean }>,
  extract: (raw: any) => Item,
): Promise<Item[]> => {
  const all: Item[] = [];
  let offset = 0;
  while (true) {
    const resp = await fetcher(offset, PAGE_SIZE);
    const list = resp.data ?? [];
    all.push(...list.map(extract));
    if (!resp.hasMore || list.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
};

/** 用户全部歌单 */
export const fetchUserPlaylists = async (uid: number, total?: number): Promise<Playlist[]> => {
  const body = await neteaseApi.user_playlist({
    uid,
    limit: total && total > 0 ? total : 1000,
    offset: 0,
  });
  return (body?.playlist ?? []).map(toPlaylist);
};

/** 用户订阅计数 */
export const fetchSubcount = async (): Promise<UserSubcount> => {
  const body = await neteaseApi.user_subcount();
  return toSubcount(body ?? {});
};

/** 用户喜欢歌曲 id 列表 */
export const fetchLikelist = async (uid: number): Promise<string[]> => {
  const body = await neteaseApi.likelist({ uid });
  return ((body?.ids as number[]) ?? []).map(String);
};

/** 用户收藏专辑 */
export const fetchUserAlbums = (): Promise<Album[]> =>
  fetchAllPages(async (offset, limit) => {
    const body = await neteaseApi.album_sublist({ limit, offset });
    return { data: body?.data, hasMore: body?.hasMore };
  }, toAlbum);

/** 用户收藏歌手 */
export const fetchUserArtists = (): Promise<Artist[]> =>
  fetchAllPages(async (offset, limit) => {
    const body = await neteaseApi.artist_sublist({ limit, offset });
    return { data: body?.data, hasMore: body?.hasMore };
  }, toArtist);

/** 用户收藏视频/MV */
export const fetchUserVideos = (): Promise<UserVideo[]> =>
  fetchAllPages(
    async (offset, limit) => {
      const body = await neteaseApi.mv_sublist({ limit, offset });
      return { data: body?.data, hasMore: body?.hasMore };
    },
    (item: any): UserVideo => ({
      id: String(item.id || item.vid),
      name: item.name || item.title || "未知视频",
      cover: item.cover || item.coverUrl || "/images/album.jpg",
      artistName: Array.isArray(item.artists)
        ? item.artists.map((a: any) => a.name).join(" / ")
        : item.artistName || item.creator?.[0]?.userName || "未知歌手",
      artistId: String(item.artistId || item.creator?.[0]?.userId || ""),
      playCount: item.playTime || item.playCount || 0,
      duration: item.durationms || item.duration || 0,
    }),
  );

/** 用户收藏播客/电台 */
export const fetchUserRadios = (): Promise<UserRadio[]> =>
  fetchAllPages(
    async (offset, limit) => {
      const body = await neteaseApi.dj_sublist({ limit, offset });
      const list = body?.djRadios ?? body?.data ?? [];
      return { data: list, hasMore: body?.hasMore };
    },
    (item: any): UserRadio => ({
      id: String(item.id),
      name: item.name || "未知播客",
      cover: item.picUrl || item.coverUrl || "/images/album.jpg",
      creator: item.dj?.nickname || item.creator?.nickname || "未知主播",
      creatorAvatar: item.dj?.avatarUrl || item.creator?.avatarUrl,
      programCount: item.programCount || item.trackCount || 0,
      subCount: item.subCount || 0,
      description: item.desc || item.description || "",
    }),
  );

/** 收藏 / 取消收藏视频 */
export const subscribeVideo = async (id: string, subscribe: boolean): Promise<void> => {
  ensureOk(await neteaseApi.mv_sub({ mvid: id, t: subscribe ? 1 : 0 }));
};

/** 收藏 / 取消收藏电台播客 */
export const subscribeRadio = async (id: string, subscribe: boolean): Promise<void> => {
  ensureOk(await neteaseApi.dj_sub({ rid: id, t: subscribe ? 1 : 0 }));
};

/**
 * 切换红心状态
 * 优先调用新版 like_v1，失败时自动降级到旧版 like
 * @param trackId - 歌曲 ID
 * @param like - true 为红心，false 为取消红心
 */
export const toggleLikeSong = async (trackId: string, like: boolean): Promise<void> => {
  try {
    const res = await neteaseApi.like_v1<{ code?: number }>({ id: trackId, like });
    if (res && (res.code === 200 || Number(res.code) === 200)) return;
  } catch {}
  ensureOk(await neteaseApi.like({ id: trackId, like }));
};

/** 用户等级 */
export const fetchUserLevel = async (): Promise<number | undefined> => {
  const body = await neteaseApi.user_level();
  const level = body?.data?.level;
  return typeof level === "number" ? level : undefined;
};
