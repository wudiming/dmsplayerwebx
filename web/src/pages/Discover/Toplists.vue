<script setup lang="ts">
defineOptions({ name: "DiscoverToplists" });

import type { CoverItem } from "@/types/artist";
import { fetchToplists, type ToplistItem } from "@/apis/discover/netease";
import CoverList from "@/components/list/CoverList.vue";
import SLoading from "@/components/ui/SLoading.vue";
import IconLucidePlay from "~icons/lucide/play";

const router = useRouter();

import { getToplistCache, setToplistCache } from "@/services/discoverCache";

const initialCache = getToplistCache();
const hasInitialCache = Boolean(
  initialCache &&
  ((initialCache.official && initialCache.official.length > 0) ||
   (initialCache.selected && initialCache.selected.length > 0))
);

const loading = ref(!hasInitialCache);
const officialList = ref<ToplistItem[]>(hasInitialCache ? [...initialCache!.official] : []);
const selectedList = ref<CoverItem[]>(hasInitialCache ? [...initialCache!.selected] : []);

const loadData = async (): Promise<void> => {
  if (officialList.value.length === 0 && selectedList.value.length === 0) {
    loading.value = true;
  }
  try {
    const res = await fetchToplists();
    officialList.value = res.official;
    selectedList.value = res.selected;
    setToplistCache({
      official: res.official,
      selected: res.selected,
    });
  } catch (err) {
    console.error("[DiscoverToplists] loadData error:", err);
  } finally {
    loading.value = false;
  }
};

import { useDetailModalStore } from "@/stores/detailModal";

const handlePlaylistClick = (id: string, name?: string): void => {
  useDetailModalStore().openPlaylist(id, { source: "netease", name });
};

onMounted(loadData);
</script>

<template>
  <div class="h-full overflow-y-auto px-6 pb-12 w-full">
    <!-- 页面标题 -->
    <div class="shrink-0 pt-5 pb-3">
      <h1 class="text-3xl font-bold text-on-surface tracking-tight">排行榜</h1>
    </div>

    <div v-if="loading && officialList.length === 0" class="h-96 flex items-center justify-center">
      <SLoading class="size-8 text-primary" />
    </div>

    <div v-else class="w-full flex flex-col gap-6 pt-1">
      <!-- 官方榜分区 -->
      <section v-if="officialList.length > 0">
        <div class="flex items-center gap-3 mb-4">
          <h2 class="text-xl font-bold text-on-surface">官方榜</h2>
          <div class="h-px flex-1 bg-primary/10" />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4 w-full">
          <div
            v-for="chart in officialList"
            :key="chart.id"
            class="group relative flex items-center gap-4 p-3.5 rounded-2xl bg-surface-panel border border-solid border-primary/10 hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden"
            @click="handlePlaylistClick(chart.id, chart.name)"
          >
            <!-- 榜单封面 -->
            <div class="relative size-32 shrink-0 rounded-xl overflow-hidden bg-on-surface/5">
              <img
                :src="chart.cover"
                :alt="chart.name"
                class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div class="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                <div class="size-11 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
                  <IconLucidePlay class="size-5 ml-0.5" />
                </div>
              </div>
            </div>

            <!-- 榜单信息与前三首歌曲 -->
            <div class="flex-1 min-w-0 flex flex-col justify-between py-1 h-32">
              <div class="flex items-baseline justify-between gap-2">
                <h3 class="font-bold text-base text-on-surface truncate group-hover:text-primary transition-colors">
                  {{ chart.name }}
                </h3>
                <span v-if="chart.updateFrequency" class="text-xs text-on-surface-variant/50 shrink-0">
                  {{ chart.updateFrequency }}
                </span>
              </div>

              <!-- Top 3 单曲预览 -->
              <div class="flex flex-col gap-1.5 my-auto">
                <div
                  v-for="(track, idx) in chart.tracks"
                  :key="idx"
                  class="flex items-center text-xs truncate leading-snug"
                >
                  <span class="font-semibold text-primary/90 w-4.5 shrink-0">{{ idx + 1 }}.</span>
                  <span class="text-on-surface font-medium truncate mr-1.5">{{ track.first }}</span>
                  <span class="text-on-surface-variant/50 truncate">- {{ track.second }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 精选榜分区 -->
      <section v-if="selectedList.length > 0" class="mt-2">
        <div class="flex items-center gap-3 mb-3">
          <h2 class="text-xl font-bold text-on-surface">精选榜</h2>
          <div class="h-px flex-1 bg-primary/10" />
        </div>

        <CoverList
          :items="selectedList"
          :virtual="false"
          :min-size="150"
          :gap="16"
          @click="(item) => handlePlaylistClick(item.id, item.title)"
        />
      </section>
    </div>
  </div>
</template>
