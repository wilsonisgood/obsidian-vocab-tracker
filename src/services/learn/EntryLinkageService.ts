import type { VocabEntry } from "../../core/model/entry";
import type { LearnStore } from "./LearnStore";
import {
  addMentionForNewEntry,
  clearFamilyMemberEntry,
  clearTriviaMention,
  deletionImpact,
  syncFamilyMemberText,
  type DeletionImpact,
} from "./linkage";
import { WordIndex } from "./wordIndex";

// Keeps learn.json's families / saved trivia / saved verb usages in step
// with the vocab list (規劃書 06 §4.1): a deleted word's link is cleared
// everywhere (its text stays, so it can be re-added later); a renamed
// word's duplicated display text (family member word/zh) follows; a
// freshly learned word is checked against already-saved trivia in case
// its text already mentioned it. The data rules live in linkage.ts
// (pure); this class is just the stateful wiring — what counts as "just
// renamed" or "just added" needs last-seen state, which a pure function
// can't hold.

export interface EntryLinkageDeps {
  learn: LearnStore;
  vocab: { readonly entries: readonly VocabEntry[] };
  // Outside learn.json, so they're injected rather than read off LearnStore.
  wordPageExists?(entryId: string, word: string): boolean;
  threadCount?(entryId: string): number;
}

export class EntryLinkageService {
  // entryId → {word, definitionZh} last seen, so sync() can tell a rename
  // from any other edit (the data:changed event itself carries no diff).
  private last = new Map<string, { word: string; definitionZh: string }>();

  constructor(private deps: EntryLinkageDeps) {}

  // Seeds the baseline from the vocab list as it is right now — call once
  // at startup so every already-learned word isn't treated as "just
  // added" the first time sync() runs.
  init(): void {
    this.last.clear();
    for (const e of this.deps.vocab.entries) this.last.set(e.id, snapshot(e));
  }

  // Call after every data:changed. Cheap for the common case (nothing
  // renamed): one Map.get and two string compares per live entry; the
  // heavier family/trivia scans only run for an entry that actually
  // changed or just appeared.
  async sync(): Promise<void> {
    await this.deps.learn.ensureLoaded();
    const entries = this.deps.vocab.entries;
    const live = new Set(entries.map((e) => e.id));
    for (const id of [...this.last.keys()]) if (!live.has(id)) this.last.delete(id);

    for (const e of entries) {
      const before = this.last.get(e.id);
      const now = snapshot(e);
      this.last.set(e.id, now);
      if (!before) this.onNewEntry(e);
      else if (before.word !== now.word || before.definitionZh !== now.definitionZh) this.onRenamed(e);
    }
  }

  // The confirm dialog's counts, before anything is touched.
  impact(entryId: string, word: string): DeletionImpact {
    return deletionImpact(entryId, {
      families: this.deps.learn.families(),
      trivia: this.deps.learn.trivia(),
      // Wave 8 U1 (1006-2 #21): any pos counts, not just "v".
      hasVerbFavorite: this.deps.learn.usageFavoritesFor(entryId).length > 0,
      wordPageExists: this.deps.wordPageExists?.(entryId, word) ?? false,
      threadCount: this.deps.threadCount?.(entryId) ?? 0,
    });
  }

  // Called once the learner has confirmed the delete. The entry itself is
  // soft-deleted by VocabStore separately (main.ts's deleteEntry); this
  // only unlinks it from the learning data.
  unlink(entryId: string): void {
    for (const f of this.deps.learn.families()) {
      const updated = clearFamilyMemberEntry(f, entryId);
      if (updated !== f) this.deps.learn.putFamily(updated);
    }
    for (const item of this.deps.learn.trivia()) {
      const updated = clearTriviaMention(item, entryId);
      if (updated !== item) this.deps.learn.putTrivia(updated);
    }
    // Wave 8 U1 (1006-2 #21): clears every pos's favorite, not just "v".
    this.deps.learn.unfavoriteAllUsages(entryId);
    this.last.delete(entryId);
  }

  private onRenamed(entry: VocabEntry): void {
    for (const f of this.deps.learn.families()) {
      const updated = syncFamilyMemberText(f, entry);
      if (updated !== f) this.deps.learn.putFamily(updated);
    }
  }

  private onNewEntry(entry: VocabEntry): void {
    const index = new WordIndex(this.deps.vocab.entries);
    for (const item of this.deps.learn.trivia()) {
      const updated = addMentionForNewEntry(item, entry, index);
      if (updated !== item) this.deps.learn.putTrivia(updated);
    }
  }
}

function snapshot(e: VocabEntry): { word: string; definitionZh: string } {
  return { word: e.word, definitionZh: e.definitionZh };
}
