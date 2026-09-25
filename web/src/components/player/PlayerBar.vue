<script setup lang="ts">
import { useStatusStore } from "@/stores/status";
import { useSettingsStore } from "@/stores/settings";
import { useMediaStore } from "@/stores/media";
import { useFavorite } from "@/composables/useFavorite";
import { usePlaylistPicker } from "@/composables/usePlaylistPicker";
import { useTrackMenu } from "@/composables/useTrackMenu";
import { useDownload } from "@/composables/useDownload";
import { useProgressLyric } from "@/composables/useProgressLyric";
import { useResponsive } from "@/composables/useResponsive";
import * as player from "@/core/player";
import BottomSpectrum from "./FullPlayer/BottomSpectrum.vue";
import IconFavorite from "~icons/material-symbols/favorite-rounded";
import IconFavoriteOutline from "~icons/material-symbols/favorite-outline-rounded";
import IconLucideMoreHorizontal from "~icons/lucide/more-horizontal";
import IconLucidePlay from "~icons/lucide/play";
import IconLucidePause from "~icons/lucide/pause";
import IconLucideSkipForward from "~icons/lucide/skip-forward";
import IconLucideListMusic from "~icons/lucide/list-music";

const status = useStatusStore();
const settings = useSettingsStore();
const media = useMediaStore();
const fav = useFavorite();
const { position, duration } = storeToRefs(status);
const { formatTooltip, snapToNearestLyric } = useProgressLyric();

const { isMobile } = useResponsive();

/** 是否是浮动模式 */
const isFloating = computed(() => settings.appearance.layoutMode === "floating");
/** 是否显示进度条提示 */
const showTooltip = computed(() => settings.player.showProgressTooltip);

const onSeekDragEnd = (value: number): void => {
  const snappedValue = snapToNearestLyric(value);
  player.seek(snappedValue);
};

/** 添加到歌单 */
const {
  open: pickerOpen,
  tracks: pickerTracks,
  mode: pickerMode,
  openPicker,
} = usePlaylistPicker();

/** 歌曲菜单 */
const { enqueue: enqueueDownload } = useDownload();
const { items: menuItems, handleSelect: onMenuSelect } = useTrackMenu(toRef(media, "track"), {
  hidePlayActions: true,
  onAddToPlaylist: (track) => openPicker([track]),
  onDownload: (track, quality) => void enqueueDownload(track, { quality }),
});
</script>

<template>
  <!-- 移动端模式 -->
  <div
    v-if="isMobile"
    class="relative h-full flex items-center px-3 gap-2 overflow-hidden select-none"
  >
    <!-- 顶部极细进度条 -->
    <div class="absolute left-0 right-0 top-0 h-[2px] bg-on-surface/10 overflow-hidden">
      <div
        class="h-full bg-primary transition-[width] duration-200"
        :style="{ width: duration > 0 ? `${(position / duration) * 100}%` : '0%' }"
      />
    </div>
    <!-- 歌曲信息区（点击展开全屏播放器） -->
    <div
      class="flex items-center gap-2.5 flex-1 min-w-0 py-1 cursor-pointer active:opacity-80 transition-opacity"
      @click="status.isPlayerExpanded = true"
    >
      <div class="size-11 shrink-0 rounded-lg overflow-hidden shadow-sm bg-on-surface/5">
        <SImg :src="media.track?.cover" class="size-full object-cover" />
      </div>
      <div class="flex-1 min-w-0 flex flex-col justify-center">
        <span class="truncate text-sm font-medium text-on-surface leading-tight">
          {{ media.track?.title || "SPlayer" }}
        </span>
        <span class="truncate text-xs text-on-surface-variant/80 mt-0.5 leading-tight">
          {{ media.track?.artists?.map((a) => a.name).filter(Boolean).join(" / ") || $t("playlist.unknownArtist") }}
        </span>
      </div>
    </div>
    <!-- 移动端右侧快捷播控 -->
    <div class="flex items-center gap-0.5 shrink-0">
      <SButton
        v-if="media.track"
        variant="ghost"
        circle
        :size="36"
        :icon-size="20"
        @click="fav.toggle(media.track)"
      >
        <template #icon>
          <SIconSwap :active="fav.isLiked(media.track)">
            <template #on><IconFavorite class="text-primary" /></template>
            <template #off><IconFavoriteOutline /></template>
          </SIconSwap>
        </template>
      </SButton>
      <SButton
        type="primary"
        variant="filled"
        circle
        :size="38"
        :icon-size="20"
        :loading="status.isLoading"
        :disabled="!media.track && !status.isLoading"
        @click="player.togglePlay()"
      >
        <template #icon>
          <SIconSwap :active="status.isPlaying">
            <template #on><IconLucidePause /></template>
            <template #off><IconLucidePlay class="ml-0.5" /></template>
          </SIconSwap>
        </template>
      </SButton>
      <SButton
        variant="ghost"
        circle
        :size="36"
        :icon-size="20"
        :disabled="!media.track"
        @click="player.nextTrack()"
      >
        <template #icon><IconLucideSkipForward /></template>
      </SButton>
      <SPopover
        v-model:open="status.outerQueueOpen"
        trigger="click"
        side="top"
        :side-offset="12"
        content-class="!p-0 w-72 h-[min(60vh,520px)] overflow-hidden"
      >
        <template #trigger>
          <SButton
            :type="status.outerQueueOpen ? 'primary' : 'default'"
            :variant="status.outerQueueOpen ? 'tertiary' : 'ghost'"
            circle
            :size="36"
            :icon-size="20"
          >
            <template #icon><IconLucideListMusic /></template>
          </SButton>
        </template>
        <QueuePopover @close="status.outerQueueOpen = false" />
      </SPopover>
    </div>
  </div>

  <!-- 桌面端浮动模式 -->
  <div
    v-else-if="isFloating"
    class="relative flex items-center px-4 gap-4 min-w-0 overflow-hidden rounded-full"
  >
    <BottomSpectrum
      v-if="settings.player.enableSpectrum"
      in-player-bar
      :show="status.isPlaying"
      :height="56"
    />
    <PlayerControls compact class="relative z-1" />
    <div class="flex flex-col flex-1 min-w-0 gap-1 pt-2 pb-1 relative z-1">
      <div class="flex items-center gap-2 min-w-0">
        <TrackInfo compact class="flex-1">
          <template #title-trailing>
            <div class="flex items-center shrink-0">
              <SButton
                class="-my-1"
                type="primary"
                variant="text"
                circle
                :size="24"
                :icon-size="16"
                @click="fav.toggle(media.track)"
              >
                <template #icon>
                  <SIconSwap :active="fav.isLiked(media.track)">
                    <template #on><IconFavorite /></template>
                    <template #off><IconFavoriteOutline /></template>
                  </SIconSwap>
                </template>
              </SButton>
              <SDropdownMenu
                v-if="media.track"
                :items="menuItems"
                side="top"
                align="start"
                @select="onMenuSelect"
              >
                <template #trigger>
                  <SButton
                    class="-my-1"
                    type="primary"
                    variant="text"
                    circle
                    :size="24"
                    :icon-size="16"
                  >
                    <template #icon><IconLucideMoreHorizontal /></template>
                  </SButton>
                </template>
              </SDropdownMenu>
            </div>
          </template>
        </TrackInfo>
        <PlayerTimeInfo compact />
      </div>
      <SSlider
        :model-value="position"
        :min="0"
        :max="duration"
        :step="100"
        :track-height="3"
        :thumb-size="10"
        :always-show-thumb="false"
        :show-popover="showTooltip"
        @drag-end="onSeekDragEnd"
      >
        <template #popover="{ value }">{{ formatTooltip(value) }}</template>
      </SSlider>
    </div>
    <div class="shrink-0 relative z-1">
      <Toolbar />
    </div>
  </div>

  <!-- 桌面端默认模式 -->
  <div v-else class="relative h-full">
    <div
      v-if="settings.player.enableSpectrum"
      class="absolute inset-0 overflow-hidden pointer-events-none"
    >
      <BottomSpectrum
        in-player-bar
        :show="status.isPlaying"
        :height="76"
      />
    </div>
    <div class="absolute left-0 right-0 top-0 -translate-y-1/2 z-10">
      <SSlider
        :model-value="position"
        :min="0"
        :max="duration"
        :step="100"
        :track-height="3"
        :thumb-size="12"
        :always-show-thumb="false"
        :show-popover="showTooltip"
        @drag-end="onSeekDragEnd"
      >
        <template #popover="{ value }">{{ formatTooltip(value) }}</template>
      </SSlider>
    </div>
    <div class="grid grid-cols-[1fr_auto_1fr] items-center h-full px-3 gap-2 relative z-1">
      <TrackInfo class="min-w-0 overflow-hidden">
        <template #title-trailing>
          <div class="flex items-center shrink-0">
            <SButton
              class="-my-1"
              type="primary"
              variant="text"
              circle
              :size="28"
              :icon-size="18"
              @click="fav.toggle(media.track)"
            >
              <template #icon>
                <SIconSwap :active="fav.isLiked(media.track)">
                  <template #on><IconFavorite /></template>
                  <template #off><IconFavoriteOutline /></template>
                </SIconSwap>
              </template>
            </SButton>
            <SDropdownMenu
              v-if="media.track"
              :items="menuItems"
              side="top"
              align="start"
              @select="onMenuSelect"
            >
              <template #trigger>
                <SButton
                  class="-my-1"
                  type="primary"
                  variant="text"
                  circle
                  :size="28"
                  :icon-size="18"
                >
                  <template #icon><IconLucideMoreHorizontal /></template>
                </SButton>
              </template>
            </SDropdownMenu>
          </div>
        </template>
      </TrackInfo>
      <PlayerControls class="mx-1 sm:mx-3 lg:mx-8 xl:mx-15 shrink-0" />
      <div class="flex items-center justify-end gap-2 min-w-0">
        <PlayerTimeInfo class="hidden md:flex shrink-0" />
        <Toolbar />
      </div>
    </div>
  </div>
  <PlaylistPickerDialog v-model:open="pickerOpen" :mode="pickerMode" :tracks="pickerTracks" />
</template>
