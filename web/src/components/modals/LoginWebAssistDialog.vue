<script setup lang="ts">
import { toast } from "@/composables/useToast";
import { useUserStore } from "@/stores/user";
import SDialog from "@/components/ui/SDialog.vue";
import SButton from "@/components/ui/SButton.vue";
import SInput from "@/components/ui/SInput.vue";
import SAlert from "@/components/ui/SAlert.vue";
import IconLucideClipboardCheck from "~icons/lucide/clipboard-check";
import IconLucideRefreshCw from "~icons/lucide/refresh-cw";
import IconLucideExternalLink from "~icons/lucide/external-link";
import IconLucideKeyRound from "~icons/lucide/key-round";
import IconLucideQrCode from "~icons/lucide/qr-code";
import IconLucideX from "~icons/lucide/x";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  success: [];
}>();

const { t } = useI18n();
const user = useUserStore();

const rawInput = ref("");
const loading = ref(false);

const finishLogin = async (): Promise<boolean> => {
  const ok = await user.fetchStatus();
  if (ok) {
    toast.success(t("login.success"));
    emit("success");
    emit("update:open", false);
    return true;
  }
  return false;
};

/** 从剪贴板一键读取并登录 */
const readFromClipboard = async (): Promise<void> => {
  if (loading.value) return;
  try {
    if (!navigator.clipboard?.readText) {
      toast.error("当前浏览器环境不支持直接读取剪贴板，请在下方文本框直接粘贴");
      return;
    }
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) {
      toast.info("剪贴板为空，请先在登录小窗复制 MUSIC_U 后再试");
      return;
    }
    loading.value = true;
    const res = await window.api.apis.setCookie("netease", text);
    if (res?.ok) {
      if (await finishLogin()) return;
    }
    rawInput.value = text;
    toast.error("未在剪贴板中检测到有效的 MUSIC_U 登录凭证");
  } catch (err: any) {
    toast.error("读取剪贴板失败，请在下方文本框直接粘贴");
  } finally {
    loading.value = false;
  }
};

/** 重新触发本地凭证检测 */
const checkLocalCredential = async (): Promise<void> => {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await (window.api.apis as any).detectLocalCookie?.("netease");
    if (res?.ok) {
      if (await finishLogin()) return;
    }
    toast.info("未检测到本地现成凭证，请在小窗登录后点击「从剪贴板读取」");
  } finally {
    loading.value = false;
  }
};

/** 手动输入提交 */
const submitInput = async (): Promise<void> => {
  const val = rawInput.value.trim();
  if (!val) {
    toast.error("请输入有效的 MUSIC_U 或 Cookie");
    return;
  }
  loading.value = true;
  try {
    const res = await window.api.apis.setCookie("netease", val);
    if (!res?.ok) {
      toast.error(t("login.cookieInvalid"));
      return;
    }
    if (!(await finishLogin())) {
      toast.error(t("login.failed"));
    }
  } finally {
    loading.value = false;
  }
};

/** 重新打开官方小窗 */
const reopenLoginWindow = (): void => {
  const width = 1000;
  const height = 680;
  const left = Math.max(0, Math.round(((window.screen?.width || 1280) - width) / 2));
  const top = Math.max(0, Math.round(((window.screen?.height || 800) - height) / 2));
  const features = `width=${width},height=${height},left=${left},top=${top},popup=yes,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes`;
  const win = window.open("https://music.163.com/#/login", "netease_login_window", features);
  if (!win) {
    toast.warning("浏览器拦截了弹出窗口，请在地址栏右侧允许弹出窗口");
    return;
  }
  try {
    win.focus();
  } catch {}
};

// 监听窗口重新获得焦点：若用户在小窗复制后切换回本页面，提供自动静默同步机会
const onWindowFocus = async () => {
  if (!props.open || loading.value) return;
  try {
    const res = await (window.api.apis as any).detectLocalCookie?.("netease");
    if (res?.ok) {
      await finishLogin();
    }
  } catch {}
};

onMounted(() => {
  window.addEventListener("focus", onWindowFocus);
});

onUnmounted(() => {
  window.removeEventListener("focus", onWindowFocus);
});
</script>

<template>
  <SDialog
    :open="open"
    title="网易云网页登录助手"
    width="460px"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-4 py-1">
      <SAlert type="info">
        <div class="flex items-center justify-between gap-2">
          <span>官方登录窗口已在浏览器小窗弹出，请在小窗内完成登录。</span>
          <button
            type="button"
            class="text-primary hover:underline text-xs flex items-center gap-1 shrink-0 font-medium cursor-pointer bg-transparent border-0"
            @click="reopenLoginWindow"
          >
            <span>重开小窗</span>
            <IconLucideExternalLink class="size-3.5" />
          </button>
        </div>
      </SAlert>

      <div class="grid grid-cols-2 gap-2.5">
        <SButton
          type="primary"
          variant="secondary"
          class="w-full justify-center"
          :loading="loading"
          @click="readFromClipboard"
        >
          <template #icon><IconLucideClipboardCheck class="size-4" /></template>
          从剪贴板读取登录
        </SButton>
        <SButton
          variant="secondary"
          class="w-full justify-center"
          :loading="loading"
          @click="checkLocalCredential"
        >
          <template #icon><IconLucideRefreshCw class="size-4" /></template>
          检测本地凭证
        </SButton>
      </div>

      <div class="flex flex-col gap-1.5 pt-1">
        <div class="text-xs text-on-surface-variant flex items-center gap-1">
          <IconLucideKeyRound class="size-3.5 text-primary" />
          <span>也可以直接在此粘贴 MUSIC_U 值：</span>
        </div>
        <div class="flex gap-2">
          <SInput
            v-model="rawInput"
            type="text"
            clearable
            placeholder="粘贴 MUSIC_U=... 或 纯十六进制 token"
            :disabled="loading"
            class="flex-1"
            @keyup.enter="submitInput"
          />
          <SButton type="primary" :loading="loading" @click="submitInput">
            确认
          </SButton>
        </div>
      </div>

      <div class="rounded-xl border border-dashed border-outline-variant/30 bg-surface-variant/20 p-3 text-xs text-on-surface-variant leading-relaxed">
        <div class="font-medium text-on-surface mb-1 flex items-center gap-1.5">
          <IconLucideQrCode class="size-4 text-primary" />
          <span>更推荐使用扫码登录</span>
        </div>
        <div>
          若您觉得复制 Cookie 步骤较多，您可以关闭此窗口，直接使用主登录界面的「扫码登录」，使用手机网易云音乐 App 扫一扫即可 100% 全自动秒级登录。
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <SButton variant="tertiary" :disabled="loading" @click="close">
        <template #icon><IconLucideX class="size-4" /></template>
        {{ t("common.cancel") }}
      </SButton>
    </template>
  </SDialog>
</template>
