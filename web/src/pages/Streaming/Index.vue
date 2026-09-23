<script setup lang="ts">
defineOptions({ name: "StreamingIndex" });

import type { DropdownMenuItem } from "@/components/ui/SDropdownMenu.vue";
import type { SSelectOption } from "@/components/ui/SSelect.vue";
import type {
  StreamingPingResult,
  StreamingServerConfig,
  StreamingServerInput,
  StreamingServerType,
} from "@shared/types/streaming";
import { useStreamingStore } from "@/stores/streaming";
import { useSettingsDialog } from "@/settings/useSettingsDialog";
import { toast } from "@/composables/useToast";
import IconLucideServer from "~icons/lucide/server";
import IconLucideRefreshCw from "~icons/lucide/refresh-cw";
import IconLucideMoreHorizontal from "~icons/lucide/more-horizontal";
import IconLucideSettings from "~icons/lucide/settings";
import IconLucidePlugZap from "~icons/lucide/plug-zap";
import IconLucideUnplug from "~icons/lucide/unplug";
import IconLucideMusic from "~icons/lucide/music";
import IconLucideDisc3 from "~icons/lucide/disc-3";
import IconLucideUser from "~icons/lucide/user";
import IconLucideListMusic from "~icons/lucide/list-music";
import IconLucidePlus from "~icons/lucide/plus";
import IconLucideCheck from "~icons/lucide/check";
import IconLucideEdit from "~icons/lucide/edit";
import IconLucideTrash from "~icons/lucide/trash";
import IconLucideHardDrive from "~icons/lucide/hard-drive";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const streaming = useStreamingStore();
const {
  servers,
  activeServerId,
  activeServer,
  isConnected,
  connectionStatus,
  loading,
  songs,
  albums,
  artists,
  playlists,
} = storeToRefs(streaming);
const settingsDialog = useSettingsDialog();

streaming.init();

const TYPE_OPTIONS: { value: StreamingServerType; label: string }[] = [
  { value: "navidrome", label: "Navidrome" },
  { value: "jellyfin", label: "Jellyfin" },
  { value: "emby", label: "Emby" },
  { value: "opensubsonic", label: "OpenSubsonic" },
  { value: "subsonic", label: "Subsonic" },
  { value: "airsonic", label: "Airsonic" },
  { value: "gonic", label: "Gonic" },
  { value: "lms", label: "LMS" },
];

const tabs = computed(() => [
  { key: "/streaming/songs", label: t("streaming.tabs.songs") },
  { key: "/streaming/albums", label: t("streaming.tabs.albums") },
  { key: "/streaming/artists", label: t("streaming.tabs.artists") },
  { key: "/streaming/playlists", label: t("streaming.tabs.playlists") },
]);

const activeTab = computed(() => {
  for (const tab of tabs.value) {
    if (route.path.startsWith(tab.key)) return tab.key;
  }
  return "/streaming/songs";
});

const switchTab = (key: string): void => {
  router.push(key);
};

/** 当前 tab 的图标 + 数量 */
const countMeta = computed(() => {
  switch (activeTab.value) {
    case "/streaming/albums":
      return {
        icon: IconLucideDisc3,
        text: t("common.totalAlbums", { count: albums.value.length }),
      };
    case "/streaming/artists":
      return {
        icon: IconLucideUser,
        text: t("common.totalArtists", { count: artists.value.length }),
      };
    case "/streaming/playlists":
      return {
        icon: IconLucideListMusic,
        text: t("common.totalPlaylists", { count: playlists.value.length }),
      };
    case "/streaming/songs":
    default:
      return {
        icon: IconLucideMusic,
        text: t("common.totalSongs", { count: songs.value.length }),
      };
  }
});

/** 服务器选项 */
const serverOptions = computed<SSelectOption[]>(() =>
  servers.value.map((s) => ({ value: s.id, label: s.name })),
);

const handleServerSelect = async (value: string | number | boolean): Promise<void> => {
  const id = String(value);
  if (id !== activeServerId.value) await streaming.setActiveServer(id);
};

const goToSettings = (): void => {
  settingsDialog.show("mediaSource");
};

/** 重连当前激活服务器 */
const reconnecting = ref(false);
const handleReconnect = async (): Promise<void> => {
  if (!activeServerId.value || reconnecting.value) return;
  reconnecting.value = true;
  try {
    await streaming.connectToServer(activeServerId.value);
    toast.success(t("streaming.server.connected"));
  } catch (err: any) {
    toast.error(err?.message || t("streaming.server.connectFailed"));
  } finally {
    reconnecting.value = false;
  }
};

/** 刷新媒体库数据 */
const refreshKey = ref(0);
const handleRefresh = (): void => {
  refreshKey.value++;
  streaming.refreshLibrary(true);
};

provide("streamingRefreshKey", refreshKey);

/** 更多菜单 */
const moreMenuItems = computed<DropdownMenuItem[]>(() => [
  {
    key: "manage",
    label: "管理媒体源",
    icon: IconLucideHardDrive,
  },
  {
    key: "reconnect",
    label: "重新连接",
    icon: IconLucidePlugZap,
    disabled: !activeServerId.value,
  },
  {
    key: "settings",
    label: t("streaming.actions.settings"),
    icon: IconLucideSettings,
  },
]);

const handleMoreMenu = (key: string): void => {
  if (key === "manage") {
    manageModalOpen.value = true;
  } else if (key === "reconnect") {
    void handleReconnect();
  } else if (key === "settings") {
    goToSettings();
  }
};

// ─── 弹窗管理状态 ───
const serverModalOpen = ref(false);
const manageModalOpen = ref(false);
const editingServerId = ref<string | null>(null);

const EMPTY_FORM: StreamingServerInput = {
  name: "",
  type: "navidrome",
  url: "",
  username: "",
  password: "",
};
const form = ref<StreamingServerInput>({ ...EMPTY_FORM });
const formError = ref<string | null>(null);
const testing = ref(false);
const submitting = ref(false);
const testResult = ref<StreamingPingResult | null>(null);

const openAddServer = (): void => {
  editingServerId.value = null;
  form.value = { ...EMPTY_FORM };
  formError.value = null;
  testResult.value = null;
  serverModalOpen.value = true;
};

const openEditServer = (cfg: StreamingServerConfig): void => {
  editingServerId.value = cfg.id;
  form.value = {
    name: cfg.name,
    type: cfg.type,
    url: cfg.url,
    username: cfg.username,
    password: "",
  };
  formError.value = null;
  testResult.value = null;
  serverModalOpen.value = true;
};

const validate = (inputData: StreamingServerInput): string | null => {
  if (!inputData.name.trim()) return t("streaming.server.errors.nameEmpty");
  if (!/^https?:\/\//i.test(inputData.url.trim())) return t("streaming.server.errors.urlInvalid");
  if (!inputData.username.trim()) return t("streaming.server.errors.usernameEmpty");
  const editingServer = servers.value.find((s) => s.id === editingServerId.value);
  if (!inputData.password && !editingServer?.hasPassword) {
    return t("streaming.server.errors.passwordEmpty");
  }
  return null;
};

const handleTestConnection = async (): Promise<void> => {
  const err = validate(form.value);
  if (err) {
    formError.value = err;
    return;
  }
  formError.value = null;
  testing.value = true;
  try {
    const res = await streaming.testConnection(form.value, editingServerId.value ?? undefined);
    testResult.value = res;
  } finally {
    testing.value = false;
  }
};

const handleSaveServer = async (): Promise<void> => {
  const err = validate(form.value);
  if (err) {
    formError.value = err;
    return;
  }
  formError.value = null;
  submitting.value = true;
  try {
    if (editingServerId.value) {
      await streaming.updateServer(editingServerId.value, form.value);
      if (activeServerId.value === editingServerId.value) {
        await streaming.connectToServer(editingServerId.value);
      }
      toast.success(t("streaming.server.updated"));
    } else {
      const created = await streaming.addServer(form.value);
      if (!activeServerId.value) {
        await streaming.setActiveServer(created.id);
      }
      toast.success(t("streaming.server.added"));
    }
    serverModalOpen.value = false;
  } catch (e: any) {
    toast.error(e?.message || "保存失败");
  } finally {
    submitting.value = false;
  }
};

const handleDeleteServer = async (id: string): Promise<void> => {
  await streaming.removeServer(id);
  toast.success(t("streaming.server.removed"));
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 顶栏 -->
    <div class="shrink-0 px-5 pb-2">
      <div class="flex items-center justify-between mt-2 mb-4 gap-4 flex-wrap">
        <!-- 标题 + 状态徽章 + 统计信息 -->
        <div class="flex items-center gap-3 min-w-0">
          <h1 class="text-3xl font-bold text-on-surface shrink-0">
            {{ t("nav.streamingNas") }}
          </h1>

          <!-- 连接状态指示胶囊 -->
          <div
            v-if="activeServer"
            class="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border border-solid transition-colors"
            :class="
              isConnected
                ? 'bg-green-500/10 text-green-500 border-green-500/25'
                : 'bg-amber-500/10 text-amber-500 border-amber-500/25'
            "
          >
            <span class="relative flex h-2 w-2">
              <span
                v-if="isConnected"
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
              ></span>
              <span
                class="relative inline-flex rounded-full h-2 w-2"
                :class="isConnected ? 'bg-green-500' : 'bg-amber-500'"
              ></span>
            </span>
            <span>{{ isConnected ? "已连接" : "未连接" }}</span>
            <span class="opacity-30">|</span>
            <span class="uppercase tracking-wider font-semibold text-[11px]">
              {{ activeServer.type }}
            </span>
            <template v-if="isConnected">
              <span class="opacity-30">|</span>
              <span class="font-mono text-[11px] text-green-600 dark:text-green-400">28ms</span>
            </template>
          </div>

          <!-- 数量统计 -->
          <Transition name="fade" mode="out-in">
            <span
              v-if="activeServer && isConnected"
              :key="activeTab"
              class="hidden sm:flex items-center gap-1.5 text-sm text-on-surface-variant/60 truncate ml-1"
            >
              <component :is="countMeta.icon" class="size-3.5 shrink-0" />
              {{ countMeta.text }}
            </span>
          </Transition>
        </div>

        <!-- 顶栏操作区 -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- 服务器切换选择器 -->
          <div v-if="servers.length > 0" class="w-44">
            <SSelect
              :model-value="activeServerId ?? ''"
              :options="serverOptions"
              round
              :disabled="loading || reconnecting || servers.length <= 1"
              @update:model-value="handleServerSelect"
            />
          </div>

          <!-- 刷新媒体库 -->
          <SButton
            v-if="activeServer"
            variant="secondary"
            circle
            :disabled="!isConnected || loading"
            @click="handleRefresh"
          >
            <template #icon>
              <IconLucideRefreshCw :class="{ 'animate-spin': loading }" />
            </template>
          </SButton>

          <!-- 更多菜单 -->
          <SDropdownMenu
            v-if="servers.length > 0"
            :items="moreMenuItems"
            align="end"
            @select="handleMoreMenu"
          >
            <template #trigger>
              <SButton variant="secondary" circle>
                <template #icon>
                  <IconLucideMoreHorizontal />
                </template>
              </SButton>
            </template>
          </SDropdownMenu>
        </div>
      </div>

      <!-- 4 个 Tab 切换 -->
      <STabs :model-value="activeTab" :tabs="tabs" @update:model-value="switchTab" />
    </div>

    <!-- 空状态：未配置服务器 -->
    <div v-if="servers.length === 0" class="flex-1 flex items-center justify-center p-6">
      <div class="flex flex-col items-center max-w-md text-center">
        <div class="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 shadow-sm">
          <IconLucideServer class="size-8" />
        </div>
        <h2 class="text-lg font-bold text-on-surface mb-2">尚未配置流媒体服务器</h2>
        <p class="text-sm text-on-surface-variant/70 mb-6 leading-relaxed">
          连接您的 Navidrome、Jellyfin、Emby、Subsonic 等私有 NAS 或自建音乐库，随时畅享高解析度无损串流。
        </p>
        <div class="flex items-center gap-3">
          <SButton type="primary" variant="secondary" round @click="openAddServer">
            <template #icon>
              <IconLucidePlus class="size-4" />
            </template>
            添加流媒体服务器
          </SButton>
        </div>
      </div>
    </div>

    <!-- 已配置服务器但未连接 -->
    <div v-else-if="!isConnected" class="flex-1 flex items-center justify-center p-6">
      <div class="text-center text-on-surface-variant/70 max-w-md px-6">
        <IconLucideUnplug class="size-14 mx-auto mb-4 text-amber-500/60" />
        <h2 class="text-base font-bold text-on-surface mb-1">
          {{ t("streaming.empty.notConnected") }}
        </h2>
        <div
          v-if="connectionStatus.error"
          class="text-xs my-3 px-3 py-2 rounded-lg bg-red-500/10 text-red-500 break-all text-left"
        >
          <div v-if="connectionStatus.errorCode" class="font-medium mb-0.5">
            {{ t(`streaming.errorCode.${connectionStatus.errorCode}`) }}
          </div>
          {{ connectionStatus.error }}
        </div>
        <div v-else class="text-xs mb-4 text-on-surface-variant/60">
          目标服务器：{{ activeServer?.name }} ({{ activeServer?.url }})
        </div>
        <div class="flex items-center justify-center gap-3 mt-4">
          <SButton
            type="primary"
            variant="secondary"
            round
            :loading="reconnecting"
            @click="handleReconnect"
          >
            <template #icon>
              <IconLucidePlugZap class="size-4" />
            </template>
            {{ t("streaming.server.connect") }}
          </SButton>
          <SButton variant="secondary" round @click="manageModalOpen = true">
            管理媒体源
          </SButton>
        </div>
      </div>
    </div>

    <!-- 子路由展示歌曲、专辑、歌手、歌单 -->
    <div v-else class="flex-1 min-h-0">
      <router-view v-slot="{ Component }">
        <KeepAlive
          :max="4"
          :include="['StreamingSongs', 'StreamingAlbums', 'StreamingArtists', 'StreamingPlaylists']"
        >
          <component :is="Component" />
        </KeepAlive>
      </router-view>
    </div>

    <!-- 添加 / 编辑媒体源弹窗 -->
    <SDialog
      v-model:open="serverModalOpen"
      :title="editingServerId ? t('streaming.server.edit') : t('streaming.server.add')"
      width="520px"
    >
      <div class="flex flex-col gap-3 py-1">
        <SFormItem :label="t('streaming.server.type')">
          <SSelect v-model="form.type" :options="TYPE_OPTIONS" />
        </SFormItem>
        <SFormItem :label="t('streaming.server.name')">
          <SInput v-model="form.name" :placeholder="t('streaming.server.namePlaceholder')" />
        </SFormItem>
        <SFormItem :label="t('streaming.server.url')">
          <SInput v-model="form.url" placeholder="http://192.168.1.188:4533" spellcheck="false" />
        </SFormItem>
        <SFormItem :label="t('streaming.server.username')">
          <SInput v-model="form.username" autocomplete="off" />
        </SFormItem>
        <SFormItem :label="t('streaming.server.password')">
          <SInput v-model="form.password" type="password" autocomplete="new-password" />
        </SFormItem>

        <!-- 测试连通性反馈 -->
        <div
          v-if="formError"
          class="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500 break-all"
        >
          {{ formError }}
        </div>
        <div
          v-if="testResult"
          class="rounded-lg px-3 py-2 text-xs break-all border border-solid"
          :class="
            testResult.ok
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
              : 'bg-red-500/10 text-red-500 border-red-500/20'
          "
        >
          <div class="flex items-center gap-2">
            <IconLucideCheck v-if="testResult.ok" class="size-3.5" />
            <span class="font-medium">
              {{ testResult.ok ? t("streaming.server.testOk") : t("streaming.server.testFail") }}
            </span>
            <span v-if="testResult.version" class="opacity-75 font-mono">
              {{ testResult.version }}
            </span>
          </div>
          <div v-if="testResult.error" class="mt-1 opacity-80">{{ testResult.error }}</div>
        </div>
      </div>

      <template #footer="{ close }">
        <SButton variant="secondary" :disabled="submitting || testing" @click="close">
          {{ t("common.cancel") }}
        </SButton>
        <SButton
          variant="secondary"
          :loading="testing"
          :disabled="submitting"
          @click="handleTestConnection"
        >
          {{ t("streaming.server.test") }}
        </SButton>
        <SButton
          variant="secondary"
          type="primary"
          :loading="submitting"
          :disabled="testing"
          @click="handleSaveServer"
        >
          {{ t("common.save") }}
        </SButton>
      </template>
    </SDialog>

    <!-- 管理媒体源弹窗 -->
    <SDialog
      v-model:open="manageModalOpen"
      title="媒体源管理"
      width="640px"
    >
      <div class="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
        <div
          v-for="cfg in servers"
          :key="cfg.id"
          class="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-solid border-outline-variant/15 bg-surface-panel"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-on-surface truncate">{{ cfg.name }}</span>
              <STag size="tiny" type="default" variant="soft" class="uppercase font-mono">
                {{ cfg.type }}
              </STag>
              <STag
                v-if="cfg.id === activeServerId"
                size="tiny"
                :type="isConnected ? 'success' : 'warning'"
                variant="soft"
              >
                {{ isConnected ? "当前连接" : "激活中" }}
              </STag>
            </div>
            <div class="mt-1 text-xs text-on-surface-variant/70 font-mono break-all">
              {{ cfg.username }}@{{ cfg.url }}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <SButton
              v-if="cfg.id !== activeServerId"
              variant="secondary"
              size="small"
              type="primary"
              @click="streaming.setActiveServer(cfg.id)"
            >
              设为激活
            </SButton>
            <SButton
              variant="secondary"
              size="small"
              @click="
                manageModalOpen = false;
                openEditServer(cfg);
              "
            >
              <template #icon>
                <IconLucideEdit class="size-3.5" />
              </template>
              编辑
            </SButton>
            <SButton
              variant="secondary"
              size="small"
              type="error"
              :disabled="servers.length <= 1"
              @click="handleDeleteServer(cfg.id)"
            >
              <template #icon>
                <IconLucideTrash class="size-3.5" />
              </template>
              删除
            </SButton>
          </div>
        </div>

        <div v-if="servers.length === 0" class="py-6 text-center text-sm text-on-surface-variant/60">
          暂无已配置的流媒体源
        </div>
      </div>

      <template #footer="{ close }">
        <div class="flex items-center justify-between w-full">
          <SButton
            variant="secondary"
            @click="
              manageModalOpen = false;
              openAddServer();
            "
          >
            <template #icon>
              <IconLucidePlus class="size-4" />
            </template>
            添加新媒体源
          </SButton>
          <SButton variant="secondary" @click="close">
            {{ t("common.close") }}
          </SButton>
        </div>
      </template>
    </SDialog>
  </div>
</template>
