import { getLocale, t, type I18nKey } from "../../core/i18n";
import { POS_KEYS, type PosKey } from "../../core/model/usage";
import type { ExportLabels } from "./types";

// Headings and fixed text written into exported notes, in the plugin's
// current language (`export.*` keys in core/i18n).

// 1006-2 #19 #22 — 用法按詞性分段的小標題文字，還沒接上 core/i18n（整合事
// 項：搬進 src/core/i18n/{zh-TW,en}.ts，key 建議 "export.usagePos.<pos>"，
// 一個 pos 一個 key），先用暫時的 const（locateWord.ts 已有這個先例）。
const POS_NAME: Record<"zh-TW" | "en", Record<PosKey, string>> = {
  "zh-TW": {
    n: "名詞",
    v: "動詞",
    adj: "形容詞",
    adv: "副詞",
    prep: "介係詞",
    conj: "連接詞",
    pron: "代名詞",
    interj: "感嘆詞",
  },
  en: {
    n: "Noun",
    v: "Verb",
    adj: "Adjective",
    adv: "Adverb",
    prep: "Preposition",
    conj: "Conjunction",
    pron: "Pronoun",
    interj: "Interjection",
  },
};

function posHeading(locale: "zh-TW" | "en", pos: PosKey): string {
  const name = POS_NAME[locale][pos];
  return locale === "zh-TW" ? `${name}用法` : `${name} usage`;
}

// 「動詞用法」等小標題文字，給 wordPage.ts 的 renderUsage() 分段用
// (1006-2 #19)，和 verbs.ts 的用法總表分段用 (#22)。
export function usagePosHeadings(): Record<PosKey, string> {
  const locale = getLocale();
  const out = {} as Record<PosKey, string>;
  for (const pos of POS_KEYS) out[pos] = posHeading(locale, pos);
  return out;
}

// usagePosHeadings() 的反查：WordPageDecorator 認得 h3 是哪個詞性的小標
// 題，好掛「重新產生」按鈕。兩種語言都試一次 —— 筆記可能是在切換語言前
// 寫的（sectionByTitle() 對四個主要小節也是同樣的容忍度）。
export function posOfUsageHeading(title: string): PosKey | null {
  const text = title.trim();
  for (const locale of ["zh-TW", "en"] as const) {
    for (const pos of POS_KEYS) {
      if (posHeading(locale, pos) === text) return pos;
    }
  }
  return null;
}

// "usagePosHeading" is set separately below (it's a Record<PosKey,
// string>, not a plain string like the rest) — excluded here so the loop
// assignment below stays a plain string→string write instead of widening
// to the intersection of every ExportLabels value type.
const KEYS: Exclude<keyof ExportLabels, "usagePosHeading">[] = [
  "families",
  "familiesEmpty",
  "usage",
  "usageEmpty",
  "usageRelated",
  "trivia",
  "triviaEmpty",
  "triviaMentionedIn",
  "morphemes",
  "discussion",
  "discussionEmpty",
  "userNotesHint",
  "paragraphsEmpty",
  "paragraphOrphaned",
  "wordsLearned",
  "wordsEmpty",
  "wordQuestions",
  "favorites",
  "favoritesEmpty",
  "aborted",
  "usageSaved",
  "usageGenerated",
];

export function exportLabels(): ExportLabels {
  const labels = {} as ExportLabels;
  for (const key of KEYS) labels[key] = t(`export.${key}` as I18nKey);
  labels.usagePosHeading = usagePosHeadings();
  return labels;
}
