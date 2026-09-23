import type { LyricMatchResult, LyricMatchExtra } from "@shared/types/lyrics.js";
import type { Track } from "@shared/types/player.js";
import type { Platform } from "@shared/types/platform.js";

const lyricCacheMap = new Map<string, { data: LyricMatchResult; fetchedAt: number }>();

export const getCachedLyric = (platform: Platform, platformId: string): LyricMatchResult | null => {
  const key = `${platform}:${platformId}`;
  const hit = lyricCacheMap.get(key);
  return hit ? hit.data : null;
};

export const setCachedLyric = (
  platform: Platform,
  platformId: string,
  result: LyricMatchResult,
): void => {
  const key = `${platform}:${platformId}`;
  lyricCacheMap.set(key, { data: result, fetchedAt: Date.now() });
};

export const clearLyricCache = (): void => {
  lyricCacheMap.clear();
};

export interface MatchedRecord {
  platformId: string;
  extra?: LyricMatchExtra;
}

const matchCacheMap = new Map<string, { platformId: string; extra?: LyricMatchExtra; matchedAt: number }>();
const DURATION_BUCKET_MS = 5000;
const FINGERPRINT_VERSION = "v2";

const normalize = (text?: string): string =>
  (text || "").trim().toLowerCase().replace(/\s+/g, " ");

export const buildFingerprint = (track: Track): string => {
  const title = normalize(track.title);
  const artist = (track.artists || []).map((a) => normalize(a.name)).join("");
  const bucket = track.duration ? Math.round(track.duration / DURATION_BUCKET_MS) : 0;
  return `${FINGERPRINT_VERSION}|${title}|${artist}|${bucket}`;
};

export const getMatchedId = (fingerprint: string, platform: Platform): MatchedRecord | null => {
  const key = `${fingerprint}:${platform}`;
  const hit = matchCacheMap.get(key);
  if (!hit) return null;
  if (Date.now() - hit.matchedAt > 30 * 24 * 3600 * 1000) {
    matchCacheMap.delete(key);
    return null;
  }
  return { platformId: hit.platformId, extra: hit.extra };
};

export const setMatchedId = (
  fingerprint: string,
  platform: Platform,
  platformId: string,
  extra?: LyricMatchExtra,
): void => {
  const key = `${fingerprint}:${platform}`;
  matchCacheMap.set(key, { platformId, extra, matchedAt: Date.now() });
};

export const clearLyricMatchCache = (): void => {
  matchCacheMap.clear();
};

// TTML Cache
const ttmlCacheMap = new Map<string, { content: string | null; fetchedAt: number }>();
const NEGATIVE_TTL_MS = 72 * 60 * 60 * 1000;

export const getCachedTTML = (platform: "netease" | "qqmusic", id: string): string | null | "miss" => {
  const key = `${platform}:${id}`;
  const hit = ttmlCacheMap.get(key);
  if (!hit) return "miss";
  if (hit.content !== null) return hit.content;
  if (Date.now() - hit.fetchedAt > NEGATIVE_TTL_MS) return "miss";
  return null;
};

export const setCachedTTML = (
  platform: "netease" | "qqmusic",
  id: string,
  content: string | null,
): void => {
  const key = `${platform}:${id}`;
  ttmlCacheMap.set(key, { content, fetchedAt: Date.now() });
};

export const clearLyricTtmlCache = (): void => {
  ttmlCacheMap.clear();
};
