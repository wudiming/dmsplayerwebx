import type { Album, Artist, Playlist } from "@shared/types/player";
import type { CoverItem } from "@/types/artist";
import type { UserRadio, UserVideo } from "@/types/user";

/**
 * 领域模型 Album → 展示模型 CoverItem
 * @param album - 领域模型 Album
 */
export const albumToCoverItem = (album: Album): CoverItem => ({
  id: album.id ?? "",
  title: album.name,
  cover: album.cover,
  subtitle: album.artist ?? "",
  trackCount: album.trackCount ?? 0,
});

/**
 * 领域模型 Artist → 展示模型 CoverItem
 * @param artist - 领域模型 Artist
 */
export const artistToCoverItem = (artist: Artist): CoverItem => ({
  id: artist.id ?? "",
  title: artist.name,
  cover: artist.avatar,
  trackCount: 0,
});

/**
 * 领域模型 Playlist → 展示模型 CoverItem
 * @param playlist - 领域模型 Playlist
 */
export const playlistToCoverItem = (playlist: Playlist): CoverItem => ({
  id: playlist.id ?? "",
  title: playlist.name,
  cover: playlist.cover,
  trackCount: playlist.trackCount ?? 0,
});

/**
 * 视频模型 UserVideo → 展示模型 CoverItem
 * @param video - 视频模型
 */
export const videoToCoverItem = (video: UserVideo): CoverItem => ({
  id: video.id,
  title: video.name,
  cover: video.cover,
  subtitle: video.artistName,
  trackCount: 0,
  playCount: video.playCount,
  duration: video.duration,
  creator: video.artistName,
  url: video.url,
  description: video.description,
});

/**
 * 播客模型 UserRadio → 展示模型 CoverItem
 * @param radio - 播客模型
 */
export const radioToCoverItem = (radio: UserRadio): CoverItem => ({
  id: radio.id,
  title: radio.name,
  cover: radio.cover,
  subtitle: radio.creator,
  trackCount: radio.programCount,
  creator: radio.creator,
  description: radio.description,
});

/**
 * 批量转换：Album[] → CoverItem[]
 * @param albums - 领域模型 Album 列表
 */
export const albumsToCoverItems = (albums: Album[]): CoverItem[] => albums.map(albumToCoverItem);

/**
 * 批量转换：Artist[] → CoverItem[]
 * @param artists - 领域模型 Artist 列表
 */
export const artistsToCoverItems = (artists: Artist[]): CoverItem[] =>
  artists.map(artistToCoverItem);

/**
 * 批量转换：Playlist[] → CoverItem[]
 * @param playlists - 领域模型 Playlist 列表
 */
export const playlistsToCoverItems = (playlists: Playlist[]): CoverItem[] =>
  playlists.map(playlistToCoverItem);

/**
 * 批量转换：UserVideo[] → CoverItem[]
 * @param videos - 视频列表
 */
export const videosToCoverItems = (videos: UserVideo[]): CoverItem[] =>
  videos.map(videoToCoverItem);

/**
 * 批量转换：UserRadio[] → CoverItem[]
 * @param radios - 播客列表
 */
export const radiosToCoverItems = (radios: UserRadio[]): CoverItem[] =>
  radios.map(radioToCoverItem);
