<script setup lang="ts">
import type { CoverItem } from "@/types/artist";
import artistFallback from "@/assets/images/artist.jpg";

export interface CoverCardProps {
  /** 卡片数据 */
  item: CoverItem;
  /** 类型：default / artist / video */
  type?: "default" | "artist" | "video";
  /** 封面圆角 class */
  rounded?: string;
  /** 封面占位图 */
  fallback?: string;
}

const props = withDefaults(defineProps<CoverCardProps>(), {
  type: "default",
  rounded: "rounded-xl",
});

defineEmits<{ click: [] }>();

const coverRounded = computed(() => (props.type === "artist" ? "rounded-full" : props.rounded));
const actualFallback = computed(() => (props.type === "artist" ? artistFallback : props.fallback));

const formatPlayCount = (count?: number): string => {
  if (!count) return "";
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}亿`;
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  return String(count);
};
</script>

<template>
  <div
    class="cursor-pointer group rounded-xl transition-colors duration-300"
    :class="type !== 'artist' ? 'hover:bg-primary/10' : ''"
    @click="$emit('click')"
  >
    <!-- 封面 -->
    <div class="relative overflow-hidden group-hover:will-change-transform" :class="coverRounded">
      <SImg
        :src="item.cover"
        :fallback="actualFallback"
        :alt="item.title"
        class="w-full transition-[transform,filter] duration-300 ease-out group-hover:scale-108 group-hover:brightness-80"
        :class="type === 'video' ? 'aspect-video object-cover' : 'aspect-square'"
      />
      <!-- 视频播放量徽章 -->
      <div
        v-if="type === 'video' && item.playCount"
        class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-[11px] text-white flex items-center gap-1 font-medium select-none"
      >
        <IconLucidePlay class="size-2.5 fill-white" />
        <span>{{ formatPlayCount(item.playCount) }}</span>
      </div>
      <!-- 歌手头像指示 -->
      <div
        v-if="type === 'artist'"
        class="absolute inset-0 m-auto size-9 flex items-center justify-center rounded-full opacity-0 transition-[opacity,transform] duration-300 group-hover:opacity-100 shadow-md"
      >
        <IconLucideUser class="size-8 text-white" />
      </div>
      <!-- 视频播放按钮 -->
      <div
        v-else-if="type === 'video'"
        class="absolute inset-0 m-auto size-11 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm scale-90 group-hover:scale-110 opacity-0 transition-[opacity,transform] duration-300 group-hover:opacity-100 shadow-md"
      >
        <IconLucidePlay class="size-5 text-white fill-white ml-0.5" />
      </div>
      <!-- 歌单一体化交互条：结合歌曲数、收听量与播放按钮（底部居中） -->
      <div
        v-else
        class="absolute inset-x-0 bottom-2.5 mx-auto w-fit max-w-[calc(100%-1.25rem)] flex items-center rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-white shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-[opacity,transform] duration-300 select-none z-10"
        :class="item.trackCount || item.playCount ? 'pl-2.5 pr-1 py-1 gap-2' : 'p-1'"
      >
        <div
          v-if="item.trackCount || item.playCount"
          class="flex items-center gap-1.5 text-[11px] font-medium text-white/90 min-w-0 truncate"
        >
          <span v-if="item.trackCount" class="flex items-center gap-1 shrink-0">
            <IconLucideListMusic class="size-3 text-white/75" />
            <span>{{ item.trackCount }}首</span>
          </span>
          <span v-if="item.trackCount && item.playCount" class="w-0.5 h-2 bg-white/30 rounded-full shrink-0" />
          <span v-if="item.playCount" class="flex items-center gap-1 shrink-0">
            <IconLucideHeadphones class="size-3 text-white/75" />
            <span>{{ formatPlayCount(item.playCount) }}</span>
          </span>
        </div>
        <div
          class="rounded-full bg-white/25 hover:bg-white/40 active:scale-90 transition-all flex items-center justify-center shrink-0 shadow-sm"
          :class="item.trackCount || item.playCount ? 'size-7' : 'size-8'"
        >
          <IconLucidePlay
            class="text-white fill-white ml-0.5"
            :class="item.trackCount || item.playCount ? 'size-3.5' : 'size-4.5'"
          />
        </div>
      </div>
    </div>
    <!-- 信息 -->
    <div
      class="flex flex-col gap-0.5 px-2.5 py-2.5"
      :class="type === 'artist' ? 'items-center' : ''"
    >
      <div
        class="text-sm text-on-surface line-clamp-2 leading-snug text-pretty"
        :class="type === 'artist' ? 'text-center w-full' : ''"
      >
        {{ item.title }}
      </div>
      <div
        v-if="item.subtitle"
        class="text-xs text-on-surface-variant/50 truncate"
        :class="type === 'artist' ? 'text-center w-full' : ''"
      >
        {{ item.subtitle }}
      </div>
    </div>
  </div>
</template>
