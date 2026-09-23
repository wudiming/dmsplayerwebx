/**
 * 用户登录相关类型
 */

/** 用户基础资料 */
export interface UserProfile {
  userId: number;
  nickname: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  signature?: string;
  /** 0=普通，非 0=黑胶 VIP */
  vipType?: number;
  gender?: number;
  province?: number;
  city?: number;
}

/** 用户订阅计数（/user/subcount） */
export interface UserSubcount {
  /** 自建歌单数 */
  createdPlaylistCount: number;
  /** 收藏歌单数 */
  subPlaylistCount: number;
  /** 收藏歌手数 */
  artistCount: number;
  /** 收藏视频/MV数 */
  mvCount?: number;
  /** 收藏播客/电台数 */
  djCount?: number;
}

/** 收藏视频/MV 数据项 */
export interface UserVideo {
  id: string;
  name: string;
  cover: string;
  artistName: string;
  artistId?: string;
  playCount?: number;
  duration?: number;
  url?: string;
  description?: string;
  publishTime?: string | number;
}

/** 播客节目项 */
export interface RadioProgram {
  id: string;
  name: string;
  coverUrl?: string;
  duration: number;
  mainSong?: {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    duration: number;
  };
}

/** 收藏播客/电台 数据项 */
export interface UserRadio {
  id: string;
  name: string;
  cover: string;
  creator: string;
  creatorAvatar?: string;
  programCount: number;
  subCount?: number;
  description?: string;
  programs?: RadioProgram[];
}
