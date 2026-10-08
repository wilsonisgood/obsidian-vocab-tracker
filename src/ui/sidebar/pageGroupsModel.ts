import type { VocabEntry } from "../../core/model/entry";
import type { PageGroup, PageWord } from "../page/pageContext";
import { levelTags } from "../word/rowModel";
import { tagLabel } from "../../core/wordlists/parse";

// 第十波 S（規格 1007-2 #8, #13）: pure tiering/counting for the sidebar's
// 「本篇」 page mode (字族樹／Word DNA). No DOM here so it's unit-tested
// without the fake-DOM harness — pageGroups.ts draws these rows.

export type PageRowKind = "liked" | "unliked" | "suggested";

export interface PageRow {
  kind: PageRowKind;
  word: PageWord;
  // Set for "liked"/"unliked" (the word is in the vocab library, alive).
  entry?: VocabEntry;
  // Small morpheme tags (#13: 「trans-」…) — every morpheme this word was
  // listed under in this group, in first-seen order, deduped.
  morphemeLabels: string[];
  // Display-ready level/exam tags (already run through levelTags/tagLabel
  // — the row never needs to know which source they came from).
  levelTags: string[];
}

const TIER_ORDER: Record<PageRowKind, number> = { liked: 0, unliked: 1, suggested: 2 };

function isAlive(entry: VocabEntry | undefined): entry is VocabEntry {
  return !!entry && !entry.deletedAt;
}

// 規格 #8: 已 like 的字 → 單字庫裡有但沒 like 的字 → 單字庫裡沒有的建議字；
// 同一層照頁面上的順序。同一個字（小寫比對）在同一類裡出現多次（DNA 的不
// 同字素）合併成一列，字素標籤合併、保留第一次出現的位置。
export function tierPageWords(
  words: readonly PageWord[],
  entryById: (id: string) => VocabEntry | undefined,
  tagsOf: (word: string) => readonly string[]
): PageRow[] {
  interface Rec {
    word: PageWord;
    morphemeLabels: string[];
    order: number;
  }
  const byKey = new Map<string, Rec>();
  let order = 0;
  for (const w of words) {
    const key = w.word.toLowerCase();
    let rec = byKey.get(key);
    if (!rec) {
      rec = { word: w, morphemeLabels: [], order: order++ };
      byKey.set(key, rec);
    }
    const label = w.morpheme?.label;
    if (label && !rec.morphemeLabels.includes(label)) rec.morphemeLabels.push(label);
  }

  const rows: (PageRow & { order: number })[] = [];
  for (const rec of byKey.values()) {
    const entry = rec.word.entryId ? entryById(rec.word.entryId) : undefined;
    const alive = isAlive(entry);
    const kind: PageRowKind = !alive ? "suggested" : entry.liked ? "liked" : "unliked";
    const tags = alive ? levelTags(entry.level) : tagsOf(rec.word.word).map(tagLabel);
    rows.push({
      kind,
      word: rec.word,
      entry: alive ? entry : undefined,
      morphemeLabels: rec.morphemeLabels,
      levelTags: tags,
      order: rec.order,
    });
  }

  rows.sort((a, b) => TIER_ORDER[a.kind] - TIER_ORDER[b.kind] || a.order - b.order);
  return rows.map(({ order: _order, ...row }) => row);
}

// 規格 #9: 頁面模式下「單字（n）」＝所有分類裡不重複的字數（含建議字）——
// 小寫去重，跨分類也算同一個字。
export function uniquePageWordCount(groups: readonly PageGroup[]): number {
  const seen = new Set<string>();
  for (const g of groups) for (const w of g.words) seen.add(w.word.toLowerCase());
  return seen.size;
}

// 單字庫裡有的字（entryId 存在），同一個 entryId 跨分類只算一次、保留第一
// 次出現的位置——scopedEntries() 在頁面模式用這個當 AI 討論／文法的範圍。
export function pageScopedEntries(groups: readonly PageGroup[], entries: readonly VocabEntry[]): VocabEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e] as const));
  const seen = new Set<string>();
  const out: VocabEntry[] = [];
  for (const g of groups) {
    for (const w of g.words) {
      if (!w.entryId || seen.has(w.entryId)) continue;
      const e = byId.get(w.entryId);
      if (!e) continue;
      seen.add(w.entryId);
      out.push(e);
    }
  }
  return out;
}

// 一個分類裡出現過的 entryId（去重）——sections.ts 的 planReveal 用來判斷
// 一個字屬於哪些頁面分類。
export function pageGroupEntryIds(group: PageGroup): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const w of group.words) {
    if (w.entryId && !seen.has(w.entryId)) {
      seen.add(w.entryId);
      ids.push(w.entryId);
    }
  }
  return ids;
}

// 規格 #8/#13：頁面切主題／分頁時，只有目前選中的那一類展開，其他收合；
// 使用者之後手動展開／收合由呼叫端自己留著，直到下次 activeGroupKey 變了
// 才再呼叫這個重設一次。
export function resetPageCollapsed(groups: readonly PageGroup[], activeGroupKey: string | null): Set<string> {
  return new Set(groups.map((g) => g.key).filter((k) => k !== activeGroupKey));
}
