import type { Track } from "@shared/types/player";
import type { DownloadRequest, DownloadTagOptions, DownloadTask } from "@shared/types/download";
import { QUALITY_LABELS, type QualityLevel } from "@/utils/quality";
import { useSettingsStore } from "@/stores/settings";
import { toast } from "@/composables/useToast";
import {
  getStoredDownloadDirHandle,
  setStoredDownloadDirHandle,
} from "@/services/download/downloadDirStorage";

/** 下载选项 */
interface EnqueueOptions {
  /** 临时音质，覆盖设置 */
  quality?: QualityLevel;
  /** 复用已有任务 id（重试） */
  taskId?: string;
}

/** 可下载音质档位（展示顺序） */
const DOWNLOAD_QUALITY_LEVELS: QualityLevel[] = ["hi-res", "lossless", "hq", "sq", "lq"];

/**
 * 构建下载音质菜单项
 * @param defaultLabel - 「跟随默认」项文案
 * @param keyPrefix - key 前缀；右键菜单用 "download:" 做路由，空音质表示默认
 */
export const buildDownloadQualityItems = (
  defaultLabel: string,
  keyPrefix = "",
): { key: string; label: string }[] => [
  { key: keyPrefix, label: defaultLabel },
  ...DOWNLOAD_QUALITY_LEVELS.map((quality) => ({
    key: `${keyPrefix}${quality}`,
    label: QUALITY_LABELS[quality],
  })),
];

export const useDownload = () => {
  const { t } = useI18n();

  /** 若开启了文件智能分类，检查或引导用户选择一次目标文件夹 */
  const ensureDownloadDirIfCategorized = async (
    folderScheme: string | undefined,
  ): Promise<void> => {
    if (!folderScheme || folderScheme === "none") return;
    if (typeof window === "undefined" || !("showDirectoryPicker" in window)) return;
    try {
      const existing = await getStoredDownloadDirHandle(true);
      if (!existing) {
        toast.info("已开启文件智能分类，请选择用于保存音乐的文件夹");
        const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
        if (handle) {
          await setStoredDownloadDirHandle(handle);
          toast.success(`已设置下载目录为 [${handle.name}]，将自动在其中创建歌手/专辑子目录`);
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (err?.name === "SecurityError" || String(err?.message || "").includes("sensitive")) {
        toast.warning("浏览器安全限制禁止直接选择系统“下载”根目录，您可以在其中新建子文件夹（如“音乐”）后再选择");
      } else {
        console.warn("[useDownload] Directory picker error:", err);
      }
    }
  };

  /**
   * 构建不含网络解析的下载请求
   * @returns 本地曲目返回 null
   */
  const prepareRequest = (track: Track, opts: EnqueueOptions): DownloadRequest | null => {
    if (track.source === "local") return null;
    const download = useSettingsStore().system.download;
    const level = opts.quality ?? download.quality;
    const tagOptions: DownloadTagOptions = {
      embedCover: download.embedCover,
      embedMeta: download.embedMeta,
      embedLyric: download.embedLyric,
      writeLrc: download.writeLrc,
      saveTtml: download.saveTtml,
    };
    return {
      taskId: opts.taskId ?? crypto.randomUUID(),
      track,
      qualityLevel: level,
      coverUrl: track.coverOriginal ?? track.cover,
      tagOptions,
      usePlaybackForDownload: download.usePlaybackForDownload,
      lyricFileFormat: download.lyricFileFormat,
      folderScheme: download.folderScheme,
      fileTemplate: download.fileTemplate,
      overwritePolicy: download.overwritePolicy,
    };
  };

  /**
   * 单曲下载（不等待完成）
   * @returns 是否成功入队
   */
  const enqueue = async (track: Track, opts: EnqueueOptions = {}): Promise<boolean> => {
    const download = useSettingsStore().system.download;
    await ensureDownloadDirIfCategorized(download.folderScheme);

    const req = prepareRequest(track, opts);
    if (!req) return false;
    const res = opts.taskId
      ? await window.api.download.retry(req)
      : await window.api.download.start(req);
    if (!res.ok) {
      toast.warning(
        res.reason === "downloaded" ? t("download.alreadyDownloaded") : t("download.alreadyQueued"),
      );
      return false;
    }
    if (opts.taskId === undefined) toast.success(t("download.started", { title: track.title }));
    return true;
  };

  /** 批量下载 */
  const enqueueMany = async (tracks: Track[]): Promise<void> => {
    const download = useSettingsStore().system.download;
    await ensureDownloadDirIfCategorized(download.folderScheme);

    const requests = tracks
      .map((track) => prepareRequest(track, {}))
      .filter((req): req is DownloadRequest => req !== null);
    const results = await window.api.download.startMany(requests).catch(() => []);
    const count = results.filter((result) => result?.ok).length;
    if (count > 0) toast.success(t("download.enqueued", { count }));
  };

  /** 重试：用任务保存的完整 Track 重新入队（复用 taskId） */
  const retry = (task: DownloadTask): Promise<boolean> =>
    enqueue(task.track, { quality: task.qualityLevel, taskId: task.taskId });

  return { enqueue, enqueueMany, retry };
};
