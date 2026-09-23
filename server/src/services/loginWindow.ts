import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const NETEASE_COOKIE_KEYS = ["MUSIC_U", "__csrf", "NMTID", "MUSIC_A"];

/** 查找系统可用的 Chrome 或 Edge 可执行文件路径 */
export function findBrowserExecutable(): string | null {
  const isWin = process.platform === "win32";
  const candidates: string[] = [];

  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  if (process.env.PUPPETEER_EXECUTABLE_PATH) candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);

  if (isWin) {
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env["LOCALAPPDATA"] || "";

    candidates.push(
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/usr/bin/microsoft-edge",
    );
  }

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

let activeLoginPromise: Promise<Record<string, string> | null> | null = null;

/**
 * 打开网易云官方网页登录窗口并自动捕获登录 Cookie
 * @returns 登录成功返回 cookies 对象；用户中途关闭窗口返回 null
 */
export async function openNeteaseLoginWindow(): Promise<Record<string, string> | null> {
  if (activeLoginPromise) return activeLoginPromise;

  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("未检测到本地 Chrome 或 Edge 浏览器，请先安装浏览器");
  }

  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "splayer-login-"));

  activeLoginPromise = (async () => {
    let browser: any = null;
    let pollInterval: NodeJS.Timeout | null = null;

    try {
      browser = await puppeteer.launch({
        executablePath,
        headless: false,
        defaultViewport: null,
        userDataDir: tempUserDataDir,
        args: [
          "--window-size=1024,720",
          "--app=https://music.163.com/#/login",
          "--disable-blink-features=AutomationControlled",
          "--no-first-run",
          "--no-default-browser-check",
        ],
      });

      return await new Promise<Record<string, string> | null>((resolve) => {
        let settled = false;

        const finish = async (result: Record<string, string> | null) => {
          if (settled) return;
          settled = true;
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          try {
            if (browser && browser.connected) {
              await browser.close().catch(() => {});
            }
          } catch {}
          try {
            fs.rmSync(tempUserDataDir, { recursive: true, force: true });
          } catch {}
          resolve(result);
        };

        browser.on("disconnected", () => {
          finish(null);
        });

        pollInterval = setInterval(async () => {
          try {
            const pages = await browser.pages();
            if (pages.length === 0) return;
            const targetPage = pages[pages.length - 1];
            const cookies = await targetPage.cookies("https://music.163.com");
            const musicU = cookies.find((c: any) => c.name === "MUSIC_U");
            if (musicU?.value) {
              const result: Record<string, string> = {};
              for (const key of NETEASE_COOKIE_KEYS) {
                const hit = cookies.find((c: any) => c.name === key);
                if (hit?.value) result[key] = hit.value;
              }
              await finish(result);
            }
          } catch (err) {
            // 轮询时若窗口正在关闭则忽略异常
          }
        }, 1000);
      });
    } finally {
      activeLoginPromise = null;
    }
  })();

  return activeLoginPromise;
}
