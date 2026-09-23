import type {
  DownloadRequest,
  DownloadTask,
  DownloadProgress,
  DownloadStatus,
} from "@shared/types/download";
import { resolveDownloadSource } from "@/services/download/source";
import { getStoredDownloadDirHandle } from "./downloadDirStorage";

const STORAGE_KEY = "splayer_web_download_tasks";

type StateListener = (task: DownloadTask) => void;
type ProgressListener = (progress: DownloadProgress) => void;

class WebDownloadManager {
  private tasks: DownloadTask[] = [];
  private stateListeners: Set<StateListener> = new Set();
  private progressListeners: Set<ProgressListener> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.tasks = JSON.parse(data);
        // 重置未完成任务为 interrupted
        for (const t of this.tasks) {
          if (t.status === "downloading" || t.status === "queued") {
            t.status = "interrupted";
          }
        }
      }
    } catch {
      this.tasks = [];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tasks.slice(0, 200)));
    } catch {
      // 忽略存储超额异常
    }
  }

  private emitState(task: DownloadTask) {
    this.saveToStorage();
    for (const fn of this.stateListeners) {
      try {
        fn(task);
      } catch (err) {
        console.error("[WebDownloadManager] stateListener error", err);
      }
    }
  }

  private emitProgress(progress: DownloadProgress) {
    for (const fn of this.progressListeners) {
      try {
        fn(progress);
      } catch (err) {
        console.error("[WebDownloadManager] progressListener error", err);
      }
    }
  }

  public onState(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  public onProgress(fn: ProgressListener): () => void {
    this.progressListeners.add(fn);
    return () => this.progressListeners.delete(fn);
  }

  public async list(): Promise<DownloadTask[]> {
    return [...this.tasks];
  }

  public async start(req: DownloadRequest): Promise<{ ok: boolean; reason?: "downloaded" | "queued" }> {
    const existing = this.tasks.find((t) => t.taskId === req.taskId);
    if (existing && (existing.status === "downloading" || existing.status === "queued")) {
      return { ok: false, reason: "queued" };
    }

    const task: DownloadTask = {
      taskId: req.taskId,
      status: "queued",
      track: req.track,
      qualityLevel: req.qualityLevel,
      received: 0,
      total: req.declaredSize || 0,
      createdAt: Date.now(),
    };

    const idx = this.tasks.findIndex((t) => t.taskId === req.taskId);
    if (idx >= 0) {
      this.tasks[idx] = task;
    } else {
      this.tasks.unshift(task);
    }
    this.emitState(task);

    // 异步执行下载流程
    void this.processTask(task, req);

    return { ok: true };
  }

  private async processTask(task: DownloadTask, req: DownloadRequest) {
    task.status = "downloading";
    this.emitState(task);

    try {
      // 1. 获取对应清晰度直链
      const resolved = await resolveDownloadSource(
        req.track,
        req.qualityLevel,
        req.usePlaybackForDownload,
      );

      if (!resolved || !resolved.url) {
        task.status = "failed";
        task.errorCode = "NO_DOWNLOAD_SOURCE";
        task.finishedAt = Date.now();
        this.emitState(task);
        return;
      }

      // 2. 生成规范文件名（根据配置 downloadFileTemplate）
      const artists =
        req.track.artists?.map((a) => a.name).join(" & ") || "未知歌手";
      const title = req.track.title || "未知曲目";
      const ext = resolved.format || "mp3";

      let template = "{artist} - {title}";
      let lyricFormat = "lrc";
      try {
        const cfgRaw = localStorage.getItem("splayer_web_system_config");
        if (cfgRaw) {
          const cfg = JSON.parse(cfgRaw);
          if (cfg.download?.fileTemplate) template = cfg.download.fileTemplate;
          if (cfg.download?.lyricFileFormat) lyricFormat = cfg.download.lyricFileFormat;
        }
      } catch {}

      let baseName = template
        .replace(/\{artist\}/g, artists)
        .replace(/\{title\}/g, title)
        .replace(/[\\/:*?"<>|]/g, "_");
      if (!baseName.trim()) baseName = `${artists} - ${title}`.replace(/[\\/:*?"<>|]/g, "_");
      const filename = `${baseName}.${ext}`;

      // 3. 通过内置流代理下载为 Blob 并保存到系统下载目录
      let downloadedViaBlob = false;
      const proxyUrl = `/api/proxy/stream?url=${encodeURIComponent(resolved.url)}`;
      try {
        const response = await fetch(proxyUrl);
        if (response.ok && response.body) {
          const contentLength = Number(response.headers.get("content-length")) || 0;
          if (contentLength > 0) {
            task.total = contentLength;
          }

          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.length;
              task.received = received;
              this.emitProgress({ taskId: task.taskId, received, total: task.total || received });
            }
          }

          const mimeType = ext === "flac" ? "audio/flac" : "audio/mpeg";
          const blob = new Blob(chunks as BlobPart[], { type: mimeType });

          let savedToCustomHandle = false;
          try {
            const dirHandle = await getStoredDownloadDirHandle();
            if (dirHandle) {
              const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
              savedToCustomHandle = true;
            }
          } catch (customErr) {
            console.warn("[WebDownloadManager] Write to custom dir failed, falling back to browser download:", customErr);
          }

          if (!savedToCustomHandle) {
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(blobUrl);
            }, 1000);
          }
          downloadedViaBlob = true;
        }
      } catch (err) {
        console.warn("[WebDownloadManager] Blob download via proxy failed, falling back to direct link:", err);
        downloadedViaBlob = false;
      }

      // 4. 若设置或请求开启了歌词下载，自动拉取并保存歌词文件
      if (req.downloadLyric) {
        try {
          const lyricRes = await window.api.lyrics.matchById(req.track.source || "netease", req.track.id);
          if (lyricRes?.ok && lyricRes?.data?.lyric) {
            const lyricContent = lyricRes.data.lyric;
            const lyricExt = lyricFormat === "enhanced-lrc" ? "elrc" : "lrc";
            const lyricBlob = new Blob([lyricContent], { type: "text/plain;charset=utf-8" });
            const lyricFilename = `${baseName}.${lyricExt}`;

            let lyricSavedToCustom = false;
            try {
              const dirHandle = await getStoredDownloadDirHandle();
              if (dirHandle) {
                const fileHandle = await dirHandle.getFileHandle(lyricFilename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(lyricBlob);
                await writable.close();
                lyricSavedToCustom = true;
              }
            } catch {}

            if (!lyricSavedToCustom) {
              const lyricBlobUrl = URL.createObjectURL(lyricBlob);
              const lrcA = document.createElement("a");
              lrcA.href = lyricBlobUrl;
              lrcA.download = lyricFilename;
              document.body.appendChild(lrcA);
              lrcA.click();
              setTimeout(() => {
                document.body.removeChild(lrcA);
                URL.revokeObjectURL(lyricBlobUrl);
              }, 1000);
            }
          }
        } catch (lrcErr) {
          console.warn("[WebDownloadManager] Download lyric failed:", lrcErr);
        }
      }

      if (!downloadedViaBlob) {
        const a = document.createElement("a");
        a.href = proxyUrl;
        a.download = filename;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
        }, 1000);
      }

      // 4. 标记完成
      task.status = "done";
      task.filePath = filename;
      task.received = task.total || 1024 * 1024 * 5;
      task.finishedAt = Date.now();
      this.emitState(task);
    } catch (err: any) {
      console.error("[WebDownloadManager] download failed", err);
      task.status = "failed";
      task.errorCode = err?.message || "DOWNLOAD_FAILED";
      task.finishedAt = Date.now();
      this.emitState(task);
    }
  }

  public async startMany(requests: DownloadRequest[]): Promise<Array<{ ok: boolean; taskId: string }>> {
    const results: Array<{ ok: boolean; taskId: string }> = [];
    for (const req of requests) {
      const res = await this.start(req);
      results.push({ ok: res.ok, taskId: req.taskId });
      // 间隔 200ms 避免请求风暴
      await new Promise((r) => setTimeout(r, 200));
    }
    return results;
  }

  public async cancel(taskId: string): Promise<void> {
    const task = this.tasks.find((t) => t.taskId === taskId);
    if (task && (task.status === "queued" || task.status === "downloading")) {
      task.status = "canceled";
      task.finishedAt = Date.now();
      this.emitState(task);
    }
  }

  public async retry(req: DownloadRequest): Promise<{ ok: boolean }> {
    return this.start(req);
  }

  public async remove(taskId: string): Promise<void> {
    this.tasks = this.tasks.filter((t) => t.taskId !== taskId);
    this.saveToStorage();
  }

  public async clearFinished(): Promise<void> {
    this.tasks = this.tasks.filter((t) => t.status === "downloading" || t.status === "queued");
    this.saveToStorage();
  }
}

export const webDownloadManager = new WebDownloadManager();
