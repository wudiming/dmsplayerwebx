import type {
  DownloadRequest,
  DownloadTask,
  DownloadProgress,
  DownloadFolderScheme,
  DownloadLyricFormat,
} from "@shared/types/download";
import { resolveDownloadSource } from "@/services/download/source";
import { resolveDownloadLyric } from "@/services/download/lyric";
import { buildDownloadLyric } from "@/utils/lyric/serialize";
import { getStoredDownloadDirHandle } from "./downloadDirStorage";

const STORAGE_KEY_TASKS = "splayer_web_download_tasks";
const STORAGE_KEY_CONFIG = "splayer_web_config";

type StateListener = (task: DownloadTask) => void;
type ProgressListener = (progress: DownloadProgress) => void;

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 1500);
}

class WebDownloadManager {
  private tasks: DownloadTask[] = [];
  private stateListeners: Set<StateListener> = new Set();
  private progressListeners: Set<ProgressListener> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_TASKS);
      if (data) {
        this.tasks = JSON.parse(data);
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
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(this.tasks.slice(0, 200)));
    } catch {}
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

    // 异步执行下载全流程
    void this.processTask(task, req);

    return { ok: true };
  }

  private async processTask(task: DownloadTask, req: DownloadRequest) {
    task.status = "downloading";
    this.emitState(task);

    try {
      // 1. 读取系统下载配置各项设置
      let template = "{artist} - {title}";
      let folderScheme: DownloadFolderScheme = "none";
      let overwritePolicy: "rename" | "overwrite" | "skip" = "rename";
      let lyricFormat: DownloadLyricFormat = "enhanced-lrc";
      let embedCover = true;
      let embedMeta = true;
      let embedLyric = true;
      let writeLrc = false;
      let saveTtml = false;

      try {
        const cfgRaw = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (cfgRaw) {
          const cfg = JSON.parse(cfgRaw);
          if (cfg.download) {
            if (cfg.download.fileTemplate) template = cfg.download.fileTemplate;
            if (cfg.download.folderScheme) folderScheme = cfg.download.folderScheme;
            if (cfg.download.overwritePolicy) overwritePolicy = cfg.download.overwritePolicy;
            if (cfg.download.lyricFileFormat) lyricFormat = cfg.download.lyricFileFormat;
            if (typeof cfg.download.embedCover === "boolean") embedCover = cfg.download.embedCover;
            if (typeof cfg.download.embedMeta === "boolean") embedMeta = cfg.download.embedMeta;
            if (typeof cfg.download.embedLyric === "boolean") embedLyric = cfg.download.embedLyric;
            if (typeof cfg.download.writeLrc === "boolean") writeLrc = cfg.download.writeLrc;
            if (typeof cfg.download.saveTtml === "boolean") saveTtml = cfg.download.saveTtml;
          }
        }
      } catch {}

      // 若请求中明确指定，则以单次请求为准
      if (req.folderScheme) folderScheme = req.folderScheme;
      if (req.fileTemplate) template = req.fileTemplate;
      if (req.overwritePolicy) overwritePolicy = req.overwritePolicy;
      if (req.tagOptions) {
        if (typeof req.tagOptions.embedCover === "boolean") embedCover = req.tagOptions.embedCover;
        if (typeof req.tagOptions.embedMeta === "boolean") embedMeta = req.tagOptions.embedMeta;
        if (typeof req.tagOptions.embedLyric === "boolean") embedLyric = req.tagOptions.embedLyric;
        if (typeof req.tagOptions.writeLrc === "boolean") writeLrc = req.tagOptions.writeLrc;
        if (typeof req.tagOptions.saveTtml === "boolean") saveTtml = req.tagOptions.saveTtml;
      }
      if (req.lyricFileFormat) {
        lyricFormat = req.lyricFileFormat;
      }

      // 2. 解析下载音频直链
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

      // 3. 解析歌词（供内嵌或导出 .lrc/.ttml）
      let lrcText: string | null = null;
      let ttmlText: string | null = null;
      if (embedLyric || writeLrc || saveTtml) {
        try {
          const lyric = await resolveDownloadLyric(req.track);
          if (lyric) {
            const input = {
              content: lyric.content,
              translation: lyric.translation,
              translationFormat: lyric.translationFormat,
              romaji: lyric.romaji,
              romajiFormat: lyric.romajiFormat,
            };
            if (embedLyric || writeLrc) {
              lrcText = buildDownloadLyric(input, lyric.format, lyricFormat);
            }
            if (saveTtml) {
              ttmlText = buildDownloadLyric(input, lyric.format, "ttml");
            }
          }
        } catch (err) {
          console.warn("[WebDownloadManager] Failed to resolve download lyric:", err);
        }
      }

      // 4. 计算文件名与扩展名（支持 fileTemplate）
      const artists = req.track.artists?.map((a) => a.name).join(" & ") || "未知歌手";
      const title = req.track.title || "未知曲目";
      const album = req.track.album?.name || "未知专辑";
      const ext = (resolved.format || "mp3").toLowerCase();

      let baseName = template
        .replace(/\{artist\}/g, artists)
        .replace(/\{title\}/g, title)
        .replace(/\{album\}/g, album);
      baseName = sanitize(baseName) || `${sanitize(artists)} - ${sanitize(title)}`;
      let filename = `${baseName}.${ext}`;

      // 5. 解析目标下载目录句柄（支持 folderScheme: none / artist / artist-album）
      const rootDirHandle = await getStoredDownloadDirHandle(true);
      let targetDirHandle: FileSystemDirectoryHandle | null = null;

      const artistFolder = sanitize(artists) || "未知歌手";
      const albumFolder = sanitize(album) || "未知专辑";

      if (rootDirHandle) {
        try {
          if (folderScheme === "artist") {
            targetDirHandle = await rootDirHandle.getDirectoryHandle(artistFolder, {
              create: true,
            });
          } else if (folderScheme === "artist-album") {
            const artistDir = await rootDirHandle.getDirectoryHandle(artistFolder, {
              create: true,
            });
            targetDirHandle = await artistDir.getDirectoryHandle(albumFolder, {
              create: true,
            });
          } else {
            targetDirHandle = rootDirHandle;
          }
        } catch (dirErr) {
          console.warn("[WebDownloadManager] Create subfolder failed, fallback to rootDirHandle:", dirErr);
          targetDirHandle = rootDirHandle;
        }
      } else {
        // 无自定义目录句柄时（浏览器默认下载原生保存）：
        // 在文件名中直接带上智能分类前缀，确保归入歌手/专辑分组
        if (folderScheme === "artist") {
          baseName = `[${artistFolder}] ${baseName}`;
          filename = `${baseName}.${ext}`;
        } else if (folderScheme === "artist-album") {
          baseName = `[${artistFolder} - ${albumFolder}] ${baseName}`;
          filename = `${baseName}.${ext}`;
        }
      }

      // 6. 覆盖策略检查 (overwritePolicy: rename / overwrite / skip)
      let finalFilename = filename;
      let finalBaseName = baseName;

      if (targetDirHandle) {
        let exists = false;
        try {
          await targetDirHandle.getFileHandle(filename);
          exists = true;
        } catch {}

        if (exists) {
          if (overwritePolicy === "skip") {
            task.status = "done";
            task.filePath = filename;
            task.finishedAt = Date.now();
            this.emitState(task);
            return;
          } else if (overwritePolicy === "rename") {
            let counter = 1;
            while (true) {
              const candidateBase = `${baseName} (${counter})`;
              const candidateFile = `${candidateBase}.${ext}`;
              let candExists = false;
              try {
                await targetDirHandle.getFileHandle(candidateFile);
                candExists = true;
              } catch {}
              if (!candExists) {
                finalBaseName = candidateBase;
                finalFilename = candidateFile;
                break;
              }
              counter++;
            }
          }
        }
      }

      // 7. 调用后端接口进行音频流拉取及标签内嵌 (ID3v2 / FLAC tags)
      const processPayload = {
        audioUrl: resolved.url,
        format: ext,
        embedMeta,
        embedCover,
        embedLyric,
        title,
        artist: artists,
        album,
        coverUrl: req.track.coverOriginal ?? req.track.cover,
        lyrics: lrcText || undefined,
      };

      const response = await fetch("/api/download/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(processPayload),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Download process failed: HTTP ${response.status}`);
      }

      const contentLength = Number(response.headers.get("content-length")) || resolved.size || 0;
      if (contentLength > 0) task.total = contentLength;

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
      const audioBlob = new Blob(chunks as BlobPart[], { type: mimeType });

      // 8. 音频文件落盘
      let savedToHandle = false;
      if (targetDirHandle) {
        try {
          const fileHandle = await targetDirHandle.getFileHandle(finalFilename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(audioBlob);
          await writable.close();
          savedToHandle = true;
        } catch (handleErr) {
          console.warn("[WebDownloadManager] Write to targetDirHandle failed, fallback to browser:", handleErr);
        }
      }

      if (!savedToHandle) {
        triggerBrowserDownload(audioBlob, finalFilename);
      }

      // 9. 导出同名歌词文件 (.lrc / .elrc)
      if (writeLrc && lrcText) {
        const lyricExt = lyricFormat === "enhanced-lrc" ? "elrc" : "lrc";
        const lyricFilename = `${finalBaseName}.${lyricExt}`;
        const lyricBlob = new Blob([lrcText], { type: "text/plain;charset=utf-8" });

        let lrcSaved = false;
        if (targetDirHandle) {
          try {
            const fileHandle = await targetDirHandle.getFileHandle(lyricFilename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(lyricBlob);
            await writable.close();
            lrcSaved = true;
          } catch {}
        }
        if (!lrcSaved) {
          triggerBrowserDownload(lyricBlob, lyricFilename);
        }
      }

      // 10. 导出完整 TTML 歌词文件 (.ttml)
      if (saveTtml && ttmlText) {
        const ttmlFilename = `${finalBaseName}.ttml`;
        const ttmlBlob = new Blob([ttmlText], { type: "application/xml;charset=utf-8" });

        let ttmlSaved = false;
        if (targetDirHandle) {
          try {
            const fileHandle = await targetDirHandle.getFileHandle(ttmlFilename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(ttmlBlob);
            await writable.close();
            ttmlSaved = true;
          } catch {}
        }
        if (!ttmlSaved) {
          triggerBrowserDownload(ttmlBlob, ttmlFilename);
        }
      }

      // 11. 标记完成
      task.status = "done";
      task.filePath = finalFilename;
      task.received = task.total || received;
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
