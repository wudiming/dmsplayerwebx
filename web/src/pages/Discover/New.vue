<script setup lang="ts">
defineOptions({ name: "DiscoverNew" });

import type { CoverItem } from "@/types/artist";
import type { Track } from "@shared/types/player";
import { fetchNewAlbums, fetchNewSongs } from "@/apis/discover/netease";
import { songsToTracks } from "@/utils/format/netease";
import CoverList from "@/components/list/CoverList.vue";
import SongList from "@/components/list/SongList.vue";
import STabs from "@/components/ui/STabs.vue";
import STag from "@/components/ui/STag.vue";
import SLoading from "@/components/ui/SLoading.vue";

const router = useRouter();
const route = useRoute();

const typeTabs = [
  { key: "albums", label: "新碟上架" },
  { key: "songs", label: "新歌速递" },
];

const areaOptions = [
  { label: "全部", albumArea: "ALL", songArea: 0 },
  { label: "华语", albumArea: "ZH", songArea: 7 },
  { label: "欧美", albumArea: "EA", songArea: 96 },
  { label: "韩国", albumArea: "KR", songArea: 16 },
  { label: "日本", albumArea: "JP", songArea: 8 },
];

const activeType = ref<string>((route.query.type as string) || "albums");
const activeAreaIdx = ref<number>(Number(route.query.area as string) || 0);

const albums = ref<CoverItem[]>([]);
const songs = ref<Track[]>([]);
const offset = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(true);

const loadData = async (isAppend = false): Promise<void> => {
  if (isAppend) {
    if (loadingMore.value || !hasMore.value) return;
    loadingMore.value = true;
  } else {
    loading.value = true;
    offset.value = 0;
  }

  const area = areaOptions[activeAreaIdx.value] || areaOptions[0];

  try {
    if (activeType.value === "albums") {
      const res = await fetchNewAlbums({
        area: area.albumArea,
        limit: 40,
        offset: offset.value,
      });
      if (isAppend) {
        albums.value.push(...res.items);
      } else {
        albums.value = res.items;
      }
      hasMore.value = res.more;
      offset.value += res.items.length;
    } else {
      const rawSongs = await fetchNewSongs(area.songArea);
      songs.value = songsToTracks(rawSongs);
      hasMore.value = false;
    }
  } catch (err) {
    console.error("[DiscoverNew] loadData error:", err);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const handleTypeChange = (key: string): void => {
  activeType.value = key;
  router.replace({
    query: { ...route.query, type: key },
  });
  loadData(false);
};

const handleAreaSelect = (idx: number): void => {
  activeAreaIdx.value = idx;
  router.replace({
    query: { ...route.query, area: String(idx) },
  });
  loadData(false);
};

import { useDetailModalStore } from "@/stores/detailModal";

const handleAlbumClick = (item: CoverItem): void => {
  useDetailModalStore().openAlbum(item.id, { source: "netease", name: item.title });
};

onMounted(() => {
  loadData(false);
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 页面标题 -->
    <div class="shrink-0 px-6 pt-5 pb-2">
      <h1 class="text-3xl font-bold text-on-surface tracking-tight">最新音乐</h1>
    </div>

    <!-- 筛选工具栏：新碟/新歌切换 + 地区标签 -->
    <div class="shrink-0 px-6 py-2 flex items-center justify-between gap-4">
      <div class="w-48">
        <STabs
          :model-value="activeType"
          :tabs="typeTabs"
          type="segment"
          round
          size="medium"
          @update:model-value="handleTypeChange"
        />
      </div>

      <div class="flex items-center gap-2">
        <STag
          v-for="(area, idx) in areaOptions"
          :key="area.label"
          round
          size="medium"
          :type="idx === activeAreaIdx ? 'primary' : 'default'"
          class="cursor-pointer hover:opacity-85 transition-opacity px-3"
          @click="handleAreaSelect(idx)"
        >
          {{ area.label }}
        </STag>
      </div>
    </div>

    <!-- 列表展示区 -->
    <div class="flex-1 min-h-0 relative">
      <div v-if="loading && albums.length === 0 && songs.length === 0" class="h-full flex items-center justify-center">
        <SLoading class="size-8 text-primary" />
      </div>

      <!-- 新碟上架：CoverList 网格 -->
      <CoverList
        v-else-if="activeType === 'albums'"
        :items="albums"
        :virtual="true"
        :padding-x="24"
        :padding-top="8"
        :padding-bottom="32"
        :has-more="hasMore"
        :loading-more="loadingMore"
        @reach-bottom="loadData(true)"
        @click="handleAlbumClick"
      />

      <!-- 新歌速递：SongList 单曲列表 -->
      <div v-else class="h-full px-6 pb-8">
        <SongList
          :items="songs"
          source="netease"
          :can-remove="false"
          :show-album="true"
          :show-duration="true"
          :show-index="true"
        />
      </div>
    </div>
  </div>
</template>
