<script setup lang="ts">
defineOptions({ name: "DiscoverPlaylists" });

import type { CoverItem } from "@/types/artist";
import {
  fetchTopPlaylists,
  fetchPlaylistCatlist,
  type PlaylistCategoryGroup,
} from "@/apis/discover/netease";
import CoverList from "@/components/list/CoverList.vue";
import SLoading from "@/components/ui/SLoading.vue";
import STabs from "@/components/ui/STabs.vue";
import STag from "@/components/ui/STag.vue";
import SDialog from "@/components/ui/SDialog.vue";
import IconLucideChevronUp from "~icons/lucide/chevron-up";
import IconLucideChevronDown from "~icons/lucide/chevron-down";
import { useDetailModalStore } from "@/stores/detailModal";

const router = useRouter();
const route = useRoute();

const typeTabs = [
  { key: "recommend", label: "推荐歌单" },
  { key: "highquality", label: "精品歌单" },
];

const activeType = ref<string>((route.query.type as string) || "recommend");
const currentCat = ref<string>((route.query.cat as string) || "全部");

const quickCategories = [
  "全部",
  "华语",
  "欧美",
  "流行",
  "摇滚",
  "民谣",
  "电子",
  "轻音乐",
  "ACG",
  "说唱",
];

const showAllCatModal = ref(false);
const categoryGroups = ref<PlaylistCategoryGroup[]>([]);

const playlists = ref<CoverItem[]>([]);
const offset = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(true);

const coverListRef = ref<InstanceType<typeof CoverList> | null>(null);
const showBackTop = ref(false);

const loadCategories = async (): Promise<void> => {
  try {
    const data = await fetchPlaylistCatlist();
    categoryGroups.value = data.groups;
  } catch (err) {
    console.warn("[DiscoverPlaylists] loadCategories error:", err);
  }
};

const loadData = async (isAppend = false): Promise<void> => {
  if (isAppend) {
    if (loadingMore.value || !hasMore.value) return;
    loadingMore.value = true;
  } else {
    loading.value = true;
    offset.value = 0;
  }

  const isHq = activeType.value === "highquality";

  try {
    const res = await fetchTopPlaylists({
      cat: currentCat.value,
      limit: 36,
      offset: offset.value,
      hq: isHq,
    });
    if (isAppend) {
      playlists.value.push(...res.items);
    } else {
      playlists.value = res.items;
    }
    hasMore.value = res.more;
    offset.value += res.items.length;
  } catch (err) {
    console.error("[DiscoverPlaylists] loadData error:", err);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const handleTypeChange = (key: string): void => {
  activeType.value = key;
  router.replace({
    query: { ...route.query, type: key, cat: currentCat.value },
  });
  loadData(false);
};

const handleCatSelect = (catName: string): void => {
  currentCat.value = catName;
  router.replace({
    query: { ...route.query, cat: catName },
  });
  loadData(false);
};

const handleDialogCatSelect = (catName: string): void => {
  showAllCatModal.value = false;
  handleCatSelect(catName);
};

const handleScroll = (e: Event): void => {
  const target = e.target as HTMLElement;
  showBackTop.value = (target?.scrollTop ?? 0) > 200;
};

const scrollToTop = (): void => {
  coverListRef.value?.scrollToTop("smooth");
};

const handlePlaylistClick = (item: CoverItem): void => {
  useDetailModalStore().openPlaylist(item.id, { source: "netease", name: item.title });
};

onMounted(async () => {
  await loadCategories();
  void loadData(false);
});
</script>

<template>
  <div class="h-full flex flex-col relative w-full">
    <!-- 页面标题 -->
    <div class="shrink-0 px-6 pt-5 pb-2">
      <h1 class="text-3xl font-bold text-on-surface tracking-tight">音乐库</h1>
    </div>

    <!-- 筛选工具栏：左侧分类标签（参考最新音乐风格的 STag 单行布局），右侧推荐/精品歌单切换 -->
    <div class="shrink-0 px-6 py-2 flex items-center justify-between gap-4">
      <!-- 左侧：分类 STag 标签组 -->
      <div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0">
        <STag
          v-for="cat in quickCategories"
          :key="cat"
          round
          size="medium"
          :type="currentCat === cat ? 'primary' : 'default'"
          class="cursor-pointer hover:opacity-85 transition-opacity px-3 shrink-0"
          @click="handleCatSelect(cat)"
        >
          {{ cat }}
        </STag>

        <!-- 更多分类按钮（与 STag 统一风格） -->
        <STag
          round
          size="medium"
          :type="!quickCategories.includes(currentCat) ? 'primary' : 'default'"
          class="cursor-pointer hover:opacity-85 transition-opacity px-3 shrink-0 flex items-center gap-1"
          @click="showAllCatModal = true"
        >
          <span>{{ !quickCategories.includes(currentCat) ? currentCat : '全部分类' }}</span>
          <IconLucideChevronDown class="size-3.5 ml-0.5" />
        </STag>
      </div>

      <!-- 右侧：推荐歌单 / 精品歌单 切换按钮 -->
      <div class="w-52 shrink-0">
        <STabs
          :model-value="activeType"
          :tabs="typeTabs"
          type="segment"
          round
          size="medium"
          @update:model-value="handleTypeChange"
        />
      </div>
    </div>

    <!-- 无限瀑布流歌单列表区 -->
    <div class="flex-1 min-h-0 relative w-full">
      <div v-if="loading && playlists.length === 0" class="h-full flex items-center justify-center">
        <SLoading class="size-8 text-primary" />
      </div>
      <CoverList
        v-else
        ref="coverListRef"
        :items="playlists"
        :virtual="true"
        :padding-x="24"
        :padding-top="16"
        :padding-bottom="32"
        :has-more="hasMore"
        :loading-more="loadingMore"
        @scroll="handleScroll"
        @reach-bottom="loadData(true)"
        @click="handlePlaylistClick"
      />
    </div>

    <!-- 悬浮返回顶部按钮 -->
    <Transition name="fade">
      <button
        v-if="showBackTop"
        class="fixed right-8 bottom-24 z-40 size-11 rounded-full flex items-center justify-center bg-surface-panel/90 hover:bg-surface-panel text-on-surface hover:text-primary shadow-xl border border-solid border-primary/20 hover:border-primary/50 transition-all duration-200 active:scale-95 cursor-pointer backdrop-blur-md group"
        title="返回顶部"
        @click="scrollToTop"
      >
        <IconLucideChevronUp class="size-6 transition-transform group-hover:-translate-y-0.5" />
      </button>
    </Transition>

    <!-- 全部分类弹窗 -->
    <SDialog
      v-model:open="showAllCatModal"
      title="全部分类"
      width="640px"
    >
      <div class="py-2 px-1 max-h-[65vh] overflow-y-auto flex flex-col gap-5">
        <div v-for="group in categoryGroups" :key="group.id" class="flex flex-col gap-2.5">
          <div class="text-xs font-semibold text-on-surface-variant/80 tracking-wider">
            {{ group.name }}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <STag
              v-for="sub in group.sub"
              :key="sub.name"
              round
              size="medium"
              :type="currentCat === sub.name ? 'primary' : 'default'"
              class="cursor-pointer hover:opacity-85 transition-opacity px-3"
              @click="handleDialogCatSelect(sub.name)"
            >
              {{ sub.name }}
            </STag>
          </div>
        </div>
      </div>
    </SDialog>
  </div>
</template>
