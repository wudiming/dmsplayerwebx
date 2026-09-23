import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { coreLog } from "../adapters/logger.js";

const NETEASE_COOKIE_KEYS = ["MUSIC_U", "__csrf", "NMTID", "MUSIC_A"];
const DEBUG_PORT = 9333;

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
let currentChildProcess: any = null;
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
  if (currentChildProcess) {
    try {
      currentChildProcess.kill("SIGKILL");
    } catch {}
    currentChildProcess = null;
  }
  activeLoginPromise = null;
}

/**
 * 打开网易云官方网页登录窗口并自动捕获登录 Cookie
 * - 若已存在登录态（此前已登录），直接获取并关闭小窗
 * - 若未登录，等待用户在小窗中登录，完成后自动获取并关闭小窗
 */
export async function openNeteaseLoginWindow(): Promise<Record<string, string> | null> {
  if (activeLoginPromise) {
    await cancelLoginWindow();
  }

  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("NO_LOCAL_BROWSER: 未检测到本地 Chrome 或 Edge 浏览器");
  }

  const loginProfileDir = path.join(os.homedir(), ".splayer", "login_profile");
  try {
    fs.mkdirSync(loginProfileDir, { recursive: true });
  } catch {}

  activeLoginPromise = (async () => {
    let pollInterval: NodeJS.Timeout | null = null;

    try {
      coreLog.info("[loginWindow] Spawning Chrome App window:", executablePath);

      // 直接使用 spawn 拉起原生 App 窗口模式，确保窗口在操作系统顶层前台显示
      const child = spawn(
        executablePath,
        [
          "--app=https://music.163.com/#/login",
          "--window-size=1024,720",
          `--user-data-dir=${loginProfileDir}`,
          `--remote-debugging-port=${DEBUG_PORT}`,
          "--no-first-run",
          "--no-default-browser-check",
        ],
        {
          detached: true,
          stdio: "ignore",
        },
      );
      child.unref();
      currentChildProcess = child;

      // 等待并连接 CDP 调试端口进行 Cookie 监听与提取
      let browser: any = null;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try {
          browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}` });
          if (browser) break;
        } catch {}
      }

      if (!browser) {
        throw new Error("无法连接至登录窗口调试端口");
      }
      currentBrowser = browser;

      return await new Promise<Record<string, string> | null>(async (resolve) => {
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
          if (currentChildProcess) {
            try {
              currentChildProcess.kill();
            } catch {}
            currentChildProcess = null;
          }
          resolve(result);
        };

        currentFinishFn = finish;

        browser.on("disconnected", () => {
          finish(null);
        });

        const checkCookies = async (): Promise<boolean> => {
          try {
            if (!browser || !browser.connected) return false;
            const pages = await browser.pages();
            if (!pages || pages.length === 0) return false;
            const page = pages[0];
            const cookies = await page.cookies();
            const musicU = cookies.find((c: any) => c.name === "MUSIC_U");
            if (musicU?.value) {
              const result: Record<string, string> = {};
              for (const key of NETEASE_COOKIE_KEYS) {
                const hit = cookies.find((c: any) => c.name === key);
                if (hit?.value) result[key] = hit.value;
              }
              result["MUSIC_U"] = musicU.value;
              coreLog.info("[loginWindow] Captured MUSIC_U, auto-completing login!");
              await finish(result);
              return true;
            }
          } catch {}
          return false;
        };

        // 1. 若此前已登录，等待页面首包完成后直接获取并关闭窗口
        await new Promise((r) => setTimeout(r, 600));
        if (await checkCookies()) return;

        // 2. 轮询检测：等待用户在窗口中登录完成
        pollInterval = setInterval(async () => {
          await checkCookies();
        }, 800);
      });
    } finally {
      activeLoginPromise = null;
      currentBrowser = null;
      currentChildProcess = null;
      currentFinishFn = null;
    }
  })();

  return activeLoginPromise;
}
