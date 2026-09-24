import type { SettingCategory } from "@/types/settings-schema";
import { LOCALES } from "@shared/types/settings";
import StorageManager from "@/components/settings/custom/StorageManager.vue";
import IconLucideCog from "~icons/lucide/cog";

const generalCategory: SettingCategory = {
  id: "general",
  icon: IconLucideCog,
  sections: [
    {
      id: "language",
      items: [
        {
          key: "language",
          type: "select",
          binding: { store: "settings", path: "locale" },
          options: LOCALES.map(({ value, label }) => ({ value, label })),
          defaultValue: "zh-CN",
        },
      ],
    },
    {
      id: "backupReset",
      items: [
        {
          key: "storageManager",
          type: "custom",
          component: StorageManager,
          fullWidth: true,
          keywords: [
            "settings.backup.label",
            "settings.restore.label",
            "settings.resetSettings.label",
            "settings.resetAll.label",
          ],
        },
      ],
    },
  ],
};

export default generalCategory;
