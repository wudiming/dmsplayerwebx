<script setup lang="ts">
import { settingsSchema } from "@/settings/schema";
import { useSettingsDialog } from "@/settings/useSettingsDialog";
import { useSettingsStore } from "@/stores/settings";
import { openExternal } from "@/utils/url";
import { REPO_URL, REPO_NAME, APP_VERSION, IS_APPX } from "@/utils/config";
import { useResponsive } from "@/composables/useResponsive";
import IconLucideArrowLeft from "~icons/lucide/arrow-left";
import IconLucideGithub from "~icons/lucide/github";

const { initialCategory, initialHighlight, rememberCategory } = useSettingsDialog();
const { isMobile } = useResponsive();

// 移动端视图状态：'categories' (分类总览列表) | 'detail' (分类具体设置详情)
const mobileView = ref<"categories" | "detail">(
  initialHighlight.value ? "detail" : "categories",
);

// 同步后端配置
useSettingsStore().syncSystem();
const { t } = useI18n();

const activeId = ref(initialCategory.value);
const highlightKey = ref(initialHighlight.value);
const scrollRef = ref<HTMLElement>();
const isSearchActive = ref(false);

const activeCategory = computed(() => settingsSchema.find((c) => c.id === activeId.value));

/** 计算每个 section 的全局起始索引 */
const sectionStartIndices = computed(() => {
  const indices: number[] = [];
  let idx = 0;
  for (const sec of activeCategory.value?.sections ?? []) {
    indices.push(idx);
    idx += 1 + sec.items.length;
  }
  return indices;
});

const onCategorySelect = (id: string) => {
  activeId.value = id;
  highlightKey.value = undefined;
  rememberCategory(id);
  if (isMobile.value) {
    mobileView.value = "detail";
  }
  nextTick(() => scrollRef.value?.scrollTo({ top: 0 }));
};

const onSearchSelect = (categoryId: string, itemKey: string) => {
  highlightKey.value = itemKey;
  if (activeId.value !== categoryId) {
    activeId.value = categoryId;
  }
  if (isMobile.value) {
    mobileView.value = "detail";
  }
  nextTick(() => {
    setTimeout(() => {
      const el = document.getElementById(`setting-${itemKey}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => {
        highlightKey.value = undefined;
      }, 2500);
    }, 100);
  });
};

onMounted(() => {
  if (initialHighlight.value) {
    onSearchSelect(initialCategory.value, initialHighlight.value);
  }
});
</script>

<template>
  <div class="flex h-full overflow-hidden w-full">
    <!-- 移动端：分类总览视图 -->
    <div
      v-if="isMobile"
      v-show="mobileView === 'categories'"
      class="flex flex-col h-full w-full bg-surface-panel p-4 overflow-hidden"
    >
      <div class="flex items-center justify-between mb-1 px-1">
        <h2 class="text-xl font-bold text-on-surface">{{ t("settings.title") }}</h2>
      </div>
      <p class="text-xs text-on-surface-variant/80 mb-3 px-1 truncate">
        {{ t("settings.subtitle") }}
      </p>

      <!-- 搜索 -->
      <SettingsSearch
        class="mb-3"
        @select="onSearchSelect"
        @active-change="isSearchActive = $event"
      />

      <!-- 分类菜单 -->
      <Transition name="fade">
        <div
          v-show="!isSearchActive"
          class="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2"
        >
          <SettingsMenu
            :categories="settingsSchema"
            :active-id="activeId"
            @select="onCategorySelect"
          />
        </div>
      </Transition>

      <!-- 底部版权/版本 -->
      <div
        class="shrink-0 mt-auto pt-3 px-1 flex flex-wrap items-center gap-1.5 border-t border-outline-variant/10"
      >
        <SButton variant="text" size="tiny" @click="openExternal(REPO_URL)">
          <template #icon><IconLucideGithub class="size-3.5" /></template>
          {{ REPO_NAME }}
        </SButton>
        <STag size="tiny">v{{ APP_VERSION }}</STag>
        <STag v-if="IS_APPX" size="tiny">{{ t("settings.storeVersion") }}</STag>
      </div>
    </div>

    <!-- 移动端：具体设置项详情视图 -->
    <div
      v-if="isMobile"
      v-show="mobileView === 'detail'"
      class="flex flex-col h-full w-full bg-surface overflow-hidden"
    >
      <!-- 顶部固定导航栏（彻底独立于滚动容器外部，固定在顶部，绝不产生穿透） -->
      <div
        class="shrink-0 h-13 px-3 pr-12 bg-surface border-b border-outline-variant/15 flex items-center gap-2 z-20"
      >
        <SButton variant="ghost" circle size="small" @click="mobileView = 'categories'">
          <template #icon>
            <IconLucideArrowLeft class="size-4" />
          </template>
        </SButton>
        <span class="text-base font-bold text-on-surface truncate">
          {{ activeCategory ? t(`settings.group.${activeCategory.id}`) : "" }}
        </span>
      </div>

      <!-- 独立滚动区：向上滚动在导航栏下方自动截断，绝对不会穿越显示在上方 -->
      <div ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-12">
        <div v-if="activeCategory" :key="activeCategory.id" class="animate-fade-in max-w-3xl">
          <component :is="activeCategory.component" v-if="activeCategory.component" />
          <template v-else>
            <SettingsSection
              v-for="(sec, si) in activeCategory.sections"
              :key="sec.id"
              :section="sec"
              :highlight-key="highlightKey"
              :start-index="sectionStartIndices[si] ?? 0"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- 桌面端 / 平板（并排两列式自适应布局） -->
    <template v-if="!isMobile">
      <!-- 左侧分类侧栏 -->
      <div
        class="w-56 md:w-64 lg:w-70 shrink-0 flex flex-col bg-surface-panel p-4 lg:p-5 border-r border-outline-variant/10 h-full"
      >
        <h2 class="text-xl sm:text-2xl font-bold mb-1 px-1 text-on-surface">
          {{ t("settings.title") }}
        </h2>
        <p class="text-xs sm:text-sm text-on-surface-variant/80 mb-3 sm:mb-4 px-1 truncate">
          {{ t("settings.subtitle") }}
        </p>

        <!-- 搜索 -->
        <SettingsSearch
          class="mb-3"
          @select="onSearchSelect"
          @active-change="isSearchActive = $event"
        />

        <!-- 菜单 -->
        <Transition name="fade">
          <div
            v-show="!isSearchActive"
            class="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2 sm:-mr-4 sm:pr-4"
          >
            <SettingsMenu
              :categories="settingsSchema"
              :active-id="activeId"
              @select="onCategorySelect"
            />
          </div>
        </Transition>

        <!-- 底部版权/版本 -->
        <div
          class="shrink-0 mt-auto pt-3 px-1 flex flex-wrap items-center gap-1.5 border-t border-outline-variant/10"
        >
          <SButton variant="text" size="tiny" @click="openExternal(REPO_URL)">
            <template #icon><IconLucideGithub class="size-3.5" /></template>
            {{ REPO_NAME }}
          </SButton>
          <STag size="tiny">v{{ APP_VERSION }}</STag>
          <STag v-if="IS_APPX" size="tiny">{{ t("settings.storeVersion") }}</STag>
        </div>
      </div>

      <!-- 右侧配置项滚动区 -->
      <div
        ref="scrollRef"
        class="flex-1 min-h-0 overflow-y-auto bg-surface py-5 px-4 sm:px-6 lg:py-6 lg:px-8 h-full"
      >
        <div v-if="activeCategory" :key="activeCategory.id" class="animate-fade-in max-w-3xl">
          <component :is="activeCategory.component" v-if="activeCategory.component" />
          <template v-else>
            <SettingsSection
              v-for="(sec, si) in activeCategory.sections"
              :key="sec.id"
              :section="sec"
              :highlight-key="highlightKey"
              :start-index="sectionStartIndices[si] ?? 0"
            />
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
