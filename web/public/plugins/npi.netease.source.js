/**
 * @name        网易云音乐增强版
 * @id          npi.netease.source
 * @version     1.0.0
 * @description 基于 NeteaseCloudMusicApi Enhanced 自建服务的音源插件，支持播放地址解析（含解灰）、歌词、封面、评论兜底
 * @author      Community
 * @type        source
 * @apiLevel    3
 */

// ============================================================
// 配置区：请配置为您自建的服务地址（结尾不要带 /）
// ============================================================
const BASE_URL = "";

// 请求超时（毫秒）
const REQUEST_TIMEOUT = 15000;

// ============================================================
// 音质映射：SPlayer Quality <-> 网易云 level
// ============================================================
// SPlayer: lq < sq < hq < lossless < hi-res
// 网易云:   standard < higher < exhigh < lossless < hires < jyeffect < jymaster
// 请求的音质级别若不可用，按此顺序逐级降级尝试
const FALLBACK_CHAIN = {
  "hi-res": ["jymaster", "hires", "lossless", "exhigh", "higher", "standard"],
  lossless: ["lossless", "exhigh", "higher", "standard"],
  hq: ["exhigh", "higher", "standard"],
  sq: ["higher", "standard"],
  lq: ["standard"],
};

// ============================================================
// 通用工具
// ============================================================

/** 拼接 URL 查询参数 */
function buildUrl(path, params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && String(v) !== "") {
      qs.append(k, String(v));
    }
  }
  const query = qs.toString();
  return `${BASE_URL}${path}${query ? `?${query}` : ""}`;
}

/** 发起 GET 请求并返回 JSON body */
async function getJson(path, params) {
  const url = buildUrl(path, params);
  let resp;
  try {
    resp = await splayer.request(url, {
      method: "GET",
      responseType: "json",
      timeout: REQUEST_TIMEOUT,
    });
  } catch (e) {
    throw new Error(`请求失败：${e.message || e}`);
  }
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const body = resp.body;
  if (!body || typeof body !== "object") {
    throw new Error("响应体为空或非对象");
  }
  // 多数接口 code 在外层；/login/status 的 code 在 data.code 内
  const code = body.code ?? body.data?.code;
  if (code !== 200) {
    throw new Error(`接口返回码 ${code}：${body.msg || body.message || ""}`);
  }
  return body;
}

/** 网易云歌曲 ID：musicInfo 里 id / songmid / songId 三者任一 */
function pickSongId(musicInfo) {
  if (!musicInfo) return null;
  const id = musicInfo.id ?? musicInfo.songmid ?? musicInfo.songId;
  if (id === undefined || id === null) return null;
  const str = String(id).trim();
  return /^\d+$/.test(str) ? str : null;
}

/** 把多个歌手数组拼成 "a/b" */
function joinArtists(ar) {
  if (!Array.isArray(ar)) return "";
  return ar
    .map((a) => (a && a.name) || "")
    .filter(Boolean)
    .join("/");
}

/** http:// 直链升级为 https://（播放器对 https 兼容性更好） */
function httpsify(url) {
  if (typeof url !== "string") return url;
  return url.startsWith("http://") ? "https://" + url.slice(7) : url;
}

/** 网易云 level -> SPlayer Quality */
function levelToQuality(level, br, type) {
  // 优先用类型判定无损：flac/ape 一律算无损及以上
  if (type === "flac" || type === "ape" || type === "wav") {
    // hi-res 判定：采样率 >= 96k 或 level 为 jymaster/hires/jyeffect/vivid/sky
    if (
      level === "jymaster" ||
      level === "hires" ||
      level === "jyeffect" ||
      level === "vivid" ||
      level === "sky"
    ) {
      return "hi-res";
    }
    return "lossless";
  }
  // 有损按码率
  const bitrate = Number(br) || 0;
  if (bitrate >= 320000) return "hq";
  if (bitrate >= 192000) return "sq";
  return "lq";
}

// ============================================================
// 注册音源
// ============================================================
splayer.register({
  sources: {
    wy: {
      name: "网易云·增强版",
      actions: [
        "musicUrl",
        "musicSearch",
        "musicLyric",
        "musicPic",
        "musicComment",
      ],
      qualities: ["lq", "sq", "hq", "lossless", "hi-res"],
    },
  },
});

// ============================================================
// musicUrl：解析播放地址
// ============================================================

/** 判定 /song/url/v1 返回的地址是否为“试听片段”（VIP 歌无会话时的 30~45s 预览） */
function isTrialItem(item) {
  if (!item) return true;
  // 网易云对无权限歌曲会返回 freeTrialInfo（含 start/end 字段）标记试听区间
  const t = item.freeTrialInfo;
  if (t && typeof t === "object" && (t.end || t.start || t.start === 0)) return true;
  return false;
}

/**
 * 查询服务器绑定的账号状态，决定播放渠道：
 *   - 未登录（account 为空）          → 解灰
 *   - 已登录且 vipType > 0（VIP 账号）→ 官方渠道
 *   - 已登录但非 VIP                  → 解灰
 * 结果缓存 10 分钟，避免每首歌都查一次。
 */
let accountState = null; // { useOfficial: boolean, ts: number }
const ACCOUNT_CACHE_MS = 10 * 60 * 1000;

async function shouldUseOfficial() {
  const now = Date.now();
  if (accountState && now - accountState.ts < ACCOUNT_CACHE_MS) {
    return accountState.useOfficial;
  }
  let useOfficial = false;
  try {
    const body = await getJson("/login/status", {});
    const account = body?.data?.account;
    // account 为 null → 服务器未绑定账号 → 走解灰
    if (account) {
      // vipType: 0 = 普通账号；10/11/12 等为各类会员（含黑胶 VIP）
      const vipType = Number(account.vipType) || 0;
      useOfficial = vipType > 0;
    }
  } catch (e) {
    splayer.log.warn(`[account] 登录态查询失败：${e.message}，默认走解灰`);
  }
  accountState = { useOfficial, ts: now };
  splayer.log.info(
    `[account] ${useOfficial ? "已登录 VIP 账号 → 官方渠道" : "未登录或非 VIP → 解灰渠道"}`,
  );
  return useOfficial;
}

splayer.on("musicUrl", async (req) => {
  const { musicInfo, quality } = req;
  const id = pickSongId(musicInfo);
  if (!id) throw new Error("缺少歌曲 ID");

  const chain = FALLBACK_CHAIN[quality] || FALLBACK_CHAIN.hq;

  // 0) 未登录 / 非 VIP 账号：直接走解灰，不碰官方接口（否则只会拿到试听片段或 404）
  if (!(await shouldUseOfficial())) {
    try {
      const body = await getJson("/song/url/match", { id });
      if (typeof body.data === "string" && body.data) {
        splayer.log.debug(`[musicUrl] ${musicInfo.name || id} -> 解灰`);
        return { url: httpsify(body.data), quality: "lossless" };
      }
    } catch (e) {
      splayer.log.warn(`[musicUrl] 解灰失败：${e.message}，尝试官方渠道`);
      // 解灰失败时回落到官方接口，尽量不空手
    }
  }

  // 1) VIP 账号（或解灰失败回落）：走官方接口，按目标音质逐级降级
  let data = null;
  let lastErr = null;
  for (const level of chain) {
    try {
      const body = await getJson("/song/url/v1", { id, level });
      const item = Array.isArray(body.data) ? body.data[0] : null;
      if (
        item &&
        item.code === 200 &&
        typeof item.url === "string" &&
        item.url &&
        !isTrialItem(item) // 拒绝试听片段
      ) {
        data = item;
        break;
      }
      lastErr = (item && item.message) || "无可用播放地址";
    } catch (e) {
      lastErr = e.message;
    }
  }

  // 2) 官方接口也没拿到（如 VIP 账号到期、临时无权限）：解灰兜底
  if (!data) {
    try {
      const body = await getJson("/song/url/match", { id });
      if (typeof body.data === "string" && body.data) {
        splayer.log.debug(`[musicUrl] ${musicInfo.name || id} -> 解灰(兜底)`);
        return { url: httpsify(body.data), quality: "lossless" };
      }
    } catch (e) {
      lastErr = e.message;
    }
  }

  if (!data) {
    throw new Error(lastErr || "解析播放地址失败");
  }

  const url = httpsify(data.url);
  const realQuality = levelToQuality(data.level, data.br, data.type);

  // expi 单位是秒，转成毫秒时间戳
  const expire =
    typeof data.expi === "number" && data.expi > 0
      ? Date.now() + data.expi * 1000
      : undefined;

  splayer.log.debug(
    `[musicUrl] ${musicInfo.name || id} -> ${realQuality} (${data.br}bps)`,
  );

  return { url, quality: realQuality, expire };
});

// ============================================================
// musicSearch：搜索候选（供宿主打分匹配）
// ============================================================
splayer.on("musicSearch", async (req) => {
  const keyword = (req.keyword || "").trim();
  if (!keyword) return { list: [] };

  const limit = Math.min(Number(req.limit) || 20, 50);
  const page = Math.max(Number(req.page) || 1, 1);
  const offset = (page - 1) * limit;

  const body = await getJson("/cloudsearch", {
    keywords: keyword,
    type: 1, // 单曲
    limit,
    offset,
  });

  const songs = body?.result?.songs;
  if (!Array.isArray(songs)) return { list: [] };

  return {
    list: songs.map((song) => {
      const item = {
        id: String(song.id),
        songId: String(song.id),
        songmid: String(song.id),
        name: song.name || "",
        singer: joinArtists(song.ar || song.artists),
        album: song.al?.name || song.album?.name || "",
        durationMs: typeof song.dt === "number" ? song.dt : undefined,
      };
      // 封面透传，命中后 musicPic 可直接复用
      const pic = song.al?.picUrl;
      if (pic) item.picUrl = httpsify(pic);
      return item;
    }),
  };
});

// ============================================================
// musicLyric：歌词兜底
// ============================================================
splayer.on("musicLyric", async (req) => {
  const id = pickSongId(req.musicInfo);
  if (!id) return { lyric: "" };

  const body = await getJson("/lyric", { id });

  const lyric = body.lrc?.lyric || "";
  const tlyric = body.tlyric?.lyric || "";
  const rlyric = body.romalrc?.lyric || "";
  const awlyric = body.klyric?.lyric || ""; // 逐字歌词

  return { lyric, tlyric, rlyric, awlyric };
});

// ============================================================
// musicPic：封面兜底
// ============================================================
splayer.on("musicPic", async (req) => {
  const info = req.musicInfo || {};
  // 搜索结果已透传 picUrl 时直接用
  if (typeof info.picUrl === "string" && info.picUrl) {
    return { url: httpsify(info.picUrl) };
  }
  const id = pickSongId(info);
  if (!id) return { url: "" };

  const body = await getJson("/song/detail", { ids: id });
  const song = Array.isArray(body.songs) ? body.songs[0] : null;
  const pic = song?.al?.picUrl || song?.album?.picUrl || "";
  return { url: pic ? httpsify(pic) : "" };
});

// ============================================================
// musicComment：评论（API level 3）
// ============================================================
splayer.on("musicComment", async (req) => {
  const id = pickSongId(req.musicInfo);
  if (!id) return { list: [], total: 0, page: 1, limit: 20 };

  const limit = Math.min(Math.max(Number(req.limit) || 20, 1), 50);
  const page = Math.max(Number(req.page) || 1, 1);
  const type = req.type === "new" ? 2 : 1; // 1: 推荐(热门)  2: 最新
  const offset = (page - 1) * limit;

  const body = await getJson("/comment/music", { id, limit, offset, type });

  const pickList = (arr) =>
    (Array.isArray(arr) ? arr : []).map((c) => {
      const reply = (c.beReplied || []).map((r) => ({
        id: String(r.beRepliedCommentId || ""),
        userName: r.user?.nickname || "",
        text: r.content || "",
        avatar: r.user?.avatarUrl ? httpsify(r.user.avatarUrl) : undefined,
        userId: String(r.user?.userId || ""),
      }));
      const item = {
        id: String(c.commentId || ""),
        userId: String(c.user?.userId || ""),
        userName: c.user?.nickname || "未知用户",
        text: c.content || "",
        time: typeof c.time === "number" ? c.time : undefined,
        likedCount: typeof c.likedCount === "number" ? c.likedCount : 0,
        reply,
      };
      if (c.user?.avatarUrl) item.avatar = httpsify(c.user.avatarUrl);
      if (c.ipLocation?.location) item.location = c.ipLocation.location;
      return item;
    });

  // type=1 时接口同时返回 hotComments(热门) 与 comments(最新)；
  // type=2 时只有 comments。统一映射到当前请求类型。
  const list =
    type === 1
      ? pickList(body.hotComments && body.hotComments.length ? body.hotComments : body.comments)
      : pickList(body.comments);

  return {
    list,
    total: typeof body.total === "number" ? body.total : list.length,
    page,
    limit,
  };
});
