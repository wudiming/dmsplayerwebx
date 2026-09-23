import { useUserStore } from "@/stores/user";
import { useDetailModalStore } from "@/stores/detailModal";
import { useHeartMode } from "@/composables/useHeartMode";
import { useFmMode } from "@/composables/useFmMode";
import { toast } from "@/composables/useToast";
import * as player from "@/core/player";
import IconDices from "~icons/lucide/dices";
import IconCalendarDays from "~icons/lucide/calendar-days";
import IconHeart from "~icons/sp/heart-mode";
import IconRadio from "~icons/lucide/radio";

/**
 * 首页快捷入口
 */
export const useQuickActions = () => {
  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const { enterHeartMode } = useHeartMode();
  const { enterFmMode } = useFmMode();

  /** 试试手气 */
  const playLucky = useThrottleFn(async (): Promise<void> => {
    if (!user.isLoggedIn) {
      toast.warning(t("home.quickActions.luck.needLogin"));
      return;
    }

    if (user.likedPlaylistTracks.length === 0) {
      const loading = toast.loading(t("home.quickActions.luck.loading", "正在加载曲库..."), { duration: 0 });
      try {
        await user.ensureLikedPlaylist(true);
      } catch (err) {
        console.error("[luck] 加载喜欢歌单失败:", err);
      } finally {
        loading.close();
      }
    }

    const online = user.likedPlaylistTracks;
    if (online.length === 0) {
      toast.warning(t("home.quickActions.luck.empty"));
      return;
    }

    const luckyIndex = Math.floor(Math.random() * online.length);
    const luckyTrack = online[luckyIndex];
    if (luckyTrack) {
      await player.playFrom(online, luckyIndex, {
        provider: "netease",
        originId: user.likedPlaylistId || "liked",
        originType: "playlist",
        originName: t("liked.title"),
      });
    }
  }, 800);

  /** 打开每日推荐 */
  const openDaily = useThrottleFn(() => {
    if (!user.isLoggedIn) {
      toast.warning(t("home.quickActions.daily.needLogin"));
      return;
    }
    useDetailModalStore().openDaily();
  }, 800);

  /** 进入心动模式 */
  const playHeartMode = useThrottleFn(() => enterHeartMode(), 800);

  /** 进入私人 FM */
  const playFm = useThrottleFn(() => enterFmMode(), 800);

  /** 快捷入口列表 */
  const quickActions = computed(() => [
    {
      icon: IconDices,
      title: t("home.quickActions.luck.title"),
      desc: t("home.quickActions.luck.desc"),
      run: playLucky,
    },
    {
      icon: IconCalendarDays,
      title: t("home.quickActions.daily.title"),
      desc: t("home.quickActions.daily.desc"),
      run: openDaily,
    },
    {
      icon: IconHeart,
      title: t("home.quickActions.heartMode.title"),
      desc: t("home.quickActions.heartMode.desc"),
      run: playHeartMode,
    },
    {
      icon: IconRadio,
      title: t("home.quickActions.fm.title"),
      desc: t("home.quickActions.fm.desc"),
      run: playFm,
    },
  ]);

  return { quickActions };
};
