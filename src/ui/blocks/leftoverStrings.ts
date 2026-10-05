import { getLocale } from "../../core/i18n";

// Temporary strings for task L (one-word review, learned-word links).
// Integration moves both tables into core/i18n/{zh-TW,en}.ts with the same
// keys, replaces L( with t( and deletes this file.

const zhTW = {
  "flashcards.single.source": "只複習這個字",
  "flashcards.single.new": "新字：這次評分會開始排程，也會用掉今天的一個新字額度。",
  "flashcards.single.due": "已到期，照常複習。",
  "flashcards.single.early":
    "還沒到期（原定 {date}）。提早複習一樣會記錄：FSRS 依離上次複習的實際間隔計算，現在記得的話，間隔會比到期那天再複習拉長得少；按「忘了」一樣算遺忘、重新學習。",
  "flashcards.single.noCloze": "這個字沒有含有它的例句，不能用例句填空，換個模式吧。",
  "flashcards.single.done": "已記錄「{rating}」",
  "flashcards.single.next": "下次複習：{date}（{interval}後）",
  "flashcards.single.nextSoon": "下次複習：{interval}後",
  "flashcards.single.again": "再複習一次",
  "flashcards.single.close": "完成",
  "learn.openWord": "在側欄打開 {word}",
};

type LeftoverKey = keyof typeof zhTW;

const en: Record<LeftoverKey, string> = {
  "flashcards.single.source": "This word only",
  "flashcards.single.new": "New word: rating it starts its schedule and uses one of today's new-card slots.",
  "flashcards.single.due": "Due — a regular review.",
  "flashcards.single.early":
    "Not due until {date}. An early review still counts: FSRS uses the real time since the last review, so remembering it now stretches the interval less than it would on the due date; Again still counts as forgotten and goes back to relearning.",
  "flashcards.single.noCloze": "This word has no example sentence containing it, so it can't be a cloze card. Pick another mode.",
  "flashcards.single.done": "Saved: {rating}",
  "flashcards.single.next": "Next review: {date} (in {interval})",
  "flashcards.single.nextSoon": "Next review: in {interval}",
  "flashcards.single.again": "Review again",
  "flashcards.single.close": "Done",
  "learn.openWord": "Open {word} in the sidebar",
};

export function L(key: LeftoverKey, params?: Record<string, string | number>): string {
  const template = getLocale() === "zh-TW" ? zhTW[key] : en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

// For the integration report / tests: both dictionaries.
export const LEFTOVER_STRINGS = { "zh-TW": zhTW as Record<LeftoverKey, string>, en };
