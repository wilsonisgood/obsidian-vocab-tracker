import { en } from "./en";
import { zhTW } from "./zh-TW";

export type Locale = "en" | "zh-TW";
export type I18nKey = keyof typeof en;

const dictionaries: Record<Locale, Record<I18nKey, string>> = { en, "zh-TW": zhTW };

// M0: always "en" — matches current behaviour exactly. Following Obsidian's
// language, or a settings override, lands with the settings page in M3
// (規劃書 06 §9.8).
let activeLocale: Locale = "en";

export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const template = dictionaries[activeLocale][key] ?? dictionaries.en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}
