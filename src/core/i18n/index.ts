import { en } from "./en";
import { zhTW } from "./zh-TW";

export type Locale = "en" | "zh-TW";
export type I18nKey = keyof typeof en;

const dictionaries: Record<Locale, Record<I18nKey, string>> = { en, "zh-TW": zhTW };

// "en" until main.ts applies the user's setting at load (規劃書 06 §9.8:
// follow Obsidian's language by default, overridable in settings).
let activeLocale: Locale = "en";

export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getLocale(): Locale {
  return activeLocale;
}

// Any Chinese Obsidian UI ("zh", "zh-TW", "zh-CN"…) gets the Traditional
// Chinese strings — closer for a Simplified reader than English is.
export function resolveLocale(setting: "auto" | Locale, appLanguage: string): Locale {
  if (setting !== "auto") return setting;
  return appLanguage.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
}

// A list of words in running text: 「aprons、kitchenware」 / "aprons, kitchenware".
export function joinWords(words: readonly string[]): string {
  return words.join(activeLocale === "zh-TW" ? "、" : ", ");
}

export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const template = dictionaries[activeLocale][key] ?? dictionaries.en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}
