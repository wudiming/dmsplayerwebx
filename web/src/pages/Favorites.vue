<script setup lang="ts">
defineOptions({ name: "Favorites" });

import type { CoverItem } from "@/types/artist";
import { useUserStore } from "@/stores/user";
import { useDetailModalStore } from "@/stores/detailModal";
import LoginDialog from "@/components/modals/LoginDialog.vue";
import VideoPlayerModal from "@/components/modals/VideoPlayerModal.vue";
import {
  albumsToCoverItems,
  artistsToCoverItems,
  playlistToCoverItem,
  videosToCoverItems,
  radiosToCoverItems,
} from "@/utils/format/coverItem";
import CoverList from "@/components/list/CoverList.vue";
import IconLucideListMusic from "~icons/lucide/list-music";
import IconLucideDisc3 from "~icons/lucide/disc-3";
import IconLucideUser from "~icons/lucide/user";
import IconLucideVideo from "~icons/lucide/video";
import IconLucideRadio from "~icons/lucide/radio";
import IconLucideSearch from "~icons/lucide/search";
import IconMaterialSymbolsFavoriteOutline from "~icons/material-symbols/favorite-outline-rounded";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const user = useUserStore();
const detailModal = useDetailModalStore();
const loginOpen = ref(false);

const searchQuery = ref("");

const videoPlayerOpen = ref(false);
const activeVideo = ref<CoverItem | null>(null);

type FavTab = "playlist" | "album" | "artist" | "video" | "radio";

const TAB_KEYS: readonly FavTab[] = ["playlist", "album", "artist", "video", "radio"];

/** 当前 tab */
const activeTab = computed<FavTab>(() => {
  const tab = route.query.tab;
  return typeof tab === "string" && (TAB_KEYS as readonly string[]).includes(tab)
    ? (tab as FavTab)
    : "playlist";
});

const onTabSwitch = (key: string): void => {
  router.replace({ query: { ...route.query, tab: key } });
};

const tabs = computed(() => [
  { key: "playlist" satisfies FavTab, label: t("favorites.tabs.playlist") },
  { key: "album" satisfies FavTab, label: t("favorites.tabs.album") },
  { key: "artist" satisfies FavTab, label: t("favorites.tabs.artist") },
  { key: "video" satisfies FavTab, label: t("favorites.tabs.video") },
  { key: "radio" satisfies FavTab, label: t("favorites.tabs.radio") },
]);

const playlistItems = computed<CoverItem[]>(() =>
  user.subscribedPlaylists.map((pl) => ({
    ...playlistToCoverItem(pl),
    subtitle: pl.trackCount ? t("common.totalSongs", { count: pl.trackCount }) : "",
  })),
);

const albumItems = computed<CoverItem[]>(() => albumsToCoverItems(user.albums));

const artistItems = computed<CoverItem[]>(() => artistsToCoverItems(user.artists));

const videoItems = computed<CoverItem[]>(() => videosToCoverItems(user.videos));

const radioItems = computed<CoverItem[]>(() => radiosToCoverItems(user.radios));

const currentItems = computed<CoverItem[]>(() => {
  if (activeTab.value === "playlist") return playlistItems.value;
  if (activeTab.value === "album") return albumItems.value;
  if (activeTab.value === "artist") return artistItems.value;
  if (activeTab.value === "video") return videoItems.value;
  return radioItems.value;
});

const filteredItems = computed<CoverItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return currentItems.value;
  return currentItems.value.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q)),
  );
});

const countMeta = computed(() => {
  switch (activeTab.value) {
    case "album":
      return {
        icon: IconLucideDisc3,
        text: t("common.totalAlbums", { count: albumItems.value.length }),
      };
    case "artist":
      return {
        icon: IconLucideUser,
        text: t("common.totalArtists", { count: artistItems.value.length }),
      };
    case "video":
      return {
        icon: IconLucideVideo,
        text: t("common.totalVideos", { count: videoItems.value.length }),
      };
    case "radio":
      return {
        icon: IconLucideRadio,
        text: t("common.totalRadios", { count: radioItems.value.length }),
      };
    case "playlist":
    default:
      return {
        icon: IconLucideListMusic,
        text: t("common.totalPlaylists", { count: playlistItems.value.length }),
      };
  }
});

const handleClick = (item: CoverItem): void => {
  if (activeTab.value === "artist") {
    detailModal.openArtist(item.id, { source: "netease", name: item.title });
  } else if (activeTab.value === "album") {
    detailModal.openAlbum(item.id, { source: "netease", name: item.title });
  } else if (activeTab.value === "radio") {
    detailModal.openRadio(item.id, { source: "netease", name: item.title });
  } else if (activeTab.value === "video") {
    activeVideo.value = item;
    videoPlayerOpen.value = true;
  } else {
    detailModal.openPlaylist(item.id, { source: "netease", name: item.title });
  }
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 顶栏 -->
    <div class="shrink-0 px-5 pb-2">
      <div class="flex items-baseline gap-4 mt-2 mb-4 min-w-0">
        <h1 class="text-3xl font-bold text-on-surface shrink-0 text-balance">
          {{ t("favorites.title") }}
        </h1>
        <Transition name="fade" mode="out-in">
          <span
            v-if="user.isLoggedIn"
            :key="activeTab"
            class="flex items-center gap-1.5 text-sm text-on-surface-variant/50 truncate"
          >
            <component :is="countMeta.icon" class="size-3.5 shrink-0" />
            {{ countMeta.text }}
          </span>
        </Transition>
      </div>
      <div class="flex items-center justify-between gap-4">
        <STabs :model-value="activeTab" :tabs="tabs" @update:model-value="onTabSwitch" />
        <SInput
          v-model="searchQuery"
          :placeholder="t('common.search')"
          clearable
          round
          class="w-40 focus-within:w-56 shrink-0"
          data-search-input
        >
          <template #prefix>
            <IconLucideSearch class="size-4 text-on-surface-variant/40 shrink-0" />
          </template>
        </SInput>
      </div>
    </div>
    <!-- 未登录 -->
    <div v-if="!user.isLoggedIn" class="flex-1 flex items-center justify-center">
      <div class="text-center text-on-surface-variant/50">
        <IconMaterialSymbolsFavoriteOutline class="size-12 mx-auto mb-3 opacity-30" />
        <div class="text-sm">{{ t("favorites.notLogin") }}</div>
      </div>
    </div>
    <!-- 内容 -->
    <Transition v-else name="fade" mode="out-in" :duration="150">
      <div v-if="filteredItems.length > 0" :key="activeTab" class="flex-1 min-h-0">
        <CoverList
          :items="filteredItems"
          :type="activeTab === 'artist' ? 'artist' : activeTab === 'video' ? 'video' : 'default'"
          :min-size="activeTab === 'video' ? 220 : 130"
          :max-columns="activeTab === 'video' ? 6 : 8"
          :padding-x="20"
          :padding-top="8"
          :padding-bottom="20"
          @click="handleClick"
        />
      </div>
      <div v-else key="empty" class="flex-1 flex items-center justify-center">
        <div class="text-center text-on-surface-variant/50">
          <IconMaterialSymbolsFavoriteOutline class="size-12 mx-auto mb-3 opacity-30" />
          <div class="text-sm">{{ t("favorites.empty") }}</div>
        </div>
      </div>
    </Transition>
    <LoginDialog v-model:open="loginOpen" />
    <VideoPlayerModal v-model:open="videoPlayerOpen" :video="activeVideo" />
  </div>
</template>
