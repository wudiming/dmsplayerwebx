import type { TrackSource } from "@shared/types/player";
import type { CollectionType } from "@/types/collection";

export type DetailTarget =
  | {
      kind: "collection";
      source: TrackSource;
      type: CollectionType;
      id: string;
      name?: string;
    }
  | {
      kind: "artist";
      source: TrackSource;
      id: string;
      name?: string;
    }
  | {
      kind: "daily";
    };

export const useDetailModalStore = defineStore("detailModal", () => {
  const isOpen = ref(false);
  const stack = ref<DetailTarget[]>([]);

  const currentTarget = computed<DetailTarget | null>(() => {
    return stack.value.length > 0 ? stack.value[stack.value.length - 1] : null;
  });

  const canBack = computed(() => stack.value.length > 1);

  const targetKey = computed(() => {
    const target = currentTarget.value;
    if (!target) return "";
    if (target.kind === "collection") {
      return `col:${target.source}:${target.type}:${target.id}`;
    }
    if (target.kind === "artist") {
      return `art:${target.source}:${target.id}`;
    }
    return "daily";
  });

  const isSameTarget = (a: DetailTarget, b: DetailTarget): boolean => {
    if (a.kind !== b.kind) return false;
    if (a.kind === "collection" && b.kind === "collection") {
      return a.source === b.source && a.type === b.type && a.id === b.id;
    }
    if (a.kind === "artist" && b.kind === "artist") {
      return a.source === b.source && a.id === b.id;
    }
    return a.kind === "daily" && b.kind === "daily";
  };

  /** 打开详情：若弹窗已打开则入栈，否则重置栈并打开 */
  const open = (target: DetailTarget, forceReset = false): void => {
    if (!isOpen.value || forceReset || stack.value.length === 0) {
      stack.value = [target];
    } else {
      const top = stack.value[stack.value.length - 1];
      if (top && isSameTarget(top, target)) {
        // 同一目标不重复追加
        isOpen.value = true;
        return;
      }
      stack.value.push(target);
    }
    isOpen.value = true;
  };

  /** 入栈（下钻浏览） */
  const push = (target: DetailTarget): void => {
    if (!isOpen.value || stack.value.length === 0) {
      open(target);
      return;
    }
    const top = stack.value[stack.value.length - 1];
    if (top && isSameTarget(top, target)) return;
    stack.value.push(target);
    isOpen.value = true;
  };

  /** 回退一层 */
  const back = (): void => {
    if (stack.value.length > 1) {
      stack.value.pop();
    } else {
      close();
    }
  };

  /** 关闭弹窗并清空栈 */
  const close = (): void => {
    isOpen.value = false;
    stack.value = [];
  };

  /** 快捷方法：打开歌单 */
  const openPlaylist = (
    playlistId: string,
    options: { source?: TrackSource; name?: string; push?: boolean } = {},
  ): void => {
    const target: DetailTarget = {
      kind: "collection",
      source: options.source ?? "netease",
      type: "playlist",
      id: playlistId,
      name: options.name,
    };
    if (options.push) push(target);
    else open(target);
  };

  /** 快捷方法：打开专辑 */
  const openAlbum = (
    albumId: string,
    options: { source?: TrackSource; name?: string; push?: boolean } = {},
  ): void => {
    const target: DetailTarget = {
      kind: "collection",
      source: options.source ?? "netease",
      type: "album",
      id: albumId,
      name: options.name,
    };
    if (options.push) push(target);
    else open(target);
  };

  /** 快捷方法：打开歌手 */
  const openArtist = (
    artistId: string,
    options: { source?: TrackSource; name?: string; push?: boolean } = {},
  ): void => {
    const target: DetailTarget = {
      kind: "artist",
      source: options.source ?? "netease",
      id: artistId,
      name: options.name,
    };
    if (options.push) push(target);
    else open(target);
  };

  /** 快捷方法：打开每日推荐 */
  const openDaily = (pushTarget = false): void => {
    const target: DetailTarget = { kind: "daily" };
    if (pushTarget) push(target);
    else open(target);
  };

  /** 快捷方法：打开播客/电台 */
  const openRadio = (
    radioId: string,
    options: { source?: TrackSource; name?: string; push?: boolean } = {},
  ): void => {
    const target: DetailTarget = {
      kind: "collection",
      source: options.source ?? "netease",
      type: "radio",
      id: radioId,
      name: options.name,
    };
    if (options.push) push(target);
    else open(target);
  };

  return {
    isOpen,
    stack,
    currentTarget,
    canBack,
    targetKey,
    open,
    push,
    back,
    close,
    openPlaylist,
    openAlbum,
    openArtist,
    openDaily,
    openRadio,
  };
});
