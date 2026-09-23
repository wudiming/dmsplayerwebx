<script setup lang="ts">
import type { Component } from "vue";
import type { Track } from "@shared/types/player";
import type { TopAlbum, TopArtist, TopTrack } from "@shared/types/stats";
import * as player from "@/core/player";
import { navigateToAlbum, navigateToArtist } from "@/utils/navigate";
import { formatCompact } from "@/utils/format";
import { useLibraryStore } from "@/stores/library";
import IconLucideMusic from "~icons/lucide/music";
import IconLucideDisc3 from "~icons/lucide/disc-3";
import IconLucideMic2 from "~icons/lucide/mic-2";

/** 榜单卡片内的排行项 */
interface RankItem {
  /** 封面 */
  cover?: string;
  /** 标题 */
  title: string;
  /** 辅助信息 */
  subtitle?: string;
  /** 累计播放次数 */
  plays: number;
  /** 代表曲目 */
  track: Track;
  /** 在线平台歌手 ID */
  artistId?: string;
}

interface RankSection {
  id: "songs" | "albums" | "artists";
  title: string;
  icon: Component;
  circle: boolean;
  items: RankItem[];
  onClick: (item: RankItem) => void;
}

const props = defineProps<{
  /** 最常听的歌曲 */
  songs: TopTrack[];
  /** 最常听的专辑 */
  albums: TopAlbum[];
  /** 最常听的歌手 */
  artists: TopArtist[];
  /** 数据是否仍在加载 */
  loading: boolean;
}>();

const { t, locale } = useI18n();
const libraryStore = useLibraryStore();

/** 歌曲榜：严格限制 Top 10 */
const songItems = computed<RankItem[]>(() =>
  props.songs.slice(0, 10).map((item) => ({
    cover: item.track.cover,
    title: item.track.title,
    subtitle: item.track.artists.map((artist) => artist.name).join(" / "),
    plays: item.playCount,
    track: item.track,
  })),
);

/** 专辑榜：严格限制 Top 10 */
const albumItems = computed<RankItem[]>(() =>
  props.albums.slice(0, 10).map((item) => ({
    cover: item.track.album?.cover ?? item.track.cover,
    title: item.track.album?.name ?? item.track.title,
    subtitle: item.track.artists.map((artist) => artist.name).join(" / "),
    plays: item.playCount,
    track: item.track,
  })),
);

/** 歌手榜：严格限制 Top 10，提供代表作副标题以保持与歌曲/专辑对位排版一致 */
const artistItems = computed<RankItem[]>(() =>
  props.artists.slice(0, 10).map((item) => ({
    cover:
      item.track.source === "local"
        ? (libraryStore.getArtistAvatar(item.artist.name) ?? item.artist.avatar ?? item.track.cover)
        : (item.artist.avatar ?? item.track.cover),
    title: item.artist.name,
    subtitle: item.track?.title ? `代表作: ${item.track.title}` : t("stats.artists"),
    plays: item.playCount,
    track: item.track,
    artistId: item.artist.id,
  })),
);

/** 三类榜单配置 */
const sections = computed<RankSection[]>(() => [
  {
    id: "songs",
    title: t("stats.topSongs"),
    icon: IconLucideMusic,
    circle: false,
    items: songItems.value,
    onClick: (item) => playSong(item.track),
  },
  {
    id: "albums",
    title: t("stats.topAlbums"),
    icon: IconLucideDisc3,
    circle: false,
    items: albumItems.value,
    onClick: (item) =>
      navigateToAlbum(item.title, {
        source: item.track.source,
        albumId: item.track.album?.id,
      }),
  },
  {
    id: "artists",
    title: t("stats.topArtists"),
    icon: IconLucideMic2,
    circle: true,
    items: artistItems.value,
    onClick: (item) =>
      navigateToArtist(item.title, {
        source: item.track.source,
        artistId: item.artistId,
      }),
  },
]);

/**
 * 紧凑播放次数数字
 * @param plays - 累计播放次数
 * @returns 如 `1.2万`
 */
const playCountText = (plays: number): string => formatCompact(plays, locale.value);

/**
 * 立即播放榜单歌曲
 * @param track - 曲目
 */
const playSong = (track: Track): void => {
  void player.playNow(track);
};
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
    <SCard
      v-for="section in sections"
      :key="section.id"
      radius="xl"
      size="small"
      class="overflow-hidden [&>div:first-child]:py-3.5 [&>div:last-child]:pb-3.5"
    >
      <template #header>
        <div class="flex items-center gap-3">
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary"
          >
            <component :is="section.icon" class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="truncate text-base font-semibold text-on-surface">
              {{ section.title }}
            </h3>
            <p class="text-xs font-semibold text-on-surface-variant/45">
              TOP {{ loading ? "--" : section.items.length }}
            </p>
          </div>
        </div>
      </template>

      <div v-if="loading" class="flex min-h-96 items-center justify-center">
        <SLoading class="size-6 text-primary/60" />
      </div>

      <div v-else-if="section.items.length > 0" class="flex flex-col">
        <!-- 突出显示：前 3 名 (金、银、铜徽章，专属高亮背景，严格横向平齐) -->
        <div class="flex flex-col gap-2">
          <!-- TOP 1 (金) -->
          <div
            v-if="section.items[0]"
            class="h-[54px] rounded-xl px-2.5 flex items-center gap-3 bg-amber-500/[0.08] hover:bg-amber-500/[0.14] border border-amber-500/25 transition-colors duration-150 cursor-pointer group"
            @click="section.onClick(section.items[0])"
          >
            <div
              class="size-6 shrink-0 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white font-bold text-xs flex items-center justify-center shadow-xs shadow-amber-500/30 select-none"
            >
              1
            </div>
            <SImg
              :src="section.items[0].cover"
              :alt="section.items[0].title"
              class="size-10 shrink-0 ring-1 ring-amber-500/30"
              :class="section.circle ? 'rounded-full' : 'rounded-lg'"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-bold text-on-surface">
                {{ section.items[0].title }}
              </div>
              <div class="truncate text-xs text-on-surface-variant/65">
                {{ section.items[0].subtitle }}
              </div>
            </div>
            <div class="shrink-0 text-right tabular-nums">
              <span class="text-base font-bold text-amber-600 dark:text-amber-400">
                {{ playCountText(section.items[0].plays) }}
              </span>
              <span class="text-[10px] text-on-surface-variant/50 ml-0.5">
                {{ t("stats.playsUnit") }}
              </span>
            </div>
          </div>

          <!-- TOP 2 (银) -->
          <div
            v-if="section.items[1]"
            class="h-[54px] rounded-xl px-2.5 flex items-center gap-3 bg-slate-400/[0.08] hover:bg-slate-400/[0.14] border border-slate-400/25 transition-colors duration-150 cursor-pointer group"
            @click="section.onClick(section.items[1])"
          >
            <div
              class="size-6 shrink-0 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 text-white font-bold text-xs flex items-center justify-center shadow-xs shadow-slate-500/30 select-none"
            >
              2
            </div>
            <SImg
              :src="section.items[1].cover"
              :alt="section.items[1].title"
              class="size-10 shrink-0 ring-1 ring-slate-400/30"
              :class="section.circle ? 'rounded-full' : 'rounded-lg'"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-on-surface">
                {{ section.items[1].title }}
              </div>
              <div class="truncate text-xs text-on-surface-variant/65">
                {{ section.items[1].subtitle }}
              </div>
            </div>
            <div class="shrink-0 text-right tabular-nums">
              <span class="text-base font-bold text-slate-700 dark:text-slate-300">
                {{ playCountText(section.items[1].plays) }}
              </span>
              <span class="text-[10px] text-on-surface-variant/50 ml-0.5">
                {{ t("stats.playsUnit") }}
              </span>
            </div>
          </div>

          <!-- TOP 3 (铜) -->
          <div
            v-if="section.items[2]"
            class="h-[54px] rounded-xl px-2.5 flex items-center gap-3 bg-orange-600/[0.07] hover:bg-orange-600/[0.13] border border-orange-600/25 transition-colors duration-150 cursor-pointer group"
            @click="section.onClick(section.items[2])"
          >
            <div
              class="size-6 shrink-0 rounded-full bg-gradient-to-br from-amber-600 to-orange-700 text-white font-bold text-xs flex items-center justify-center shadow-xs shadow-orange-600/30 select-none"
            >
              3
            </div>
            <SImg
              :src="section.items[2].cover"
              :alt="section.items[2].title"
              class="size-10 shrink-0 ring-1 ring-orange-600/30"
              :class="section.circle ? 'rounded-full' : 'rounded-lg'"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-on-surface">
                {{ section.items[2].title }}
              </div>
              <div class="truncate text-xs text-on-surface-variant/65">
                {{ section.items[2].subtitle }}
              </div>
            </div>
            <div class="shrink-0 text-right tabular-nums">
              <span class="text-base font-bold text-orange-600 dark:text-orange-400">
                {{ playCountText(section.items[2].plays) }}
              </span>
              <span class="text-[10px] text-on-surface-variant/50 ml-0.5">
                {{ t("stats.playsUnit") }}
              </span>
            </div>
          </div>
        </div>

        <!-- 分割线：区分前 3 名与后续名次 -->
        <div v-if="section.items.length > 3" class="my-2 h-px bg-on-surface/8" />

        <!-- 常规显示：第 4 至 10 名 (统一 42px 高度，严格横向水平对位) -->
        <div v-if="section.items.length > 3" class="flex flex-col gap-1.5">
          <div
            v-for="(item, index) in section.items.slice(3)"
            :key="`${item.title}-${index}`"
            class="h-[42px] rounded-lg px-2 flex items-center gap-2.5 transition-colors duration-150 hover:bg-on-surface/6 cursor-pointer group"
            @click="section.onClick(item)"
          >
            <span
              class="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-on-surface-variant/40 group-hover:text-primary transition-colors select-none"
            >
              {{ String(index + 4).padStart(2, "0") }}
            </span>
            <SImg
              :src="item.cover"
              :alt="item.title"
              class="size-8 shrink-0 ring-1 ring-black/5 dark:ring-white/5"
              :class="section.circle ? 'rounded-full' : 'rounded-md'"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-xs font-medium text-on-surface">
                {{ item.title }}
              </div>
              <div class="truncate text-[11px] text-on-surface-variant/50">
                {{ item.subtitle }}
              </div>
            </div>
            <div class="shrink-0 text-right tabular-nums">
              <span class="text-xs font-semibold text-on-surface-variant/75">
                {{ playCountText(item.plays) }}
              </span>
              <span class="text-[10px] text-on-surface-variant/40 ml-0.5">
                {{ t("stats.playsUnit") }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else
        class="flex min-h-96 flex-col items-center justify-center gap-2 rounded-2xl bg-on-surface/3 text-on-surface-variant/40"
      >
        <component :is="section.icon" class="size-7" />
        <span class="text-sm">{{ t("stats.noData") }}</span>
      </div>
    </SCard>
  </div>
</template>
