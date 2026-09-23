<script setup lang="ts">
import { useStatusStore } from "@/stores/status";
import { useMediaStore } from "@/stores/media";
import * as player from "@/core/player";

withDefaults(
  defineProps<{
    /** 紧凑模式 */
    compact?: boolean;
  }>(),
  { compact: false },
);

const { t } = useI18n();
const status = useStatusStore();
const media = useMediaStore();
const { isPlaying, isLoading, repeatMode, shuffleMode, heartMode, fmMode } = storeToRefs(status);

const hasTrack = computed(() => !!media.track);
</script>

<template>
  <div class="flex items-center" :class="compact ? 'gap-0' : 'gap-2.5'">
    <SButton
      class="will-change-transform"
      type="primary"
      variant="ghost"
      circle
      ripple
      :size="compact ? 32 : 38"
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
      class="will-change-transform"
      type="primary"
      variant="ghost"
      circle
      ripple
      :size="compact ? 34 : 38"
      :disabled="!hasTrack || fmMode"
      :title="t('player.prev')"
      @click="player.prevTrack()"
    >
      <template #icon><IconLucideSkipBack /></template>
    </SButton>
    <SButton
      type="primary"
      variant="secondary"
      circle
      ripple
      :class="[compact ? 'mx-0.5' : 'mx-1', 'will-change-transform']"
      :size="compact ? 40 : 44"
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
      class="will-change-transform"
      type="primary"
      variant="ghost"
      circle
      ripple
      :size="compact ? 34 : 38"
      :disabled="!hasTrack"
      :title="t('player.next')"
      @click="player.nextTrack()"
    >
      <template #icon><IconLucideSkipForward /></template>
    </SButton>
    <SButton
      class="will-change-transform"
      :type="fmMode ? 'default' : 'primary'"
      variant="ghost"
      circle
      ripple
      :size="compact ? 32 : 38"
      :disabled="fmMode"
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
</template>
