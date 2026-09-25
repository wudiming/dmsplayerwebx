<script setup lang="ts">
import { useStatusStore } from "@/stores/status";
import { useMediaStore } from "@/stores/media";
import { useSettingsStore } from "@/stores/settings";
import { usePlaybackTime } from "@/composables/usePlaybackTime";
import { getCurrentTime } from "@/services/playback";
import type { QualityLevel } from "@/utils/quality";
import { useFavorite } from "@/composables/useFavorite";
import { useDownload, buildDownloadQualityItems } from "@/composables/useDownload";
import { usePlaylistPicker } from "@/composables/usePlaylistPicker";
import { useImmersiveMode } from "@/composables/useImmersiveMode";
import { useTimeFormat } from "@/composables/useTimeFormat";
import { useProgressLyric } from "@/composables/useProgressLyric";
import { useResponsive } from "@/composables/useResponsive";
import Lyrics from "@/components/player/Lyrics/index.vue";
import PlaylistPickerDialog from "@/components/modals/PlaylistPickerDialog.vue";
import { useWindowControls } from "@/composables/useWindowControls";
import * as player from "@/core/player";
import IconFavorite from "~icons/material-symbols/favorite-rounded";
import IconFavoriteOutline from "~icons/material-symbols/favorite-outline-rounded";
import IconLucideListPlus from "~icons/lucide/list-plus";
import IconLucideDownload from "~icons/lucide/download";

const status = useStatusStore();
const media = useMediaStore();
const settings = useSettingsStore();
const fav = useFavorite();
const { enqueue: enqueueDownload } = useDownload();
const { t } = useI18n();
const { isMobile } = useResponsive();
const mobileTab = ref<"cover" | "lyric">("cover");
const {
  isPlaying,
  isLoading,
  position,
  duration,
  isPlayerExpanded,
  repeatMode,
  shuffleMode,
  heartMode,
  fmMode,
  showLyric,
} = storeToRefs(status);

const { timeDisplay, toggleTimeFormat } = useTimeFormat();
const { snapToNearestLyric } = useProgressLyric();

const lyricRef = ref<InstanceType<typeof Lyrics>>();
const lyricMounted = ref(false);
const initialLyricTimeMs = ref(0);

/** 加载中的歌曲使用队列当前项兜底，避免全屏播放器出现空白。 */
const displayTrack = computed(() => media.track ?? status.currentTrack);
const hasLyric = computed(() => media.parsedLyric.length > 0 || media.lyricLoading);
const hasTrack = computed(() => !!displayTrack.value);

/** 精确播放时间（毫秒） */
const { start: startTick, stop: stopTick } = usePlaybackTime((currentMs) => {
  if (!status.trackLoading && !media.lyricLoading) {
    lyricRef.value?.setCurrentTime(currentMs + status.lyricOffsetMs, player.isSeeking());
  }
});

/** 展开后 */
const onAfterEnter = () => {
  initialLyricTimeMs.value = getCurrentTime() + status.lyricOffsetMs;
  lyricMounted.value = true;
  nextTick(() => {
    lyricRef.value?.resume();
    startTick();
  });
};

/** 收起前 */
const onBeforeLeave = () => {
  lyricRef.value?.freeze();
  stopTick();
};

/** 收起后 */
const onAfterLeave = () => {
  lyricMounted.value = false;
};

// 重新挂载时，刷新初始时间
watch(hasLyric, (value) => {
  if (value && lyricMounted.value) {
    initialLyricTimeMs.value = getCurrentTime() + status.lyricOffsetMs;
  }
});

// 歌词变化时先推送精确时间
watch(
  () => media.parsedLyric,
  () => lyricRef.value?.setCurrentTime(getCurrentTime() + status.lyricOffsetMs),
);

// 切换歌词引擎时，重新计算初始并推送时间
watch(
  () => settings.lyric.engine,
  () => {
    initialLyricTimeMs.value = getCurrentTime() + status.lyricOffsetMs;
    nextTick(() => {
      lyricRef.value?.setCurrentTime(getCurrentTime() + status.lyricOffsetMs);
      if (isPlaying.value) lyricRef.value?.resume();
    });
  },
);

const fullscreenCover = computed(() => settings.player.coverLayout === "fullscreen");
const coverWidth = computed(() => `${settings.player.coverLyricRatio * 100}%`);

const coverCentered = computed(() => {
  if (fullscreenCover.value || status.fullQueueOpen) return false;
  return !showLyric.value || (settings.player.autoCenterCover && !hasLyric.value);
});

const handleLyricSeek = async (timeMs: number): Promise<void> => {
  await player.seek(timeMs);
  if (!isPlaying.value) await player.play();
};

const lyricFontSize = computed(() =>
  settings.lyric.adaptiveFontSize
    ? `calc(${settings.lyric.fontSize} / 1080 * 100vh)`
    : `${settings.lyric.fontSize}px`,
);

const { immersive, onPlayerMouseEnter, onPlayerMouseLeave, onMainMove, onBarEnter, onBarLeave } =
  useImmersiveMode(isPlayerExpanded);

const { isFullscreen, toggleFullscreen } = useWindowControls();

const canDownload = computed(
  () =>
    !!displayTrack.value &&
    displayTrack.value.source !== "local" &&
    settings.system.download.enabled,
);

const downloadQualityItems = computed(() =>
  buildDownloadQualityItems(t("download.qualityDefault")),
);

const onDownloadSelect = (key: string): void => {
  if (!displayTrack.value) return;
  void enqueueDownload(displayTrack.value, key ? { quality: key as QualityLevel } : {});
};

const collapse = (): void => {
  isPlayerExpanded.value = false;
};

const onSeekDragEnd = (value: number): void => {
  player.seek(snapToNearestLyric(value));
};

const {
  open: pickerOpen,
  tracks: pickerTracks,
  mode: pickerMode,
  openPicker,
} = usePlaylistPicker();

const lyricToggleDisabled = computed(() => !hasLyric.value || fullscreenCover.value);
const lyricToggleActive = computed(
  () => showLyric.value && hasLyric.value && !status.fullQueueOpen && !fullscreenCover.value,
);

const toggleLyric = (): void => {
  if (status.fullQueueOpen) {
    status.fullQueueOpen = false;
    showLyric.value = true;
  } else {
    showLyric.value = !showLyric.value;
  }
};

const showComments = (): void => {
  if (displayTrack.value) status.showComments(displayTrack.value);
};
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-transform duration-500 ease-[cubic-bezier(0.7,0,0.3,1)]"
      leave-active-class="transition-transform duration-500 ease-[cubic-bezier(0.7,0,0.3,1)]"
      enter-from-class="translate-y-full"
      leave-to-class="translate-y-full"
      @after-enter="onAfterEnter"
      @before-leave="onBeforeLeave"
      @after-leave="onAfterLeave"
    >
      <div
        v-show="isPlayerExpanded"
        class="fixed inset-0 z-200 overflow-hidden text-cover"
        :class="immersive ? 'cursor-none [&_*]:!cursor-none' : ''"
        style="--lp-color: rgb(var(--s-cover))"
        @mouseenter="onPlayerMouseEnter"
        @mouseleave="onPlayerMouseLeave"
      >
        <!-- 背景 -->
        <PlayerBackground />
        <!-- 全屏封面 -->
        <div v-if="fullscreenCover" class="absolute inset-y-0 left-0 w-[60%]">
          <PlayerCover fullscreen />
        </div>
        <!-- 底部频谱 -->
        <BottomSpectrum
          v-if="isPlayerExpanded && settings.player.enableSpectrum"
          :show="isPlaying && immersive"
        />
        <!-- 顶/底栏渐变遮罩（全屏封面模式） -->
        <div
          v-if="fullscreenCover"
          class="cover-mask-top absolute top-0 inset-x-0 h-20 z-5 pointer-events-none transition-opacity duration-400"
          :class="immersive ? 'opacity-0' : 'opacity-100'"
        />
        <div
          v-if="fullscreenCover"
          class="cover-mask-bottom absolute bottom-0 inset-x-0 h-48 z-5 pointer-events-none transition-opacity duration-400"
          :class="immersive ? 'opacity-0' : 'opacity-100'"
        />
        <!-- 顶栏 -->
        <!-- 移动端顶栏 -->
        <div
          v-if="isMobile"
          class="absolute top-0 inset-x-0 h-14 z-10 transition-opacity duration-400 flex items-center justify-between px-3"
          :class="immersive ? 'opacity-0 pointer-events-none' : 'opacity-100'"
        >
          <SButton type="cover" variant="ghost" circle :size="40" @click="collapse">
            <template #icon><IconLucideChevronDown class="size-6" /></template>
          </SButton>
          <!-- 切换 Tab -->
          <div
            class="flex items-center p-0.5 rounded-full bg-cover/10 backdrop-blur-sm text-xs select-none"
          >
            <button
              class="px-3 py-1 rounded-full transition-colors font-medium"
              :class="mobileTab === 'cover' ? 'bg-cover/25 text-cover' : 'text-cover/60'"
              @click="mobileTab = 'cover'"
            >
              {{ t("streaming.tabs.songs", "歌曲") }}
            </button>
            <button
              class="px-3 py-1 rounded-full transition-colors font-medium"
              :class="mobileTab === 'lyric' ? 'bg-cover/25 text-cover' : 'text-cover/60'"
              @click="mobileTab = 'lyric'"
            >
              {{ t("settings.fontConfig.fields.lyric", "歌词") }}
            </button>
          </div>
          <div class="flex items-center gap-1">
            <SButton
              type="cover"
              variant="ghost"
              circle
              :size="40"
              :disabled="!hasTrack"
              @click="showComments"
            >
              <template #icon><IconLucideMessageCircle /></template>
            </SButton>
          </div>
        </div>
        <!-- 桌面端顶栏 -->
        <div
          v-else
          class="absolute top-0 inset-x-0 h-14 z-10 app-drag-region transition-opacity duration-400 flex items-center justify-between px-3"
          :class="immersive ? 'opacity-0 pointer-events-none' : 'opacity-100'"
          @mouseenter="onBarEnter"
          @mouseleave="onBarLeave"
        >
          <div class="app-no-drag flex items-center gap-2">
            <SButton
              type="cover"
              variant="ghost"
              circle
              :size="40"
              :disabled="lyricToggleDisabled"
              :class="lyricToggleActive ? 'opacity-100' : 'opacity-40'"
              @click="toggleLyric"
            >
              <template #icon><IconLucideTextQuote /></template>
            </SButton>
          </div>
          <div class="app-no-drag flex items-center gap-3">
            <SButton type="cover" variant="ghost" circle :size="40" @click="toggleFullscreen">
              <template #icon>
                <IconLucideMinimize v-if="isFullscreen" />
                <IconLucideMaximize v-else />
              </template>
            </SButton>
          </div>
        </div>

        <!-- 移动端主区域 -->
        <div
          v-if="isMobile"
          class="absolute top-14 inset-x-0 bottom-32 px-4 flex flex-col justify-center overflow-hidden"
          @click="immersive = !immersive"
        >
          <!-- 封面模式 -->
          <div
            v-if="mobileTab === 'cover'"
            class="flex flex-col items-center justify-center gap-5 h-full select-none"
          >
            <div
              class="w-[min(280px,68vw)] aspect-square rounded-2xl shadow-2xl overflow-hidden cursor-pointer active:scale-98 transition-transform"
              @click.stop="mobileTab = 'lyric'"
            >
              <PlayerCover />
            </div>
            <div class="w-[min(280px,68vw)] flex flex-col gap-1 text-center items-center">
              <SMarquee class="font-bold text-lg leading-tight w-full">
                {{ displayTrack?.title || "SPlayer" }}
              </SMarquee>
              <div class="text-xs text-cover/70 truncate w-full">
                {{
                  displayTrack?.artists?.map((a) => a.name).filter(Boolean).join(" / ") ||
                  $t("playlist.unknownArtist")
                }}
              </div>
            </div>
            <!-- 移动端快捷操作 -->
            <div class="flex items-center gap-3 text-cover/80 mt-1" @click.stop>
              <SButton
                type="cover"
                variant="ghost"
                circle
                :size="38"
                :disabled="!hasTrack"
                @click="fav.toggle(displayTrack)"
              >
                <template #icon>
                  <SIconSwap :active="fav.isLiked(displayTrack)">
                    <template #on><IconFavorite class="text-primary" /></template>
                    <template #off><IconFavoriteOutline /></template>
                  </SIconSwap>
                </template>
              </SButton>
              <SButton
                v-if="displayTrack?.source === 'local' || displayTrack?.source === 'netease'"
                type="cover"
                variant="ghost"
                circle
                :size="38"
                @click="displayTrack && openPicker([displayTrack])"
              >
                <template #icon><IconLucideListPlus /></template>
              </SButton>
              <SDropdownMenu
                v-if="canDownload"
                :items="downloadQualityItems"
                cover
                side="top"
                align="center"
                @select="onDownloadSelect"
              >
                <template #trigger>
                  <SButton type="cover" variant="ghost" :size="38" circle>
                    <template #icon><IconLucideDownload /></template>
                  </SButton>
                </template>
              </SDropdownMenu>
            </div>
          </div>

          <!-- 歌词模式 -->
          <div
            v-else
            class="lyric-area relative flex-1 min-h-0 w-full"
            :style="{
              '--lp-credit-opacity': '1',
              fontSize: '17px',
              fontWeight: String(settings.lyric.fontWeight),
              fontFamily: settings.lyric.fontFamily || undefined,
              mixBlendMode: settings.lyric.lyricBlendMode,
            }"
            @click.stop
          >
            <Lyrics
              v-if="lyricMounted && hasLyric"
              ref="lyricRef"
              :lyric-lines="media.parsedLyric"
              :initial-time="initialLyricTimeMs"
              :playing="isPlaying"
              @seek="handleLyricSeek"
            />
            <div
              v-else-if="lyricMounted"
              class="w-full h-full flex items-center justify-center text-cover/30"
            >
              暂无歌词
            </div>
          </div>

          <!-- 移动端播放队列覆盖层 -->
          <Transition
            enter-active-class="transition-opacity duration-300"
            enter-from-class="opacity-0"
            leave-active-class="transition-opacity duration-300"
            leave-to-class="opacity-0"
          >
            <div
              v-if="status.fullQueueOpen"
              class="absolute inset-0 bg-black/75 backdrop-blur-md rounded-2xl p-3 z-20"
              @click.stop
            >
              <QueuePanel @close="status.fullQueueOpen = false" />
            </div>
          </Transition>
        </div>

        <!-- 桌面端主区域 -->
        <div v-else class="absolute top-14 inset-x-0 bottom-20" @mousemove="onMainMove">
          <!-- 左侧 -->
          <div
            v-if="!fullscreenCover"
            class="absolute inset-y-0 left-0 flex items-center justify-center px-4 lg:px-12 transition-transform duration-600 ease-[cubic-bezier(0.4,0,0.2,1)]"
            :style="{
              width: coverWidth,
              transform: coverCentered ? 'translateX(calc(50vw - 50%))' : undefined,
            }"
          >
            <div class="relative w-[clamp(200px,85%,50vh)] -translate-y-[11vh]">
              <Transition name="scale-switch" mode="out-in">
                <div :key="displayTrack?.id">
                  <PlayerCover />
                  <div class="absolute top-full left-0 w-full pt-6">
                    <PlayerData align="left" />
                  </div>
                </div>
              </Transition>
            </div>
          </div>
          <!-- 右侧 -->
          <div
            class="group absolute inset-y-0 right-0 pr-6 lg:pr-20 flex flex-col transition-opacity duration-600 ease-[cubic-bezier(0.4,0,0.2,1)]"
            :class="
              coverCentered || status.fullQueueOpen
                ? 'opacity-0 pointer-events-none'
                : 'opacity-100'
            "
            :style="{ width: fullscreenCover ? '50%' : `calc(100% - ${coverWidth})` }"
          >
            <!-- 全屏封面 -->
            <div
              v-if="fullscreenCover"
              class="shrink-0 pt-2 pb-6 pl-[calc(1em-0.5rem)]"
              :style="{ fontSize: lyricFontSize }"
            >
              <PlayerData align="left" simple />
            </div>
            <!-- 歌词容器 -->
            <div
              class="lyric-area relative flex-1 min-h-0"
              :style="{
                '--lp-credit-opacity': '1',
                fontSize: lyricFontSize,
                fontWeight: String(settings.lyric.fontWeight),
                fontFamily: settings.lyric.fontFamily || undefined,
                '--lyric-font-zh': settings.lyric.fontFamilyChinese || undefined,
                '--lyric-font-ja': settings.lyric.fontFamilyJapanese || undefined,
                '--lyric-font-ko': settings.lyric.fontFamilyKorean || undefined,
                '--lyric-font-latin': settings.lyric.fontFamilyLatin || undefined,
                mixBlendMode: settings.lyric.lyricBlendMode,
              }"
            >
              <Lyrics
                v-if="lyricMounted && hasLyric"
                ref="lyricRef"
                :lyric-lines="media.parsedLyric"
                :initial-time="initialLyricTimeMs"
                :playing="isPlaying"
                @seek="handleLyricSeek"
              />
              <div
                v-else-if="lyricMounted"
                class="w-full h-full flex items-center justify-center text-cover/30"
              >
                暂无歌词
              </div>
            </div>
            <!-- 歌词侧边工具栏 -->
            <LyricActions :immersive="immersive" />
          </div>
          <!-- 播放队列 -->
          <div
            class="absolute inset-y-0 right-0 pl-4 py-6 flex items-center"
            :class="status.fullQueueOpen ? '' : 'pointer-events-none'"
            :style="{ width: fullscreenCover ? '50%' : `calc(100% - ${coverWidth})` }"
          >
            <Transition
              enter-active-class="transition-opacity duration-600 ease-[cubic-bezier(0.4,0,0.2,1)]"
              enter-from-class="opacity-0"
              leave-active-class="transition-opacity duration-600 ease-[cubic-bezier(0.4,0,0.2,1)]"
              leave-to-class="opacity-0"
            >
              <div v-if="status.fullQueueOpen" class="w-full h-full">
                <QueuePanel @close="status.fullQueueOpen = false" />
              </div>
            </Transition>
          </div>
        </div>

        <!-- 移动端底栏 -->
        <div
          v-if="isMobile"
          class="absolute bottom-0 inset-x-0 h-32 z-10 flex flex-col justify-center px-5 gap-2 transition-opacity duration-400 select-none pb-4"
          :class="immersive ? 'opacity-0 pointer-events-none' : 'opacity-100'"
        >
          <!-- 进度条行 -->
          <div class="flex items-center gap-2.5 w-full">
            <span
              class="text-xs text-cover/50 tabular-nums min-w-8 text-left cursor-pointer"
              @click="toggleTimeFormat"
            >
              {{ timeDisplay[0] }}
            </span>
            <SSlider
              :model-value="position"
              :min="0"
              :max="duration"
              :step="100"
              :always-show-thumb="false"
              cover
              class="flex-1"
              @drag-end="onSeekDragEnd"
            />
            <span
              class="text-xs text-cover/50 tabular-nums min-w-8 text-right cursor-pointer"
              @click="toggleTimeFormat"
            >
              {{ timeDisplay[1] }}
            </span>
          </div>
          <!-- 控制按钮行 -->
          <div class="flex items-center justify-between w-full px-1 pt-1">
            <!-- 模式切换 -->
            <SButton
              type="cover"
              variant="ghost"
              circle
              :size="40"
              :disabled="!fmMode && !heartMode && repeatMode === 'one'"
              @click="
                fmMode
                  ? player.dislikeFmTrack()
                  : heartMode
                    ? player.exitHeartMode()
                    : repeatMode === 'one'
                      ? undefined
                      : player.toggleShuffleMode()
              "
            >
              <template #icon>
                <IconLucideHeartOff v-if="fmMode" />
                <IconSpHeartMode v-else-if="heartMode" />
                <IconLucideShuffle v-else-if="shuffleMode === 'on'" />
                <IconSpPlayOrder v-else />
              </template>
            </SButton>
            <!-- 上一曲 -->
            <SButton
              type="cover"
              variant="ghost"
              circle
              :size="44"
              :disabled="!hasTrack || fmMode"
              @click="player.prevTrack()"
            >
              <template #icon><IconLucideSkipBack class="size-6" /></template>
            </SButton>
            <!-- 播放/暂停大键 -->
            <SButton
              type="cover"
              variant="secondary"
              circle
              :size="54"
              :loading="isLoading"
              :disabled="!hasTrack && !isLoading"
              @click="player.togglePlay()"
            >
              <template #icon>
                <SIconSwap :active="isPlaying">
                  <template #on><IconLucidePause class="size-7" /></template>
                  <template #off><IconLucidePlay class="size-7 ml-0.5" /></template>
                </SIconSwap>
              </template>
            </SButton>
            <!-- 下一曲 -->
            <SButton
              type="cover"
              variant="ghost"
              circle
              :size="44"
              :disabled="!hasTrack"
              @click="player.nextTrack()"
            >
              <template #icon><IconLucideSkipForward class="size-6" /></template>
            </SButton>
            <!-- 列表 -->
            <SButton
              type="cover"
              :variant="status.fullQueueOpen ? 'tertiary' : 'ghost'"
              circle
              :size="40"
              @click="status.fullQueueOpen = !status.fullQueueOpen"
            >
              <template #icon><IconLucideListMusic /></template>
            </SButton>
          </div>
        </div>

        <!-- 桌面端底栏 -->
        <div
          v-else
          class="absolute bottom-0 inset-x-0 h-20 z-10 flex items-center gap-4 px-4 transition-opacity duration-400"
          :class="immersive ? 'opacity-0 pointer-events-none' : 'opacity-100'"
          @mouseenter="onBarEnter"
          @mouseleave="onBarLeave"
        >
          <div class="flex-1 min-w-0 flex items-center justify-start gap-2">
            <SButton type="cover" variant="ghost" size="large" circle @click="collapse">
              <template #icon><IconLucideChevronDown /></template>
            </SButton>
            <SButton
              type="cover"
              variant="ghost"
              size="large"
              circle
              :disabled="!hasTrack"
              @click="fav.toggle(displayTrack)"
            >
              <template #icon>
                <SIconSwap :active="fav.isLiked(displayTrack)">
                  <template #on><IconFavorite /></template>
                  <template #off><IconFavoriteOutline /></template>
                </SIconSwap>
              </template>
            </SButton>
            <SButton
              type="cover"
              variant="ghost"
              size="large"
              circle
              :disabled="!hasTrack"
              @click="showComments"
            >
              <template #icon><IconLucideMessageCircle /></template>
            </SButton>
            <SButton
              v-if="displayTrack?.source === 'local' || displayTrack?.source === 'netease'"
              type="cover"
              variant="ghost"
              size="large"
              circle
              @click="displayTrack && openPicker([displayTrack])"
            >
              <template #icon><IconLucideListPlus /></template>
            </SButton>
            <SDropdownMenu
              v-if="canDownload"
              :items="downloadQualityItems"
              cover
              side="top"
              align="start"
              @select="onDownloadSelect"
            >
              <template #trigger>
                <SButton type="cover" variant="ghost" size="large" circle>
                  <template #icon><IconLucideDownload /></template>
                </SButton>
              </template>
            </SDropdownMenu>
          </div>
          <div class="shrink-0 flex flex-col items-center gap-1 w-[clamp(360px,35%,480px)]">
            <div class="flex items-center gap-3">
              <SButton
                type="cover"
                variant="ghost"
                circle
                :disabled="!fmMode && !heartMode && repeatMode === 'one'"
                :title="
                  fmMode
                    ? t('player.fm.dislike')
                    : heartMode
                      ? t('player.heartMode.exit')
                      : repeatMode === 'one'
                        ? t('player.shuffleMode.disabledInRepeatOne')
                        : shuffleMode === 'on'
                          ? t('player.shuffleMode.on')
                          : t('player.shuffleMode.off')
                "
                @click="
                  fmMode
                    ? player.dislikeFmTrack()
                    : heartMode
                      ? player.exitHeartMode()
                      : repeatMode === 'one'
                        ? undefined
                        : player.toggleShuffleMode()
                "
              >
                <template #icon>
                  <IconLucideHeartOff v-if="fmMode" />
                  <IconSpHeartMode v-else-if="heartMode" />
                  <IconLucideShuffle v-else-if="shuffleMode === 'on'" />
                  <IconSpPlayOrder v-else />
                </template>
              </SButton>
              <SButton
                type="cover"
                variant="ghost"
                circle
                :disabled="!hasTrack || fmMode"
                :title="t('player.prev')"
                @click="player.prevTrack()"
              >
                <template #icon><IconLucideSkipBack /></template>
              </SButton>
              <SButton
                type="cover"
                variant="secondary"
                size="large"
                circle
                :loading="isLoading"
                :disabled="!hasTrack && !isLoading"
                :title="isPlaying ? t('common.pause', '暂停') : t('common.play', '播放')"
                @click="player.togglePlay()"
              >
                <template #icon>
                  <SIconSwap :active="isPlaying">
                    <template #on><IconLucidePause /></template>
                    <template #off><IconLucidePlay /></template>
                  </SIconSwap>
                </template>
              </SButton>
              <SButton
                type="cover"
                variant="ghost"
                circle
                :disabled="!hasTrack"
                :title="t('player.next')"
                @click="player.nextTrack()"
              >
                <template #icon><IconLucideSkipForward /></template>
              </SButton>
              <SButton
                type="cover"
                variant="ghost"
                circle
                :disabled="fmMode"
                :class="fmMode ? 'opacity-40' : 'opacity-100'"
                :title="
                  fmMode
                    ? t('player.fm.modeSettings')
                    : repeatMode === 'one'
                      ? t('player.repeatMode.one')
                      : t('player.repeatMode.list')
                "
                @click="player.cycleRepeatMode()"
              >
                <template #icon>
                  <IconLucideInfinity v-if="fmMode" />
                  <IconLucideRepeat1 v-else-if="repeatMode === 'one'" />
                  <IconLucideRepeat v-else />
                </template>
              </SButton>
            </div>
            <div class="flex items-center gap-2 w-full">
              <span
                class="text-xs text-cover/50 tabular-nums min-w-9 text-center cursor-pointer px-1.5 py-0.5 rounded-md transition-colors hover:bg-cover/10"
                @click="toggleTimeFormat"
              >
                {{ timeDisplay[0] }}
              </span>
              <SSlider
                :model-value="position"
                :min="0"
                :max="duration"
                :step="100"
                :always-show-thumb="false"
                cover
                class="flex-1"
                @drag-end="onSeekDragEnd"
              />
              <span
                class="text-xs text-cover/50 tabular-nums min-w-9 text-center cursor-pointer px-1.5 py-0.5 rounded-md transition-colors hover:bg-cover/10"
                @click="toggleTimeFormat"
              >
                {{ timeDisplay[1] }}
              </span>
            </div>
          </div>
          <div class="flex-1 min-w-0 flex items-center justify-end">
            <Toolbar cover />
          </div>
        </div>
      </div>
    </Transition>
    <PlaylistPickerDialog v-model:open="pickerOpen" :mode="pickerMode" :tracks="pickerTracks" />
  </Teleport>
</template>

<style scoped>
.lyric-area {
  filter: drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.2));
  mask: linear-gradient(
    180deg,
    hsla(0, 0%, 100%, 0) 0,
    hsla(0, 0%, 100%, 0.6) 5%,
    #fff 10%,
    #fff 75%,
    hsla(0, 0%, 100%, 0.6) 85%,
    hsla(0, 0%, 100%, 0)
  );
}

/* 顶部/底部遮罩：多段非线性 alpha，避免暗色渐变出色阶 */
.cover-mask-top {
  background-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.44) 12%,
    rgba(0, 0, 0, 0.36) 25%,
    rgba(0, 0, 0, 0.27) 40%,
    rgba(0, 0, 0, 0.18) 55%,
    rgba(0, 0, 0, 0.1) 70%,
    rgba(0, 0, 0, 0.04) 85%,
    rgba(0, 0, 0, 0) 100%
  );
}

.cover-mask-bottom {
  background-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.44) 12%,
    rgba(0, 0, 0, 0.36) 25%,
    rgba(0, 0, 0, 0.27) 40%,
    rgba(0, 0, 0, 0.18) 55%,
    rgba(0, 0, 0, 0.1) 70%,
    rgba(0, 0, 0, 0.04) 85%,
    rgba(0, 0, 0, 0) 100%
  );
}
</style>
