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
      <!-- 播放按钮 -->
      <div
        class="absolute size-9 flex items-center justify-center rounded-full opacity-0 transition-[opacity,transform] duration-300 group-hover:opacity-100 shadow-md"
        :class="
          type === 'artist'
            ? 'inset-0 m-auto'
            : type === 'video'
              ? 'inset-0 m-auto bg-black/60 scale-90 group-hover:scale-110 size-11'
              : 'right-2 bottom-2 bg-white/50 translate-y-1.5 group-hover:translate-y-0'
        "
      >
        <IconLucidePlay v-if="type !== 'artist'" class="size-5 text-white" />
        <IconLucideUser v-else class="size-8 text-white" />
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
