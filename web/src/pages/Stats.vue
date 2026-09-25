<script setup lang="ts">
defineOptions({ name: "Stats" });

import type {
  DailyPlayStats,
  HourlyPlayStats,
  LibraryStats,
  PlayStatsSummary,
  TopAlbum,
  TopArtist,
  TopTrack,
} from "@shared/types/stats";
import { useFloatingPlayerBar } from "@/composables/useFloatingPlayerBar";

const { isFloatingBar } = useFloatingPlayerBar();

const libraryStats = ref<LibraryStats | null>(null);
const summaryStats = ref<PlayStatsSummary | null>(null);
const daily = ref<DailyPlayStats[]>([]);
const hourly = ref<HourlyPlayStats[]>([]);
const topSongs = shallowRef<TopTrack[]>([]);
const topAlbums = shallowRef<TopAlbum[]>([]);
const topArtists = shallowRef<TopArtist[]>([]);
const loading = ref(true);

const refreshStats = async (): Promise<void> => {
  try {
    const [library, summary, history, hourlyHistory, songs, albums, artists] = await Promise.all([
      window.api.stats.getLibraryStats(),
      window.api.stats.getStatsSummary().catch(() => null),
      window.api.stats.getPlayHistoryDaily(365),
      window.api.stats.getPlayHistoryHourly(),
      window.api.stats.getTopTracks(10),
      window.api.stats.getTopAlbums(10),
      window.api.stats.getTopArtists(10),
    ]);
    libraryStats.value = library;
    summaryStats.value = summary;
    daily.value = history;
    hourly.value = hourlyHistory;
    topSongs.value = songs;
    topAlbums.value = albums;
    topArtists.value = artists;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void refreshStats();

  let timer: number | null = null;
  const debouncedRefresh = (): void => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void refreshStats();
    }, 300);
  };

  window.addEventListener("splayer:stats-changed", debouncedRefresh);
  const onVisibility = (): void => {
    if (document.visibilityState === "visible") void refreshStats();
  };
  document.addEventListener("visibilitychange", onVisibility);

  onUnmounted(() => {
    if (timer) window.clearTimeout(timer);
    window.removeEventListener("splayer:stats-changed", debouncedRefresh);
    document.removeEventListener("visibilitychange", onVisibility);
  });
});
</script>

<template>
  <div class="h-full overflow-y-auto [scrollbar-gutter:stable]">
    <div
      class="w-full flex flex-col gap-5 px-5 pt-2"
      :class="isFloatingBar ? 'pb-28' : 'pb-10'"
    >
      <!-- 曲库概览 (3列对位) -->
      <StatsOverview :stats="libraryStats" :summary="summaryStats" />
      <!-- 聆听足迹、播放时段与音质构成 (3列对位) -->
      <StatsHeatmap :daily="daily" :hourly="hourly" :stats="libraryStats" :loading="loading" />
      <!-- 最常听榜单 Top 10 (3列对位，1-3突出，4-10常规，左右对位) -->
      <StatsTopList
        :songs="topSongs"
        :albums="topAlbums"
        :artists="topArtists"
        :loading="loading"
      />
    </div>
  </div>
</template>
