import { callNetease } from "../../apis/netease/index.js";
import { callQQMusic } from "../../apis/qqmusic/index.js";
import { callKugou } from "../../apis/kugou/index.js";
import type { KGSong } from "../../apis/kugou/core/types.js";
import { pickBestCandidate, type LyricCandidate } from "../../apis/common/lyric/utils.js";
import type { CommentSource, MusicCommentPage, MusicCommentQuery } from "@shared/types/comment.js";
import type { Track } from "@shared/types/player.js";
import {
  buildCommentSources,
  normalizeNeteaseCommentPage,
  normalizeKugouCommentPage,
  normalizeQQMusicCommentPage,
  type KugouCommentBody,
  type QQMusicCommentBody,
} from "./data.js";

const NETEASE_SOURCE_ID = "builtin:netease";
const QQMUSIC_SOURCE_ID = "builtin:qqmusic";
const KUGOU_SOURCE_ID = "builtin:kugou";
const NETEASE_RESOURCE_TYPE = "R_SO_4_";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const toKeyword = (track: Track): string =>
  `${track.title} ${track.artists.map((artist) => artist.name).join(" ")}`.trim();

const findNeteaseId = async (track: Track): Promise<string | null> => {
  if (track.source === "netease" && track.id) return track.id;
  const keyword = toKeyword(track);
  if (!keyword) return null;
  const { status, body } = await callNetease("search", {
    keywords: keyword,
    type: 1,
    limit: 20,
  });
  if (status !== 200) return null;
  const songs = body.result?.songs ?? [];
  const candidates: LyricCandidate<{ id: string }>[] = songs.map(
    (song: {
      id: string | number;
      name?: string;
      artists?: { name: string }[];
      album?: { name?: string };
      duration?: number;
    }) => ({
      name: song.name ?? "",
      artist: (song.artists ?? []).map((artist) => artist.name).join(" / "),
      album: song.album?.name,
      duration: song.duration,
      extra: { id: String(song.id) },
    }),
  );
  return pickBestCandidate(candidates, track)?.extra.id ?? null;
};

const getNeteaseComments = async (args: MusicCommentQuery): Promise<MusicCommentPage> => {
  const id = await findNeteaseId(args.track);
  if (!id) return { list: [], total: 0, page: args.page, limit: args.limit };

  const apiName = args.type === "hot" ? "comment_hot" : "comment_music";
  const { body } = await callNetease(apiName, {
    id,
    type: NETEASE_RESOURCE_TYPE,
    limit: args.limit,
    offset: (args.page - 1) * args.limit,
  });
  return normalizeNeteaseCommentPage(body, args.type, args.page, args.limit);
};

const findQQMusicId = async (track: Track): Promise<string | null> => {
  if (track.source === "qqmusic") {
    return track.extId || (/^\d+$/.test(track.id) ? track.id : null);
  }
  const keyword = toKeyword(track);
  if (!keyword) return null;
  const body = (await callQQMusic("search", { keywords: keyword, type: 0, page: 1, limit: 20 })) as {
    songs?: Array<{ id?: string; name?: string; artist?: string; album?: string; duration?: number }>;
  };
  const candidates: LyricCandidate<{ id: string }>[] = (body.songs ?? []).map((song) => ({
    name: song.name ?? "",
    artist: song.artist ?? "",
    album: song.album,
    duration: song.duration,
    extra: { id: song.id ?? "" },
  }));
  return pickBestCandidate(candidates, track)?.extra.id || null;
};

const getQQMusicComments = async (args: MusicCommentQuery): Promise<MusicCommentPage> => {
  const id = await findQQMusicId(args.track);
  if (!id) return { list: [], total: 0, page: args.page, limit: args.limit };
  const body = await callQQMusic("comment", {
    id,
    type: args.type,
    page: args.page,
    limit: args.limit,
    cursor: args.cursor,
  });
  return normalizeQQMusicCommentPage(body as QQMusicCommentBody, args.page, args.limit);
};

const findKugouId = async (track: Track): Promise<string | null> => {
  if (track.source === "kugou" && track.extId) return track.extId;
  const keyword = toKeyword(track);
  if (!keyword) return null;
  const body = (await callKugou("search", {
    keywords: keyword,
    type: 0,
    page: 1,
    limit: 20,
  })) as { songs?: KGSong[] };
  const candidates: LyricCandidate<{ id: string }>[] = (body.songs ?? []).map((song) => ({
    name: song.name,
    artist: song.artist,
    album: song.album,
    duration: song.duration,
    extra: { id: song.albumAudioId ? String(song.albumAudioId) : "" },
  }));
  return pickBestCandidate(candidates, track)?.extra.id || null;
};

const getKugouComments = async (args: MusicCommentQuery): Promise<MusicCommentPage> => {
  if (args.type !== "hot") return { list: [], total: 0, page: args.page, limit: args.limit };
  const id = await findKugouId(args.track);
  if (!id) return { list: [], total: 0, page: args.page, limit: args.limit };
  const body = (await callKugou("comment", {
    id,
    page: args.page,
    limit: args.limit,
  })) as KugouCommentBody;
  return normalizeKugouCommentPage(body, args.page, args.limit);
};

const normalizeQuery = (args: MusicCommentQuery): MusicCommentQuery => ({
  ...args,
  page: Math.max(1, Math.floor(Number(args.page) || 1)),
  limit: Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(args.limit) || DEFAULT_LIMIT))),
});

/** 获取当前可用评论源 */
export const getCommentSources = (): CommentSource[] => buildCommentSources();

/** 获取歌曲评论 */
export const getMusicComments = async (args: MusicCommentQuery): Promise<MusicCommentPage> => {
  const query = normalizeQuery(args);
  if (query.sourceId === NETEASE_SOURCE_ID) return getNeteaseComments(query);
  if (query.sourceId === QQMUSIC_SOURCE_ID) return getQQMusicComments(query);
  if (query.sourceId === KUGOU_SOURCE_ID) return getKugouComments(query);
  throw new Error(`unknown comment source: ${query.sourceId}`);
};
