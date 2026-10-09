import type { VocabEntry } from "../../core/model/entry";
import type { ExpandState } from "./WordRow";
import type { WordTab } from "./wordUi";

// ── Pure/standalone bits pulled out of WordRow so they can be unit-tested
// without a DOM (vitest here runs in node — see AGENT.md §5a.2) and reused
// by wordHeader.ts's word-page fields (1006-2 #12) without a second save
// path. ──────────────────────────────────────────────────────────────

// Fields a user can edit from either the row's 資料 tab (a reduced set
// now, 1006-2 #12) or the word page (the full set, now that the row
// doesn't show them any more).
export type EditableField =
  | "synonyms"
  | "antonyms"
  | "example"
  | "definition"
  | "definitionZh"
  | "phonetic"
  | "partOfSpeech"
  | "grammar"
  | "level";

export interface FieldStore {
  setLiked(entry: VocabEntry, liked: boolean): Promise<unknown>;
  touch(entry: VocabEntry): Promise<unknown>;
}

// Writes one field back and stamps the entry — the first edit on a word
// that isn't liked yet also likes it (規格 #15, same trigger as any other
// auto-like); every edit after that just touches it (updatedAt/rev for
// merge.ts). The one save path for a field edit, whichever surface it
// came from.
export async function commitEntryField(store: FieldStore, entry: VocabEntry, key: EditableField, value: string): Promise<void> {
  entry[key] = value;
  if (!entry.liked) await store.setLiked(entry, true);
  else await store.touch(entry);
}

// Nothing can reach "full" any more (1009 #1 took the sheet's own 顯示更多
// button away too, after #10 already took it off a plain row) — 展開 is
// just the old 半開, sheet or not. A caller's persisted expandState map
// may still hold a stale "full" from before either change; normalize it
// here instead of touching those maps.
export function normalizeExpand(state: ExpandState): ExpandState {
  return state === "full" ? "half" : state;
}

// 1009 #1: a row's variant now only changes three things about the
// header/collapse behaviour — every other bit of content (fields, footer,
// ♥ position, the Info/AI switch) is identical between the sidebar row
// and the iPhone sheet (WordRow.ts, WordSheet.ts).
export interface RowLayout {
  // The sheet is never collapsed — it's the whole bottom sheet's content.
  alwaysOpen: boolean;
  // A non-sheet row gets the ▾/▴ expand indicator in the header.
  chevron: boolean;
  // A non-sheet row's header click toggles collapsed/half.
  headerToggle: boolean;
}

export function rowLayout(variant: "row" | "sheet" = "row"): RowLayout {
  const sheet = variant === "sheet";
  return { alwaysOpen: sheet, chevron: !sheet, headerToggle: !sheet };
}

// 1009 #1: the footer's Info/AI toggle, as a pure function of which screen
// is showing and how many questions are in the word's AI thread — no DOM,
// no i18n call (label is the i18n *key*; the caller runs it through t()).
export interface ViewToggleSpec {
  icon: "sparkles" | "book-open";
  label: "word.tab.ai" | "word.tab.data";
  // Only shown on the Info screen, and only once there's at least one
  // question (matches the old tab-bar badge, 規格 #10).
  count: number | null;
}

export function viewToggleSpec(current: WordTab, aiQuestionCount: number): ViewToggleSpec {
  if (current === "ai") return { icon: "book-open", label: "word.tab.data", count: null };
  return { icon: "sparkles", label: "word.tab.ai", count: aiQuestionCount > 0 ? aiQuestionCount : null };
}

// 程度：逗號分隔的自由文字 tag 列表 → 去頭尾空白、丟掉空字串後的顯示清單。
// 非 sheet 的列用這個畫唯讀 chip（#12）；sheet／單字頁上程度仍是一個可編輯
// 欄位，不經過這個函式。
export function levelTags(level: string | undefined): string[] {
  return (level ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Grows a textarea to fit its content instead of showing a scrollbar/resize
// handle — shared by WordRow's own fields and wordHeader's word-page
// fields (1006-2 #12). Call once on render and again on every keystroke.
export function autoGrowTextarea(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
