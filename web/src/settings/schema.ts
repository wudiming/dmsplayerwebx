import type { SettingCategory } from "@/types/settings-schema";
import generalCategory from "./categories/general";
import appearanceCategory from "./categories/appearance";
import playerCategory from "./categories/player";
import lyricCategory from "./categories/lyric";
import hotkeysCategory from "./categories/hotkeys";
import servicesCategory from "./categories/services";
import mediaSourceCategory from "./categories/streaming";
import downloadCategory from "./categories/download";
import otherCategory from "./categories/other";

export const settingsSchema: SettingCategory[] = [
  generalCategory,
  appearanceCategory,
  playerCategory,
  lyricCategory,
  hotkeysCategory,
  servicesCategory,
  mediaSourceCategory,
  downloadCategory,
  otherCategory,
];
