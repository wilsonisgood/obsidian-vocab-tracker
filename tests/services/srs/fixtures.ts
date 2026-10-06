import type { VocabEntry } from "../../../src/core/model/entry";
import type { SrsCard } from "../../../src/core/model/srs";
import type { StoragePort } from "../../../src/core/ports";

export function makeEntry(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: "1",
    word: "word",
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: null,
    added: "2026-01-01 00:00:00",
    lastReviewed: "2026-01-01 00:00:00",
    reviews: 0,
    // SrsService.queue()/dueTomorrow() only count liked words
    // (1006report.md #24; reviewsToday() doesn't — 整合 D2); default to
    // liked so existing scheduling tests don't need to care about it.
    // Tests of the liked filter itself override this.
    liked: true,
    ...overrides,
  };
}

// A scheduled (Review-state) card due at `due`.
export function reviewCard(due: Date): SrsCard {
  return {
    due: due.toISOString(),
    stability: 5,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 5,
    learningSteps: 0,
    reps: 3,
    lapses: 0,
    state: 2,
    lastReview: new Date(due.getTime() - 5 * 86_400_000).toISOString(),
  };
}

export class MemoryStorage implements StoragePort {
  shards = new Map<string, unknown>();
  writes: { name: string; data: unknown }[] = [];

  async readShard<T>(name: string): Promise<T | null> {
    const v = this.shards.get(name);
    return v === undefined ? null : (JSON.parse(JSON.stringify(v)) as T);
  }

  async writeShard<T>(name: string, data: T): Promise<void> {
    const copy = JSON.parse(JSON.stringify(data));
    this.shards.set(name, copy);
    this.writes.push({ name, data: copy });
  }

  async backup(): Promise<void> {}
}
