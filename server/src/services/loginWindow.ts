import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { coreLog } from "../adapters/logger.js";

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

/** 强制终止指定 PID 及其整个子进程树 */
function forceKillPid(pid: number): void {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {}
}

/** 清理可能残留并锁定独立登录 profile 的僵尸浏览器进程及遗留 lockfile */
function cleanStaleProfileLocks(profileDir: string): void {
  if (process.platform === "win32") {
    try {
      const script = `
$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-CimInstance Win32_Process | Where-Object { ($_.Name -like '*chrome*' -or $_.Name -like '*edge*') -and ($_.CommandLine -like '*login_profile*') }
foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force
}
`;
      const base64 = Buffer.from(script, "utf16le").toString("base64");
      execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${base64}`, { stdio: "ignore" });
    } catch {}

    try {
      const lockfilePath = path.join(profileDir, "lockfile");
      if (fs.existsSync(lockfilePath)) {
        fs.unlinkSync(lockfilePath);
      }
    } catch {}
  }
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
    const pid = currentBrowser.process?.()?.pid;
    try {
      await currentBrowser.close().catch(() => {});
    } catch {}
    if (pid) forceKillPid(pid);
    currentBrowser = null;
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
    coreLog.info("[loginWindow] Reusing active login window promise");
    return activeLoginPromise;
  }

  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("NO_LOCAL_BROWSER: 未检测到本地 Chrome 或 Edge 浏览器");
  }

  const loginProfileDir = path.join(os.homedir(), ".splayer", "login_profile");
  try {
    fs.mkdirSync(loginProfileDir, { recursive: true });
  } catch {}

  // 启动前排查并清理任何可能占用该配置目录的残留进程与 lockfile
  cleanStaleProfileLocks(loginProfileDir);

  activeLoginPromise = (async () => {
    let pollInterval: NodeJS.Timeout | null = null;
    let browser: any = null;

    try {
      coreLog.info("[loginWindow] Launching Chrome App window via puppeteer:", executablePath);

      // 直接通过 puppeteer.launch 原生拉起 App 窗口，管道稳定管理，绝不与用户日常浏览器实例冲突
      browser = await puppeteer.launch({
        executablePath,
        headless: false,
        userDataDir: loginProfileDir,
        defaultViewport: null,
        args: [
          "--app=https://music.163.com/#/login",
          "--window-size=1024,720",
          "--no-first-run",
          "--no-default-browser-check",
        ],
        ignoreDefaultArgs: ["--enable-automation"],
      });

      currentBrowser = browser;

      const pages = await browser.pages();
      const page = pages[0] || (await browser.newPage());
      try {
        await page.bringToFront();
      } catch {}

      // 建立 CDP 会话以获取跨域/所有作用域的 Cookie
      let client: any = null;
      try {
        client = await page.createCDPSession();
      } catch {}

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
          const pid = browser?.process?.()?.pid;
          try {
            if (browser && browser.connected) {
              await browser.close().catch(() => {});
            }
          } catch {}
          if (pid) forceKillPid(pid);
          currentBrowser = null;
          resolve(result);
        };

        currentFinishFn = finish;

        // 用户主动关闭窗口时，触发 disconnected 并安全结束
        browser.on("disconnected", () => {
          finish(null);
        });

        const checkCookies = async (): Promise<Record<string, string> | null> => {
          try {
            if (!browser || !browser.connected) return null;
            let allCookies: any[] = [];
            if (client) {
              try {
                const res = await client.send("Network.getAllCookies");
                allCookies = res.cookies || [];
              } catch {
                allCookies = await page.cookies("https://music.163.com", "https://interface.music.163.com");
              }
            } else {
              allCookies = await page.cookies("https://music.163.com", "https://interface.music.163.com");
            }

            const musicU = allCookies.find((c: any) => c.name === "MUSIC_U");
            if (musicU?.value) {
              const result: Record<string, string> = {};
              for (const key of NETEASE_COOKIE_KEYS) {
                const hit = allCookies.find((c: any) => c.name === key);
                if (hit?.value) result[key] = hit.value;
              }
              result["MUSIC_U"] = musicU.value;
              return result;
            }
          } catch {}
          return null;
        };

        // 1. 若此前已登录，等待页面首包完成后直接获取并关闭窗口
        setTimeout(async () => {
          if (settled) return;
          const initialResult = await checkCookies();
          if (initialResult) {
            coreLog.info("[loginWindow] Already logged in (MUSIC_U found in profile), auto-completing!");
            await finish(initialResult);
            return;
          }

          // 2. 轮询检测：等待用户在窗口中登录完成
          pollInterval = setInterval(async () => {
            if (settled) return;
            const result = await checkCookies();
            if (result) {
              coreLog.info("[loginWindow] Captured MUSIC_U from user login! Auto-completing!");
              await finish(result);
            }
          }, 800);
        }, 600);
      });
    } finally {
      activeLoginPromise = null;
      currentBrowser = null;
      currentFinishFn = null;
    }
  })();

  return activeLoginPromise;
}
