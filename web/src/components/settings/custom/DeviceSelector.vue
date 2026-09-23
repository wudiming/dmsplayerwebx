<script setup lang="ts">
import { useStatusStore } from "@/stores/status";
import { useSettingsStore } from "@/stores/settings";
import { refreshDevices, switchDevice } from "@/core/player";

defineOptions({ inheritAttrs: false });

const { t } = useI18n();
const status = useStatusStore();
const settings = useSettingsStore();

// 系统默认
const SYSTEM_DEFAULT = "system-default";

const current = computed(() => settings.player.outputDevice ?? SYSTEM_DEFAULT);

const options = computed(() => {
  const defaultDevice = status.outputDevices.find(
    (device) => device.isDefault || device.id === "default",
  );
  const defaultName = defaultDevice?.name;
  const defaultLabel =
    defaultName && defaultName !== "系统默认音频输出"
      ? `${t("settings.outputDevice.default")}（${defaultName}）`
      : t("settings.outputDevice.default");
  const nonDefaultDevices = status.outputDevices.filter(
    (device) => !device.isDefault && device.id !== "default",
  );
  return [
    { value: SYSTEM_DEFAULT, label: defaultLabel },
    ...nonDefaultDevices.map((device) => ({ value: device.id, label: device.name })),
  ];
});

const onChange = (value: string | number | boolean) => {
  switchDevice(value === SYSTEM_DEFAULT ? null : String(value));
};

onMounted(() => {
  if (status.outputDevices.length === 0) refreshDevices();
});
</script>

<template>
  <SSelect
    :model-value="current"
    :options="options"
    :placeholder="t('settings.outputDevice.default')"
    @update:model-value="onChange"
  />
</template>
