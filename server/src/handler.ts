import type { IncomingMessage, ServerResponse } from "node:http";
import { requestSessionStorage, type RequestSessionStore } from "./adapters/sessions.js";
import { callNetease } from "./apis/netease/index.js";
import { NeteaseRequestError } from "./apis/netease/core/request.js";
import { cookieToJson } from "./apis/netease/core/cookie.js";
import { callQQMusic } from "./apis/qqmusic/index.js";
import { callKugou } from "./apis/kugou/index.js";
import * as neteaseLyric from "./apis/common/lyric/netease.js";
import * as qqmusicLyric from "./apis/common/lyric/qqmusic.js";
import * as kugouLyric from "./apis/common/lyric/kugou.js";
import { fetchTTML } from "./apis/common/lyric/ttml.js";
import { resolveNeteaseEnhancedUrl } from "./apis/plugins/neteaseEnhanced.js";
import { getCommentSources, getMusicComments } from "./services/comments/index.js";
import { openNeteaseLoginWindow } from "./services/loginWindow.js";
import { coreLog } from "./adapters/logger.js";

const readJsonBody = async (req: IncomingMessage): Promise<any> => {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
};

const sendJson = (res: ServerResponse, statusCode: number, data: any): void => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-splayer-session, x-splayer-cookies, Range",
  });
  res.end(JSON.stringify(data));
};

const setCorsHeaders = (res: ServerResponse): void => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-splayer-session, x-splayer-cookies, Range");
};

/**
 * 统一 API 请求处理入口
 * 可作为 Vite connect 中间件，也可作为独立 Node.js HTTP Server 的 requestListener
 */
export const handleApiRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  next?: () => void,
): Promise<void> => {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url || "/", "http://localhost");
  const pathname = urlObj.pathname;

  if (!pathname.startsWith("/api/")) {
    if (next) next();
    else {
      res.writeHead(404);
      res.end("Not Found");
    }
    return;
  }

  // 1. 健康检查
  if (pathname === "/api/health") {
    sendJson(res, 200, {
      status: "ok",
      app: "SPlayer WebX",
      version: "1.2.0-webx",
      timestamp: Date.now(),
    });
    return;
  }

  // 2. 音频流代理 (支持 Range 续传与 CORS 播放)
  if (pathname === "/api/proxy/stream") {
    const targetUrl = urlObj.searchParams.get("url");
    if (!targetUrl) {
      sendJson(res, 400, { error: "Missing url parameter" });
      return;
    }

    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      };
      if (req.headers.range) {
        headers["Range"] = String(req.headers.range);
      }

      const upstream = await fetch(targetUrl, { headers });
      const responseHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Range",
        "Accept-Ranges": "bytes",
      };

      for (const [key, value] of upstream.headers.entries()) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey === "content-type" ||
          lowerKey === "content-length" ||
          lowerKey === "content-range" ||
          lowerKey === "last-modified" ||
          lowerKey === "etag"
        ) {
          responseHeaders[key] = value;
        }
      }

      res.writeHead(upstream.status, responseHeaders);
      if (upstream.body) {
        // Node 18+ web stream to node response stream
        const reader = upstream.body.getReader();
        let closed = false;
        req.on("close", () => {
          closed = true;
          reader.cancel().catch(() => {});
        });
        const pump = async () => {
          while (!closed) {
            const { done, value } = await reader.read();
            if (done || closed) {
              if (!res.writableEnded) res.end();
              break;
            }
            res.write(Buffer.from(value));
          }
        };
        pump().catch(() => {
          if (!res.writableEnded) res.end();
        });
      } else {
        if (!res.writableEnded) res.end();
      }
      return;
    } catch (err: any) {
      coreLog.error(`[proxy:stream] failed for ${targetUrl}:`, err);
      sendJson(res, 502, { error: err?.message || "Stream proxy error" });
      return;
    }
  }

  // 从 Header 或 Body 解析当前客户端浏览器隔离的 Session Cookies
  let clientCookies: Record<string, Record<string, string>> = {};
  const headerRaw = req.headers["x-splayer-cookies"];
  if (typeof headerRaw === "string") {
    try {
      clientCookies = JSON.parse(decodeURIComponent(headerRaw));
    } catch {}
  }

  const body = req.method === "POST" ? await readJsonBody(req) : {};
  if (body?.cookies && typeof body.cookies === "object") {
    clientCookies = { ...clientCookies, ...body.cookies };
  }

  const sessionStore: RequestSessionStore = {
    cookies: clientCookies,
    patch: {},
  };

  // 在 AsyncLocalStorage 上下文中执行请求，保证多用户完全并发隔离
  await requestSessionStorage.run(sessionStore, async () => {
    try {
      // 3. 通用 API 分发接口: POST /api/apis/call
      if (pathname === "/api/apis/call") {
        const platform = String(body.platform || "");
        const name = String(body.name || "");
        const params = (body.params || {}) as Record<string, unknown>;

        try {
          let result: Record<string, unknown>;
          switch (platform) {
            case "netease": {
              const resObj = await callNetease(name, params);
              result = { status: resObj.status, body: resObj.body };
              break;
            }
            case "qqmusic": {
              const data = await callQQMusic(name, params);
              result = { data };
              break;
            }
            case "kugou": {
              const data = await callKugou(name, params);
              result = { data };
              break;
            }
            default:
              sendJson(res, 400, { ok: false, error: `unknown platform: ${platform}` });
              return;
          }

          sendJson(res, 200, {
            ok: true,
            ...result,
            cookiePatch: Object.keys(sessionStore.patch).length ? sessionStore.patch : undefined,
          });
          return;
        } catch (err: any) {
          coreLog.warn(`[apis] ${platform}.${name} failed:`, err);
          if (platform === "netease" && err instanceof NeteaseRequestError) {
            sendJson(res, 200, {
              ok: false,
              error: err.message,
              status: err.response.status,
              body: err.response.body,
              cookiePatch: Object.keys(sessionStore.patch).length ? sessionStore.patch : undefined,
            });
            return;
          }
          sendJson(res, 200, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            cookiePatch: Object.keys(sessionStore.patch).length ? sessionStore.patch : undefined,
          });
          return;
        }
      }

      // 4. 手动设置 Cookie: POST /api/apis/setCookie
      if (pathname === "/api/apis/setCookie") {
        const platform = String(body.platform || "");
        const raw = String(body.raw || "");
        const parsed = cookieToJson(raw);

        if (platform === "netease") {
          if (!parsed.MUSIC_U) {
            sendJson(res, 200, { ok: false, error: "missing MUSIC_U" });
            return;
          }
          sessionStore.cookies.netease = { ...(sessionStore.cookies.netease || {}), ...parsed };
          sessionStore.patch.netease = { ...sessionStore.cookies.netease };
          sendJson(res, 200, { ok: true, cookiePatch: sessionStore.patch });
          return;
        }

        if (platform === "qqmusic") {
          if (Object.keys(parsed).length === 0) {
            sendJson(res, 200, { ok: false, error: "empty cookie" });
            return;
          }
          sessionStore.cookies.qqmusic = { ...(sessionStore.cookies.qqmusic || {}), ...parsed };
          sessionStore.patch.qqmusic = { ...sessionStore.cookies.qqmusic };
          sendJson(res, 200, { ok: true, cookiePatch: sessionStore.patch });
          return;
        }

        if (platform === "kugou") {
          if (Object.keys(parsed).length === 0) {
            sendJson(res, 200, { ok: false, error: "empty cookie" });
            return;
          }
          sessionStore.cookies.kugou = { ...(sessionStore.cookies.kugou || {}), ...parsed };
          sessionStore.patch.kugou = { ...sessionStore.cookies.kugou };
          sendJson(res, 200, { ok: true, cookiePatch: sessionStore.patch });
          return;
        }

        sendJson(res, 200, { ok: false, error: "unsupported platform" });
        return;
      }

      // 4.1 网页登录自动获取 Cookie: POST /api/apis/openLoginWeb
      if (pathname === "/api/apis/openLoginWeb") {
        const platform = String(body.platform || "netease");
        if (platform === "netease") {
          try {
            const cookies = await openNeteaseLoginWindow();
            if (!cookies) {
              sendJson(res, 200, { ok: false, error: "canceled" });
              return;
            }
            sessionStore.cookies.netease = { ...(sessionStore.cookies.netease || {}), ...cookies };
            sessionStore.patch.netease = { ...sessionStore.cookies.netease };
            sendJson(res, 200, { ok: true, cookiePatch: sessionStore.patch });
            return;
          } catch (err: any) {
            coreLog.warn("[apis] openLoginWeb netease failed:", err);
            sendJson(res, 200, { ok: false, error: err?.message || String(err) });
            return;
          }
        }
        sendJson(res, 200, { ok: false, error: "unsupported platform" });
        return;
      }

      // 5. 清除 Cookie: POST /api/apis/clearSession
      if (pathname === "/api/apis/clearSession") {
        const platform = String(body.platform || "");
        sessionStore.cookies[platform] = {};
        sessionStore.patch[platform] = {};
        sendJson(res, 200, { ok: true, cookiePatch: sessionStore.patch });
        return;
      }

      // 6. 歌词直取: POST /api/lyrics/matchById
      if (pathname === "/api/lyrics/matchById") {
        const platform = String(body.platform || "");
        const id = String(body.id || "");
        try {
          let data = null;
          if (platform === "netease") data = await neteaseLyric.getByPlatformId(id);
          else if (platform === "qqmusic") data = await qqmusicLyric.getByPlatformId(id);
          else if (platform === "kugou") data = await kugouLyric.getByPlatformId(id);

          sendJson(res, 200, { ok: Boolean(data), data });
          return;
        } catch (err: any) {
          sendJson(res, 200, { ok: false, error: err?.message || String(err) });
          return;
        }
      }

      // 7. 歌词模糊搜索: POST /api/lyrics/matchByQuery
      if (pathname === "/api/lyrics/matchByQuery") {
        const platform = String(body.platform || "");
        const track = body.track;
        try {
          let data = null;
          if (platform === "netease") data = await neteaseLyric.getByQuery(track);
          else if (platform === "qqmusic") data = await qqmusicLyric.getByQuery(track);
          else if (platform === "kugou") data = await kugouLyric.getByQuery(track);

          sendJson(res, 200, { ok: Boolean(data), data });
          return;
        } catch (err: any) {
          sendJson(res, 200, { ok: false, error: err?.message || String(err) });
          return;
        }
      }

      // 8. 逐字歌词 (TTML): POST /api/lyrics/fetchTTMLOverlay
      if (pathname === "/api/lyrics/fetchTTMLOverlay") {
        const track = body.track;
        const platform = body.platform as "netease" | "qqmusic";
        try {
          const ttml = await fetchTTML(track, platform);
          sendJson(res, 200, { ok: Boolean(ttml), ttml });
          return;
        } catch (err: any) {
          sendJson(res, 200, { ok: false, error: err?.message || String(err) });
          return;
        }
      }

      // 9. 网易云增强版插件音源解析: POST /api/plugins/resolveUrl
      if (pathname === "/api/plugins/resolveUrl") {
        const result = await resolveNeteaseEnhancedUrl(body);
        sendJson(res, 200, result);
        return;
      }

      // 10. 歌曲评论源列表: POST/GET /api/comments/sources
      if (pathname === "/api/comments/sources") {
        try {
          const sources = getCommentSources();
          sendJson(res, 200, { ok: true, data: sources });
          return;
        } catch (err: any) {
          sendJson(res, 200, { ok: false, error: err?.message || String(err) });
          return;
        }
      }

      // 11. 获取歌曲评论: POST /api/comments/get
      if (pathname === "/api/comments/get") {
        try {
          const data = await getMusicComments(body as any);
          sendJson(res, 200, { ok: true, data });
          return;
        } catch (err: any) {
          sendJson(res, 200, { ok: false, error: err?.message || String(err) });
          return;
        }
      }

      // 未知 /api 路由
      sendJson(res, 404, { ok: false, error: `unknown api endpoint: ${pathname}` });
    } catch (fatalErr: any) {
      coreLog.error("[api:fatal]", fatalErr);
      sendJson(res, 500, { ok: false, error: fatalErr?.message || "Internal server error" });
    }
  });
};
