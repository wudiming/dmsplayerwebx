import { createI18n } from "vue-i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

const getInitialLocale = (): string => {
  try {
    const direct = localStorage.getItem("splayer_web_locale");
    if (direct === "zh-CN" || direct === "en-US") return direct;
    const raw = localStorage.getItem("settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.locale === "zh-CN" || parsed?.locale === "en-US") return parsed.locale;
    }
  } catch {}
  return "zh-CN";
};

const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: "en-US",
  messages: {
    "zh-CN": zhCN,
    "en-US": enUS,
  },
});

export default i18n;
