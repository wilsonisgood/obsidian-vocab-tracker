import { getLocale } from "../../core/i18n";

// 1005 回饋 S 新增的字串，暫放這裡（07 §2 規則 3）。整合時搬進
// core/i18n/{zh-TW,en}.ts，再把 lt("…") 換成 t("…")：key 名稱就是要用的
// i18n key。

const L = {
  "sidebar.section.words": { "zh-TW": "單字", en: "Words" },
  "sidebar.section.ai": { "zh-TW": "AI 討論（{n}）", en: "AI discussions ({n})" },
  "sidebar.ai.empty": {
    "zh-TW": "還沒有討論。展開單字切到 AI 分頁，或在閱讀模式點段落旁的 ✦ 就能提問。",
    en: "No discussions yet. Open a word's AI tab, or click the ✦ next to a paragraph in reading view.",
  },
  "sidebar.ai.kind.word": { "zh-TW": "單字", en: "Word" },
  "sidebar.ai.kind.paragraph": { "zh-TW": "段落", en: "Paragraph" },
  "sidebar.ai.showAll": { "zh-TW": "顯示全部（{n}）", en: "Show all ({n})" },
  "sidebar.ai.showLess": { "zh-TW": "只顯示最近的", en: "Show recent only" },
  "sidebar.group.family": { "zh-TW": "字族樹：{name}", en: "Word family: {name}" },
  "sidebar.group.familyGone": { "zh-TW": "字族樹（字族已移除）", en: "Word family (removed)" },
  "sidebar.group.familyOpen": { "zh-TW": "開啟字族樹", en: "Open word families" },
  "sidebar.group.wordlist": { "zh-TW": "考試字表", en: "Exam word lists" },
  "sidebar.group.none": { "zh-TW": "（沒有來源筆記）", en: "(no note)" },
  "row.meta.updated": { "zh-TW": "更新時間：{date}", en: "Updated: {date}" },
  "row.meta.dates": { "zh-TW": "加入 {added} · 更新 {updated}", en: "Added {added} · Updated {updated}" },
  "row.meta.addedOnly": { "zh-TW": "加入 {added}", en: "Added {added}" },
} as const;

export type PendingKey = keyof typeof L;

export function lt(key: PendingKey, params?: Record<string, string | number>): string {
  const entry = L[key];
  const template = getLocale() === "zh-TW" ? entry["zh-TW"] : entry.en;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

// For the report / tests: every pending key with both texts.
export const PENDING_STRINGS = L;
