<script setup lang="ts">
import type { CoverItem } from "@/types/artist";
import type { UserVideo } from "@/types/user";
import { netease as neteaseApi } from "@/apis/netease";
import { useUserStore } from "@/stores/user";
import { useStatusStore } from "@/stores/status";
import { useDetailModalStore } from "@/stores/detailModal";
import * as player from "@/core/player";
import { useCopyText } from "@/composables/useCopyText";
import IconLucidePlay from "~icons/lucide/play";
import IconLucideShare2 from "~icons/lucide/share-2";
import IconLucideHeart from "~icons/lucide/heart";
import IconLucideExternalLink from "~icons/lucide/external-link";
import IconLucideEye from "~icons/lucide/eye";
import IconLucideClock from "~icons/lucide/clock";
import IconLucideUser from "~icons/lucide/user";

interface VideoPlayerModalProps {
  open: boolean;
  video: CoverItem | UserVideo | null;
}

const props = defineProps<VideoPlayerModalProps>();
const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const { t } = useI18n();
const user = useUserStore();
const detailModal = useDetailModalStore();
const { copy } = useCopyText();

const videoRef = shallowRef<HTMLVideoElement | null>(null);
const videoUrl = ref("");
const loading = ref(false);
const detailData = ref<any>(null);

const isOpen = computed({
  get: () => props.open,
  set: (val) => emit("update:open", val),
});

const isSubscribed = computed(() => {
  if (!props.video) return false;
  return user.videos.some((v) => v.id === props.video?.id);
});

const formatPlayCount = (count?: number): string => {
  if (!count) return "0";
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)} 亿`;
  if (count >= 10000) return `${(count / 10000).toFixed(1)} 万`;
  return String(count);
};

const loadVideo = async (v: CoverItem | UserVideo) => {
  loading.value = false;
  videoUrl.value = v.url || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
  detailData.value = {
    id: v.id,
    name: v.title,
    artistName: v.subtitle || (v as any).artistName || v.creator || "周杰伦",
    desc: v.description,
    playCount: v.playCount,
    publishTime: (v as any).publishTime,
  };

  // 播放视频前暂停音乐播放器
  const status = useStatusStore();
  if (status.isPlaying) {
    player.pause();
  }

  try {
    const [urlRes, detailRes] = await Promise.allSettled([
      neteaseApi.mv_url({ id: v.id, r: 1080 }),
      neteaseApi.mv_detail({ mvid: v.id }),
    ]);

    if (urlRes.status === "fulfilled" && urlRes.value?.data?.url) {
      videoUrl.value = urlRes.value.data.url;
    }
    if (detailRes.status === "fulfilled" && detailRes.value?.data) {
      detailData.value = detailRes.value.data;
    }
  } catch (err) {
    console.warn("[VideoPlayerModal] load video failed:", err);
  }
};

const handleOpenArtist = () => {
  const artistId = detailData.value?.artistId || (props.video as any)?.artistId;
  const artistName = detailData.value?.artistName || props.video?.subtitle || props.video?.creator;
  if (artistId || artistName) {
    isOpen.value = false;
    detailModal.openArtist(String(artistId || artistName), { source: "netease", name: artistName });
  }
};

const handleToggleSub = async () => {
  if (!props.video) return;
  await user.toggleVideoSubscribe(props.video.id, !isSubscribed.value);
};

const handleCopyLink = () => {
  if (!props.video) return;
  const link = `https://music.163.com/#/mv?id=${props.video.id}`;
  copy(link);
};

const handleOpenExternal = () => {
  if (!props.video) return;
  window.open(`https://music.163.com/#/mv?id=${props.video.id}`, "_blank");
};

watch(
  () => [props.open, props.video] as const,
  ([open, nextVideo]) => {
    if (open && nextVideo) {
      loadVideo(nextVideo);
    } else if (!open && videoRef.value) {
      videoRef.value.pause();
    }
  },
  { immediate: true },
);
</script>

<template>
  <SDialog
    v-model:open="isOpen"
    :title="video?.title || '视频播放'"
    width="min(960px, 94vw)"
    height="min(760px, 90vh)"
    destroy-on-close
  >
    <div class="flex flex-col h-full overflow-y-auto px-5 pb-5 select-text">
      <!-- 视频播放器区域 (16:9) -->
      <div class="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center shrink-0">
        <video
          v-if="videoUrl"
          ref="videoRef"
          :src="videoUrl"
          controls
          autoplay
          playsinline
          class="w-full h-full object-contain"
        />
        <div v-else-if="loading" class="flex flex-col items-center gap-3 text-white/70">
          <SLoading class="size-8" />
          <span class="text-xs">加载视频资源中...</span>
        </div>
        <div v-else class="text-sm text-white/50">
          暂无可用视频资源
        </div>
      </div>

      <!-- 视频详细元信息 -->
      <div v-if="video" class="mt-4 flex flex-col gap-3">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <h2 class="text-xl font-bold text-on-surface line-clamp-2 leading-snug">
              {{ video.title }}
            </h2>
            <div class="flex flex-wrap items-center gap-4 mt-2 text-xs text-on-surface-variant/60">
              <!-- 播放量 -->
              <span class="flex items-center gap-1">
                <IconLucideEye class="size-3.5" />
                {{ formatPlayCount(detailData?.playCount || video.playCount) }} 次播放
              </span>
              <!-- 发布时间 -->
              <span v-if="detailData?.publishTime || (video as any).publishTime" class="flex items-center gap-1">
                <IconLucideClock class="size-3.5" />
                {{ detailData?.publishTime || (video as any).publishTime }}
              </span>
            </div>
          </div>

          <!-- 操作按钮栏 -->
          <div class="flex items-center gap-2 shrink-0">
            <SButton
              variant="secondary"
              size="small"
              round
              class="gap-1.5 cursor-pointer"
              :class="isSubscribed ? 'text-primary' : ''"
              @click="handleToggleSub"
            >
              <template #icon>
                <IconLucideHeart class="size-3.5" :class="isSubscribed ? 'fill-primary' : ''" />
              </template>
              {{ isSubscribed ? '已收藏' : '收藏视频' }}
            </SButton>
            <SButton
              variant="ghost"
              size="small"
              circle
              title="分享视频链接"
              class="cursor-pointer"
              @click="handleCopyLink"
            >
              <template #icon>
                <IconLucideShare2 class="size-4" />
              </template>
            </SButton>
            <SButton
              variant="ghost"
              size="small"
              circle
              title="在网易云中打开"
              class="cursor-pointer"
              @click="handleOpenExternal"
            >
              <template #icon>
                <IconLucideExternalLink class="size-4" />
              </template>
            </SButton>
          </div>
        </div>

        <!-- 创作者信息栏 -->
        <div
          v-if="video.subtitle || video.creator || detailData?.artistName"
          class="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-panel/40 border border-solid border-primary/5 hover:bg-surface-panel/80 transition-colors cursor-pointer w-fit"
          @click="handleOpenArtist"
        >
          <div class="size-8 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
            <IconLucideUser class="size-4 text-primary" />
          </div>
          <div class="flex flex-col">
            <span class="text-xs font-semibold text-on-surface hover:text-primary transition-colors">
              {{ detailData?.artistName || video.subtitle || video.creator }}
            </span>
            <span class="text-[10px] text-on-surface-variant/50">点击查看艺术家详情</span>
          </div>
        </div>

        <!-- 简介 -->
        <div
          v-if="video.description || detailData?.desc"
          class="p-3.5 rounded-xl bg-surface-panel/30 text-xs text-on-surface-variant/80 leading-relaxed whitespace-pre-line select-text"
        >
          {{ detailData?.desc || video.description }}
        </div>
      </div>
    </div>
  </SDialog>
</template>
