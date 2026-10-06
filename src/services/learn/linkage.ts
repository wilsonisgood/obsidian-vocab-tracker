import type { VocabEntry } from "../../core/model/entry";
import { familyMembers, type Family } from "../../core/model/family";
import type { TriviaItem } from "../../core/model/trivia";
import { WordIndex } from "./wordIndex";

// What deleting (or editing) a word touches elsewhere in learn.json
// (規劃書 06 §4.1): the families it's a member of, the saved trivia that
// mentions it, and its saved verb usage (收藏). Pure — no LearnStore, no
// Obsidian — so every rule here is unit-tested without a plugin instance.
// main.ts's EntryLinkageService is the thin, stateful wrapper that calls
// these against the live LearnStore and decides when to.

// ── Delete: the confirm dialog's counts ─────────────────────────────

export interface DeletionImpact {
  // Families this word is a member of (text stays; just the link breaks).
  families: number;
  // Other saved trivia answers whose text mentions this word.
  triviaMentions: number;
  // This verb's usage is saved (收藏) to its word page.
  verbFavorite: boolean;
  // 單字/<word>.md exists.
  wordPageExists: boolean;
  // Questions asked in the word's own discussion.
  threadCount: number;
}

export function familiesContaining(families: readonly Family[], entryId: string): Family[] {
  return families.filter((f) => familyMembers(f).some((m) => m.entryId === entryId));
}

export function triviaMentioning(trivia: readonly TriviaItem[], entryId: string): TriviaItem[] {
  return trivia.filter((t) => t.entryId !== entryId && t.mentions.includes(entryId));
}

export function deletionImpact(
  entryId: string,
  data: {
    families: readonly Family[];
    trivia: readonly TriviaItem[];
    hasVerbFavorite: boolean;
    wordPageExists: boolean;
    threadCount: number;
  }
): DeletionImpact {
  return {
    families: familiesContaining(data.families, entryId).length,
    triviaMentions: triviaMentioning(data.trivia, entryId).length,
    verbFavorite: data.hasVerbFavorite,
    wordPageExists: data.wordPageExists,
    threadCount: data.threadCount,
  };
}

// Nothing at all linked — the confirm dialog says so instead of an empty list.
export function hasNoLinks(impact: DeletionImpact): boolean {
  return !impact.families && !impact.triviaMentions && !impact.verbFavorite && !impact.wordPageExists && !impact.threadCount;
}

// ── Delete: unlinking (keeps the text, drops the pointer) ───────────

// Clears entryId from every member that carries it, keeping the member's
// word/zh text so the suggestion can be re-added later (「之後可再加回」).
// Returns the same object when nothing changed, so the caller can skip the
// write (and the updatedAt bump) for families that don't need it.
export function clearFamilyMemberEntry(family: Family, entryId: string): Family {
  let changed = false;
  const groups = family.groups.map((g) => {
    if (!g.members.some((m) => m.entryId === entryId)) return g;
    changed = true;
    return {
      ...g,
      members: g.members.map((m) => (m.entryId !== entryId ? m : { word: m.word, zh: m.zh })),
    };
  });
  return changed ? { ...family, groups } : family;
}

// Drops entryId from a trivia item's mentions (反向連結 cleanup). Same
// object when it wasn't there.
export function clearTriviaMention(item: TriviaItem, entryId: string): TriviaItem {
  if (!item.mentions.includes(entryId)) return item;
  return { ...item, mentions: item.mentions.filter((m) => m !== entryId) };
}

// ── Edit: keeping duplicated display text in step with a rename ────

// A family member keeps its own copy of the word's spelling and Chinese
// meaning (so the tree still reads right without looking the entry up);
// syncs them to the entry's current values. Trivia needs no equivalent:
// `mentions` is entryId-only, so a rename never leaves it stale.
export function syncFamilyMemberText(family: Family, entry: Pick<VocabEntry, "id" | "word" | "definitionZh">): Family {
  const stale = (m: { entryId?: string; word: string; zh: string }) =>
    m.entryId === entry.id && (m.word !== entry.word || m.zh !== entry.definitionZh);
  let changed = false;
  const groups = family.groups.map((g) => {
    if (!g.members.some(stale)) return g;
    changed = true;
    return {
      ...g,
      members: g.members.map((m) => (stale(m) ? { ...m, word: entry.word, zh: entry.definitionZh } : m)),
    };
  });
  return changed ? { ...family, groups } : family;
}

// ── Add: backfilling mentions for a word just learned ───────────────

// A trivia answer saved before this word was learned may already name it
// in its text; adds it to `mentions` the first time that's noticed, so the
// word page's back-link shows up without the learner asking again.
// Idempotent — a no-op once the mention is there (or the item is its own).
export function addMentionForNewEntry(item: TriviaItem, entry: VocabEntry, index: WordIndex): TriviaItem {
  if (item.entryId === entry.id || item.mentions.includes(entry.id)) return item;
  const found = index.mentions(`${item.title}\n${item.body}`, new Set([item.entryId])).includes(entry.id);
  return found ? { ...item, mentions: [...item.mentions, entry.id] } : item;
}
