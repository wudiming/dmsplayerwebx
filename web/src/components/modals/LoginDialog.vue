<script setup lang="ts">
import { useUserStore } from "@/stores/user";
import { toast } from "@/composables/useToast";
import { dialog } from "@/composables/useDialog";
import { neteaseQrLoginAdapter } from "@/apis/login/netease";
import QrLoginPanel from "@/components/modals/QrLoginPanel.vue";
import LoginCookieDialog from "@/components/modals/LoginCookieDialog.vue";
import LoginWebAssistDialog from "@/components/modals/LoginWebAssistDialog.vue";
import SLogo from "@/components/ui/SLogo.vue";
import SDialog from "@/components/ui/SDialog.vue";
import SButton from "@/components/ui/SButton.vue";
import IconLucideScanLine from "~icons/lucide/scan-line";
import IconLucideKeyRound from "~icons/lucide/key-round";
import IconLucideX from "~icons/lucide/x";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const { t } = useI18n();
const user = useUserStore();
const adapter = neteaseQrLoginAdapter;
const panelRef = useTemplateRef("panelRef");
const loading = ref(false);
const cookieDialogOpen = ref(false);
const webAssistOpen = ref(false);

const finishLogin = async (): Promise<boolean> => {
  const ok = await user.fetchStatus();
  if (ok) {
    toast.success(t("login.success"));
    emit("update:open", false);
    return true;
  }
  toast.error(t("login.failed"));
  return false;
};

const handleQrSuccess = async (): Promise<void> => {
  loading.value = true;
  try {
    if (!(await finishLogin())) void panelRef.value?.refresh();
  } finally {
    loading.value = false;
  }
};

const startAutoFetch = async (): Promise<void> => {
  if (loading.value) return;

  // 1. 识别启动的浏览器是否为 Chromium 内核 (Chrome / Edge / Opera 等)
  const isChromium = (window.api.apis as any).isChromium?.() ?? true;
  if (!isChromium) {
    toast.warning("当前浏览器非 Chrome / Edge 等 Chromium 内核，无法使用小窗自动获取。请使用「扫码登录」或「手动输入 Cookie」。");
    return;
  }

  // 2. 使用前告知与确认
  const ok = await dialog.confirm({
    title: t("login.autoFetchTitle"),
    content: t("login.autoFetchTip"),
    confirmText: t("login.autoFetchConfirm"),
    type: "warning",
  });
  if (!ok) return;

  loading.value = true;
  panelRef.value?.pause();
  try {
    // 3. 优先检测本地或现有凭证（如根目录下已有凭证）
    const detect = await (window.api.apis as any).detectLocalCookie?.("netease");
    if (detect?.ok) {
      if (await finishLogin()) return;
    }

    // 4. 打开官方登录网页小窗
    const result = await window.api.apis.openLoginWeb("netease");
    if (!result.ok) {
      if (result.error === "not_chromium") {
        toast.warning(result.message || "当前浏览器非 Chromium 内核，请使用扫码登录");
      } else if (result.error === "popup_blocked") {
        toast.warning(result.message || "浏览器拦截了弹出小窗，请允许弹窗后重试");
      } else if (result.error !== "canceled") {
        toast.error(t("login.failed"));
      }
      panelRef.value?.resume();
      return;
    }

    // 小窗唤起成功，打开网页登录助手弹窗
    webAssistOpen.value = true;
  } finally {
    loading.value = false;
  }
};

const openManualCookie = (): void => {
  panelRef.value?.pause();
  cookieDialogOpen.value = true;
};

const onCookieDialogOpen = (open: boolean): void => {
  cookieDialogOpen.value = open;
  if (!open && props.open) panelRef.value?.resume();
};

const onWebAssistOpen = (open: boolean): void => {
  webAssistOpen.value = open;
  if (!open && props.open) panelRef.value?.resume();
};

const onWebAssistSuccess = async (): Promise<void> => {
  webAssistOpen.value = false;
  await finishLogin();
};
</script>

<template>
  <SDialog :open="open" :closable="false" width="380px" @update:open="emit('update:open', $event)">
    <div class="flex flex-col items-center gap-4 py-3">
      <div class="flex flex-col items-center gap-2">
        <SLogo :size="48" />
        <div class="text-xl font-semibold text-on-surface">SPlayer-Next</div>
      </div>
      <QrLoginPanel
        ref="panelRef"
        class="mt-4"
        :active="open"
        :adapter="adapter"
        @success="handleQrSuccess"
      />
      <div class="flex items-center gap-2 pt-1">
        <SButton variant="ghost" size="small" :disabled="loading" @click="startAutoFetch">
          <template #icon><IconLucideScanLine /></template>
          {{ t("login.autoFetch") }}
        </SButton>
        <div class="h-3 w-px bg-outline-variant/40" />
        <SButton variant="ghost" size="small" :disabled="loading" @click="openManualCookie">
          <template #icon><IconLucideKeyRound /></template>
          {{ t("login.manualCookie") }}
        </SButton>
      </div>
    </div>
    <template #footer="{ close }">
      <SButton variant="tertiary" class="mx-auto" :disabled="loading" @click="close">
        <template #icon><IconLucideX /></template>
        {{ t("common.cancel") }}
      </SButton>
    </template>
  </SDialog>
  <LoginCookieDialog
    :open="cookieDialogOpen"
    @update:open="onCookieDialogOpen"
    @success="emit('update:open', false)"
  />
  <LoginWebAssistDialog
    :open="webAssistOpen"
    @update:open="onWebAssistOpen"
    @success="onWebAssistSuccess"
  />
</template>
