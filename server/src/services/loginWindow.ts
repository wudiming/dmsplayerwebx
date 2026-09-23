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

let currentBrowser: any = null;
let currentFinishFn: ((result: Record<string, string> | null) => void) | null = null;
let activeLoginPromise: Promise<Record<string, string> | null> | null = null;

export async function cancelLoginWindow(): Promise<void> {
  if (currentFinishFn) {
    currentFinishFn(null);
    currentFinishFn = null;
  }
  if (currentBrowser) {
    try {
      await currentBrowser.close().catch(() => {});
    } catch {}
    currentBrowser = null;
  }
  activeLoginPromise = null;
}

/**
 * 打开网易云官方网页登录窗口并自动捕获登录 Cookie
 * @returns 登录成功返回 cookies 对象；用户中途关闭窗口返回 null
 */
export async function openNeteaseLoginWindow(): Promise<Record<string, string> | null> {
  // 如果已有窗口在运行，先安全关闭并清理，确保每次点击都是全新的交互窗口
  await cancelLoginWindow();

  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("NO_LOCAL_BROWSER: 未检测到本地 Chrome 或 Edge 浏览器");
  }

  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "splayer-login-"));

  activeLoginPromise = (async () => {
    let pollInterval: NodeJS.Timeout | null = null;

    try {
      const browser = await puppeteer.launch({
        executablePath,
        headless: false,
        defaultViewport: null,
        userDataDir: tempUserDataDir,
        ignoreDefaultArgs: ["--enable-automation"],
        args: [
          "--window-size=1024,720",
          "--no-sandbox",
          "--disable-blink-features=AutomationControlled",
          "--no-first-run",
          "--no-default-browser-check",
        ],
      });
      currentBrowser = browser;

      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      await page.goto("https://music.163.com/#/login", { waitUntil: "domcontentloaded" });
      await page.bringToFront().catch(() => {});

      return await new Promise<Record<string, string> | null>((resolve) => {
        let settled = false;

        const finish = async (result: Record<string, string> | null) => {
          if (settled) return;
          settled = true;
          currentFinishFn = null;
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          try {
            if (browser && browser.connected) {
              await browser.close().catch(() => {});
            }
          } catch {}
          currentBrowser = null;
          try {
            fs.rmSync(tempUserDataDir, { recursive: true, force: true });
          } catch {}
          resolve(result);
        };

        currentFinishFn = finish;

        browser.on("disconnected", () => {
          finish(null);
        });

        page.on("close", () => {
          finish(null);
        });

        pollInterval = setInterval(async () => {
          try {
            if (!browser || !browser.connected) return;
            const cookies = await page.cookies();
            const musicU = cookies.find((c: any) => c.name === "MUSIC_U");
            if (musicU?.value) {
              const result: Record<string, string> = {};
              for (const key of NETEASE_COOKIE_KEYS) {
                const hit = cookies.find((c: any) => c.name === key);
                if (hit?.value) result[key] = hit.value;
              }
              result["MUSIC_U"] = musicU.value;
              await finish(result);
            }
          } catch (err) {
            // 轮询时若窗口正在关闭则忽略异常
          }
        }, 1000);
      });
    } finally {
      activeLoginPromise = null;
      currentBrowser = null;
      currentFinishFn = null;
    }
  })();

  return activeLoginPromise;
}
