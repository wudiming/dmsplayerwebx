<script setup lang="ts">
defineOptions({ name: "DiscoverArtists" });

import type { CoverItem } from "@/types/artist";
import { fetchArtistList } from "@/apis/discover/netease";
import CoverList from "@/components/list/CoverList.vue";
import STag from "@/components/ui/STag.vue";
import SLoading from "@/components/ui/SLoading.vue";

const router = useRouter();
const route = useRoute();

const artistInitials: { key: string | number; label: string }[] = [
  { key: -1, label: "热门" },
  ...Array.from({ length: 26 }, (_, i) => {
    const char = String.fromCharCode(i + 65);
    return { key: char, label: char };
  }),
  { key: 0, label: "#" },
];

const artistCategories: { label: string; type: number; area: number }[] = [
  { label: "全部", type: -1, area: -1 },
  { label: "华语男", type: 1, area: 7 },
  { label: "华语女", type: 2, area: 7 },
  { label: "华语组合", type: 3, area: 7 },
  { label: "欧美男", type: 1, area: 96 },
  { label: "欧美女", type: 2, area: 96 },
  { label: "欧美组合", type: 3, area: 96 },
  { label: "日本男", type: 1, area: 8 },
  { label: "日本女", type: 2, area: 8 },
  { label: "日本组合", type: 3, area: 8 },
  { label: "韩国男", type: 1, area: 16 },
  { label: "韩国女", type: 2, area: 16 },
  { label: "韩国组合", type: 3, area: 16 },
  { label: "其他", type: -1, area: 0 },
];

const selectedInitial = ref<string | number>(
  (route.query.initial as string) || -1,
);
const selectedCategoryIndex = ref<number>(
  Number(route.query.catIndex as string) || 0,
);

import { getArtistCache, setArtistCache } from "@/services/discoverCache";

const initialCache = getArtistCache();
const isDefaultFilter = String(selectedInitial.value) === "-1" && selectedCategoryIndex.value === 0;
const hasInitialCache = Boolean(initialCache && isDefaultFilter && initialCache.items.length > 0);

const artists = ref<CoverItem[]>(hasInitialCache ? [...initialCache!.items] : []);
const offset = ref(hasInitialCache ? initialCache!.items.length : 0);
const loading = ref(!hasInitialCache);
const loadingMore = ref(false);
const hasMore = ref(hasInitialCache ? initialCache!.more : true);

const loadData = async (isAppend = false): Promise<void> => {
  if (isAppend) {
    if (loadingMore.value || !hasMore.value) return;
    loadingMore.value = true;
  } else {
    if (artists.value.length === 0) {
      loading.value = true;
    }
    offset.value = 0;
  }

  const cat = artistCategories[selectedCategoryIndex.value] || artistCategories[0];

  try {
    const res = await fetchArtistList({
      type: cat.type,
      area: cat.area,
      initial: selectedInitial.value,
      offset: offset.value,
      limit: 40,
    });
    if (isAppend) {
      artists.value.push(...res.items);
    } else {
      artists.value = res.items;
      if (String(selectedInitial.value) === "-1" && selectedCategoryIndex.value === 0) {
        setArtistCache({
          items: res.items,
          more: res.more,
        });
      }
    }
    hasMore.value = res.more;
    offset.value += res.items.length;
  } catch (err) {
    console.error("[DiscoverArtists] loadData error:", err);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const handleInitialSelect = (key: string | number): void => {
  selectedInitial.value = key;
  router.replace({
    query: { ...route.query, initial: String(key) },
  });
  loadData(false);
};

const handleCategorySelect = (idx: number): void => {
  selectedCategoryIndex.value = idx;
  router.replace({
    query: { ...route.query, catIndex: String(idx) },
  });
  loadData(false);
};

import { useDetailModalStore } from "@/stores/detailModal";

const handleArtistClick = (item: CoverItem): void => {
  useDetailModalStore().openArtist(item.id, { source: "netease", name: item.title });
};

onMounted(() => {
  loadData(false);
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 页面标题 -->
    <div class="shrink-0 px-6 pt-5 pb-2">
      <h1 class="text-3xl font-bold text-on-surface tracking-tight">艺术家</h1>
    </div>

    <!-- 筛选面板：字母索引 + 地区类型 -->
    <div class="shrink-0 px-6 py-2 flex flex-col gap-2.5">
      <!-- 字母横向标签 -->
      <div class="flex flex-wrap items-center gap-1.5">
        <STag
          v-for="item in artistInitials"
          :key="item.key"
          round
          size="small"
          :type="String(item.key) === String(selectedInitial) ? 'primary' : 'default'"
          class="cursor-pointer min-w-6 text-center hover:opacity-85 transition-opacity px-2"
          @click="handleInitialSelect(item.key)"
        >
          {{ item.label }}
        </STag>
      </div>

      <!-- 地区与性别类型 -->
      <div class="flex flex-wrap items-center gap-2">
        <STag
          v-for="(cat, idx) in artistCategories"
          :key="cat.label"
          round
          size="medium"
          :type="idx === selectedCategoryIndex ? 'primary' : 'default'"
          class="cursor-pointer hover:opacity-85 transition-opacity px-3"
          @click="handleCategorySelect(idx)"
        >
          {{ cat.label }}
        </STag>
      </div>
    </div>

    <!-- 歌手头像网格列表 -->
    <div class="flex-1 min-h-0 relative">
      <div v-if="loading && artists.length === 0" class="h-full flex items-center justify-center">
        <SLoading class="size-8 text-primary" />
      </div>
      <CoverList
        v-else
        :items="artists"
        type="artist"
        :virtual="true"
        :padding-x="24"
        :padding-top="12"
        :padding-bottom="32"
        :has-more="hasMore"
        :loading-more="loadingMore"
        @reach-bottom="loadData(true)"
        @click="handleArtistClick"
      />
    </div>
  </div>
</template>
