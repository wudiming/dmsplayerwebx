<script setup lang="ts">
defineOptions({ name: "DiscoverLayout" });

import STabs from "@/components/ui/STabs.vue";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const tabs = computed(() => [
  { key: "/discover/playlists", label: t("nav.playlistsSquare") },
  { key: "/discover/toplists", label: t("nav.toplists") },
  { key: "/discover/artists", label: t("nav.artists") },
  { key: "/discover/new", label: t("nav.newMusic") },
]);

const activeTab = computed(() => {
  for (const tab of tabs.value) {
    if (route.path.startsWith(tab.key)) return tab.key;
  }
  return "/discover/playlists";
});

const handleTabChange = (key: string): void => {
  router.push(key);
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 顶栏：标题 + 四个分类标签页 -->
    <div class="shrink-0 px-6 pt-2 pb-3">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-3xl font-bold text-on-surface tracking-tight">
          {{ t("nav.discover") }}
        </h1>
      </div>
      <div class="w-full max-w-xl">
        <STabs
          :model-value="activeTab"
          :tabs="tabs"
          type="segment"
          round
          size="medium"
          @update:model-value="handleTabChange"
        />
      </div>
    </div>

    <!-- 子页面内容 -->
    <div class="flex-1 min-h-0 relative">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <KeepAlive :max="4" :include="['DiscoverPlaylists', 'DiscoverToplists', 'DiscoverArtists', 'DiscoverNew']">
            <component :is="Component" />
          </KeepAlive>
        </Transition>
      </RouterView>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
