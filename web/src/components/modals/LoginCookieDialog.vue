<script setup lang="ts">
import { toast } from "@/composables/useToast";
import { useUserStore } from "@/stores/user";
import IconLucideExternalLink from "~icons/lucide/external-link";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  /** 登录成功 */
  success: [];
}>();

const { t } = useI18n();
const user = useUserStore();

const raw = ref("");
const loading = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      raw.value = "";
      loading.value = false;
    }
  },
);

const submit = async (): Promise<void> => {
  let value = raw.value.trim();
  if (!value) {
    toast.error(t("login.cookieInvalid"));
    return;
  }
  if (!/MUSIC_U\s*=/i.test(value)) {
    if (/^[a-fA-F0-9]{32,}/.test(value)) {
      value = `MUSIC_U=${value}`;
    } else {
      toast.error(t("login.cookieInvalid"));
      return;
    }
  }
  loading.value = true;
  try {
    const res = await window.api.apis.setCookie("netease", value);
    if (!res.ok) {
      toast.error(t("login.cookieInvalid"));
      return;
    }
    const ok = await user.fetchStatus();
    if (!ok) {
      toast.error(t("login.failed"));
      return;
    }
    toast.success(t("login.success"));
    emit("success");
    emit("update:open", false);
  } finally {
    loading.value = false;
  }
};

const onOpenUpdate = (value: boolean): void => emit("update:open", value);
</script>

<template>
  <SDialog :open="open" :title="t('login.manualCookie')" width="420px" @update:open="onOpenUpdate">
    <div class="flex flex-col gap-3">
      <SAlert>
        <div class="flex items-center justify-between gap-2">
          <span>{{ t("login.cookieHint") }}</span>
          <a
            href="https://music.163.com"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary hover:underline text-xs flex items-center gap-1 shrink-0 font-medium cursor-pointer"
          >
            <span>打开官方网页</span>
            <IconLucideExternalLink class="size-3.5" />
          </a>
        </div>
      </SAlert>
      <SInput
        v-model="raw"
        type="textarea"
        :rows="4"
        clearable
        :placeholder="t('login.cookiePlaceholder')"
        :disabled="loading"
      />
    </div>
    <template #footer="{ close }">
      <SButton variant="tertiary" :disabled="loading" @click="close">
        {{ t("common.cancel") }}
      </SButton>
      <SButton type="primary" :loading="loading" @click="submit">
        {{ t("login.cookieConfirm") }}
      </SButton>
    </template>
  </SDialog>
</template>
