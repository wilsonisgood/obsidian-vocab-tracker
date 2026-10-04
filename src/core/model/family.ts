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
}

export interface FamilyGroup {
  // e.g. 「烹調」「刀具」 inside the kitchenware family.
  label: string;
  members: FamilyMember[];
}

export interface Family extends Record_ {
  id: string;
  // English key, e.g. "clothing", "gl-".
  topic: string;
  // Chinese display name, e.g. 「服裝」「gl- 發光家族」.
  label: string;
  source: "ai" | "manual";
  groups: FamilyGroup[];
  // Learned words the family grew from (「起點：你學過的 aprons、kitchenware」).
  seedEntryIds?: string[];
  // Size of the vocab list when the AI grouped it, so L5 can offer
  // 「有新單字，要重新分群嗎」 once the list has grown by 20% (§7.2).
  entryCountAtGenerate?: number;
}

// VocabEntry.origin for words added from a family (「來源標記為字族：clothing」).
export type FamilyOrigin = `family:${string}`;

export function familyOrigin(familyId: string): FamilyOrigin {
  return `family:${familyId}`;
}

export function familyMembers(f: Family): FamilyMember[] {
  return f.groups.flatMap((g) => g.members);
}
