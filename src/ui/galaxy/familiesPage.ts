import { familyMembers, type Family } from "../../core/model/family";
import type { PageGroup, PageWord } from "../page/pageContext";
import { familyEmoji, type GalaxyLookup } from "./galaxyModel";

// 規劃書 10 §2.1 #8/#14: 字族樹.md 把「所有主題、每個主題的字」publish 給側
// 欄「本篇」(PageContextHub) — 一個字族一類，分類順序＝主題列順序，成員順序
// ＝字族本身的順序 (familyMembers，跨分組 flatten，不去重／不過濾未學)。
// Pure — no "obsidian" import — so it's unit-tested without a DOM;
// families.ts calls this at the end of every render of the whole-tree
// block.

export function familiesPageGroups(families: readonly Family[], lookup: GalaxyLookup): PageGroup[] {
  return families.map((f) => familyPageGroup(f, lookup));
}

function familyPageGroup(f: Family, lookup: GalaxyLookup): PageGroup {
  const words: PageWord[] = [];
  for (const m of familyMembers(f)) {
    if (!m.word.trim()) continue;
    const entry = lookup.entry(m);
    const word: PageWord = { word: m.word, zh: m.zh, emoji: lookup.emoji(m, entry) };
    // 在庫就給 entryId，不論有沒有 like (#8：「不論有沒有 like」) — 側欄靠
    // entryId 判斷是不是灰色建議字。
    if (entry) word.entryId = entry.id;
    words.push(word);
  }
  return { key: familyGroupKey(f.id), title: `${familyEmoji(f)} ${f.topic} ${f.label}`, words };
}

export function familyGroupKey(familyId: string): string {
  return `family:${familyId}`;
}

// The inverse — groupKey → familyId (selectWord/addWord, families.ts).
export function familyIdOfGroupKey(groupKey: string): string {
  return groupKey.startsWith("family:") ? groupKey.slice("family:".length) : groupKey;
}
