import { pluginLog } from "../../adapters/logger.js";

export interface PluginResolveParams {
  pluginId?: string;
  source?: string;
  quality?: string;
  musicInfo: {
    id?: string | number;
    songmid?: string;
    songId?: string | number;
    name?: string;
    singer?: string;
    interval?: string | null;
    [key: string]: any;
  };
  settings?: Record<string, any>;
}

export interface PluginResolveResult {
  ok: boolean;
  url?: string;
  format?: string;
  bitrate?: number;
  quality?: string;
  error?: string;
}

const BASE_URL = "https://npi.881128.xyz";
const REQUEST_TIMEOUT = 15000;

const FALLBACK_CHAIN: Record<string, string[]> = {
  "hi-res": ["jymaster", "hires", "lossless", "exhigh", "higher", "standard"],
  lossless: ["lossless", "exhigh", "higher", "standard"],
  hq: ["exhigh", "higher", "standard"],
  sq: ["higher", "standard"],
  lq: ["standard"],
};

function httpsify(url: string | undefined): string | undefined {
  if (typeof url !== "string") return url;
  return url.startsWith("http://") ? "https://" + url.slice(7) : url;
}

function pickSongId(musicInfo: any): string | null {
  if (!musicInfo) return null;
  const id = musicInfo.id ?? musicInfo.songmid ?? musicInfo.songId;
  if (id === undefined || id === null) return null;
  const str = String(id).trim();
  return /^\d+$/.test(str) ? str : null;
}

function levelToQuality(level?: string, br?: number, type?: string): string {
  if (type === "flac" || type === "ape" || type === "wav") {
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
  const bitrate = Number(br) || 0;
  if (bitrate >= 320000) return "hq";
  if (bitrate >= 192000) return "sq";
  return "lq";
}

function isTrialItem(item: any): boolean {
  if (!item) return true;
  const t = item.freeTrialInfo;
  if (t && typeof t === "object" && (t.end || t.start || t.start === 0)) return true;
  return false;
}

async function getJson(path: string, params: Record<string, any> = {}): Promise<any> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== "") {
      qs.append(k, String(v));
    }
  }
  const qStr = qs.toString();
  const url = `${BASE_URL}${path}${qStr ? `?${qStr}` : ""}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SPlayer-WebX/1.2.0 (npi.netease.source)",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const body = (await res.json()) as any;
  if (!body || typeof body !== "object") {
    throw new Error("响应体为空或非对象");
  }
  const code = body.code ?? body.data?.code;
  if (code !== 200) {
    throw new Error(`接口返回码 ${code}: ${body.msg || body.message || ""}`);
  }
  return body;
}

let accountState: { useOfficial: boolean; ts: number } | null = null;
const ACCOUNT_CACHE_MS = 10 * 60 * 1000;

async function shouldUseOfficial(): Promise<boolean> {
  const now = Date.now();
  if (accountState && now - accountState.ts < ACCOUNT_CACHE_MS) {
    return accountState.useOfficial;
  }
  let useOfficial = false;
  try {
    const body = await getJson("/login/status", {});
    const account = body?.data?.account;
    if (account) {
      const vipType = Number(account.vipType) || 0;
      useOfficial = vipType > 0;
    }
  } catch (e: any) {
    pluginLog.warn(`[NeteaseEnhanced] 登录态查询失败: ${e.message}，默认走解灰`);
  }
  accountState = { useOfficial, ts: now };
  pluginLog.info(
    `[NeteaseEnhanced] ${useOfficial ? "已登录 VIP 账号 → 官方渠道" : "未登录或非 VIP → 解灰渠道"}`,
  );
  return useOfficial;
}

export const resolveNeteaseEnhancedUrl = async (
  params: PluginResolveParams,
): Promise<PluginResolveResult> => {
  const { musicInfo, quality = "hq" } = params;
  const id = pickSongId(musicInfo);
  if (!id) {
    return { ok: false, error: "缺少歌曲 ID" };
  }

  const chain = FALLBACK_CHAIN[quality] || FALLBACK_CHAIN.hq;

  // 1. 未登录或非 VIP：直接走解灰，不碰官方接口
  if (!(await shouldUseOfficial())) {
    try {
      const body = await getJson("/song/url/match", { id });
      if (typeof body.data === "string" && body.data) {
        pluginLog.info(`[NeteaseEnhanced] ${musicInfo.name || id} -> 解灰成功`);
        return {
          ok: true,
          url: httpsify(body.data),
          quality: "lossless",
        };
      }
    } catch (e: any) {
      pluginLog.warn(`[NeteaseEnhanced] 解灰失败: ${e.message}，尝试官方接口`);
    }
  }

  // 2. VIP 账号（或解灰失败回退）：走官方接口，按目标音质逐级降级
  let data: any = null;
  let lastErr = "";
  for (const level of chain) {
    try {
      const body = await getJson("/song/url/v1", { id, level });
      const item = Array.isArray(body.data) ? body.data[0] : null;
      if (
        item &&
        item.code === 200 &&
        typeof item.url === "string" &&
        item.url &&
        !isTrialItem(item)
      ) {
        data = item;
        break;
      }
      lastErr = item?.message || "无可用播放地址";
    } catch (e: any) {
      lastErr = e.message;
    }
  }

  // 3. 官方接口也没拿到：解灰兜底
  if (!data) {
    try {
      const body = await getJson("/song/url/match", { id });
      if (typeof body.data === "string" && body.data) {
        pluginLog.info(`[NeteaseEnhanced] ${musicInfo.name || id} -> 解灰(兜底)成功`);
        return {
          ok: true,
          url: httpsify(body.data),
          quality: "lossless",
        };
      }
    } catch (e: any) {
      lastErr = e.message;
    }
  }

  if (!data) {
    return { ok: false, error: lastErr || "解析播放地址失败" };
  }

  const finalUrl = httpsify(data.url);
  const realQuality = levelToQuality(data.level, data.br, data.type);

  pluginLog.info(`[NeteaseEnhanced] ${musicInfo.name || id} -> ${realQuality} (${data.br}bps)`);

  return {
    ok: true,
    url: finalUrl,
    quality: realQuality,
    bitrate: data.br,
    format: data.type,
  };
};
