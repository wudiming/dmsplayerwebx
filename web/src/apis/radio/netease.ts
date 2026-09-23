import type { Track } from "@shared/types/player";
import { netease as neteaseApi } from "@/apis/netease";
import type { UserRadio } from "@/types/user";

/**
 * 拉取播客/电台：元数据 + 节目曲目
 * @param radioId 电台/播客 rid
 */
export const fetchRadio = async (
  radioId: string,
): Promise<{ radio: UserRadio; tracks: Track[] } | null> => {
  const [detailRes, programRes] = await Promise.all([
    neteaseApi.dj_detail({ rid: radioId }),
    neteaseApi.dj_program({ rid: radioId, limit: 100, offset: 0 }),
  ]);

  const raw = detailRes?.data ?? detailRes?.djRadio;
  if (!raw) return null;

  const radio: UserRadio = {
    id: String(raw.id),
    name: raw.name || "未知播客",
    cover: raw.picUrl || raw.coverUrl || "/images/album.jpg",
    description: raw.desc || raw.description || "",
    creator: raw.dj?.nickname || "未知主播",
    creatorAvatar: raw.dj?.avatarUrl,
    programCount: raw.programCount ?? 0,
    subCount: raw.subCount ?? 0,
  };

  const programs: any[] = programRes?.programs ?? [];
  const tracks: Track[] = programs.map((p: any, idx: number) => {
    const song = p.mainSong || p;
    const arList = Array.isArray(song.artists) && song.artists.length > 0
      ? song.artists
      : [{ id: String(raw.dj?.userId || `dj_${idx}`), name: p.dj?.nickname || raw.dj?.nickname || "主播" }];

    const cover = p.coverUrl || radio.cover;
    return {
      id: String(song.id || p.id || `radio_prog_${idx}`),
      source: "netease",
      title: p.name || song.name || `第 ${idx + 1} 期`,
      artists: arList.map((a: any) => ({
        id: String(a.id || ""),
        name: a.name || "主播",
      })),
      album: {
        id: `radio_${radio.id}`,
        name: radio.name,
        cover,
      },
      duration: Number(p.duration || song.duration || song.dt || 0),
      cover,
      coverOriginal: cover,
    };
  });

  return { radio, tracks };
};
