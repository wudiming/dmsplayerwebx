import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const DIST_DIR = process.env.DIST_DIR || path.join(__dirname, "../dist");
const PLUGIN_DIR = process.env.PLUGIN_DIR || path.join(__dirname, "../plugins");

let handleApiRequest = null;
try {
  const possiblePaths = [
    path.join(__dirname, "handler.mjs"),
    path.join(__dirname, "../server/dist/handler.mjs"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const mod = await import(`file://${p.replace(/\\/g, "/")}`);
      handleApiRequest = mod.handleApiRequest;
      break;
    }
  }
} catch (e) {
  console.warn("[SPlayer WebX] Failed to load backend handler:", e);
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Forward /api/ requests to SPlayer backend handler
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/plugins/status") {
      const pluginPath = path.join(PLUGIN_DIR, "npi.netease.source.js");
      let version = "1.0.0";
      if (fs.existsSync(pluginPath)) {
        const content = fs.readFileSync(pluginPath, "utf-8");
        const match = content.match(/@version\s+([0-9.]+)/);
        if (match) version = match[1];
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ pluginId: "npi.netease.source", version, ok: true }));
      return;
    }

    if (handleApiRequest) {
      handleApiRequest(req, res);
      return;
    }
  }

  // Handle /plugins/ requests
  if (pathname.startsWith("/plugins/")) {
    const filename = pathname.replace(/^\/plugins\//, "");
    const pluginFile = path.join(PLUGIN_DIR, filename);
    if (fs.existsSync(pluginFile) && fs.statSync(pluginFile).isFile()) {
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(pluginFile).pipe(res);
      return;
    }
  }

  // Handle static files in DIST_DIR
  let filePath = path.join(DIST_DIR, pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const cacheControl = ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SPA fallback to index.html
  const indexPath = path.join(DIST_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("404 Not Found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[SPlayer WebX] Server running on http://0.0.0.0:${PORT}`);
  console.log(`[SPlayer WebX] Serving from: ${DIST_DIR}`);
  console.log(`[SPlayer WebX] Plugin directory: ${PLUGIN_DIR}`);
});
