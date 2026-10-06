import type { Record_ } from "./entry";

// Word families (規劃書 06 §4.1, §7.2). Persisted in store/learn.json,
// owned by services/learn/LearnStore. Many-to-many: a word can sit in
// several families, and a member is either a learned word (entryId set) or
// a plain suggested word the learner hasn't added yet.

export interface FamilyMember {
  // Set when the word is in the vocab list (matched at save time, or added
  // from the family). Absent = suggestion only.
  entryId?: string;
  word: string;
  zh: string;
  // Wave 9 F (09 §2 決定 1, A7) — shown beside the member in the galaxy /
  // DNA views. Mirrors wordMeta's emoji but lives on the family so a
  // suggestion with no entryId (nothing to key a wordMeta by) still gets
  // one.
  emoji?: string;
}

export interface FamilyGroup {
  // e.g. 「烹調」「刀具」 inside the kitchenware family.
  label: string;
  members: FamilyMember[];
}

// Which AI run made a family (§7.2). "list": the 字族樹's grouping of the
// whole vocab list — 重新分群 replaces these. "word": 找字族 around one
// word (word page, or a `word:` families block) — 重新分群 keeps these.
export type FamilyScope = "list" | "word";

export interface Family extends Record_ {
  id: string;
  // English key, e.g. "clothing", "gl-".
  topic: string;
  // Chinese display name, e.g. 「服裝」「gl- 發光家族」.
  label: string;
  source: "ai" | "manual";
  // Absent on families saved before it existed: see familyScope().
  scope?: FamilyScope;
  // Set on the tombstone when 重新分群 (not the user) removed the family,
  // so a merge can tell it from a delete the user meant (learnMerge.ts).
  deletedBy?: "regroup";
  groups: FamilyGroup[];
  // Learned words the family grew from (「起點：你學過的 aprons、kitchenware」).
  seedEntryIds?: string[];
  // Size of the vocab list when the AI grouped it, so L5 can offer
  // 「有新單字，要重新分群嗎」 once the list has grown by 20% (§7.2).
  entryCountAtGenerate?: number;
  // Wave 9 F (09 §2 決定 1, A7) — the family's own emoji (galaxy center
  // node).
  emoji?: string;
}

// VocabEntry.origin for words added from a family (「來源標記為字族：clothing」).
export type FamilyOrigin = `family:${string}`;

export function familyOrigin(familyId: string): FamilyOrigin {
  return `family:${familyId}`;
}

// The family a word was added from (the inverse of familyOrigin); null for
// any other origin. Shared by the word page's 「來源：字族樹 …」 chip and the
// sidebar's grouping (ui/word/wordOrder.ts).
export function originFamilyId(origin: string | undefined): string | null {
  if (!origin?.startsWith("family:")) return null;
  const id = origin.slice("family:".length).trim();
  return id || null;
}

// A family's scope, inferring it for families saved without the field:
// 找字族 always grows a family from one seed word, the whole-list grouping
// never sends seeds — so seeds mean "word". A manual family is never
// replaced by 重新分群 either, so it counts as "word" too.
export function familyScope(f: Pick<Family, "scope" | "seedEntryIds" | "source">): FamilyScope {
  if (f.scope === "list" || f.scope === "word") return f.scope;
  if (f.source === "manual") return "word";
  return f.seedEntryIds?.length ? "word" : "list";
}

export function familyMembers(f: Family): FamilyMember[] {
  return f.groups.flatMap((g) => g.members);
}
