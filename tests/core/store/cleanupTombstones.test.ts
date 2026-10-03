import { describe, expect, it } from "vitest";
import { cleanupTombstones } from "../../../src/core/store/cleanupTombstones";
import type { VocabData, VocabEntry } from "../../../src/core/model/entry";

function makeEntry(overrides: Partial<VocabEntry> = {}): VocabEntry {
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
    added: "",
    lastReviewed: "",
    reviews: 0,
    ...overrides,
  };
}

const NOW = new Date("2026-06-01T00:00:00.000Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

describe("cleanupTombstones", () => {
  it("keeps live entries and recently-deleted tombstones", () => {
    const live = makeEntry({ id: "1" });
    const recentlyDeleted = makeEntry({
      id: "2",
      deletedAt: new Date(NOW - 10 * DAY_MS).toISOString(),
    });
    const data: VocabData = { entries: [live, recentlyDeleted] };

    const result = cleanupTombstones(data, NOW);

    expect(result.entries).toEqual([live, recentlyDeleted]);
  });

  it("purges tombstones older than 30 days", () => {
    const stale = makeEntry({
      id: "1",
      deletedAt: new Date(NOW - 31 * DAY_MS).toISOString(),
    });
    const data: VocabData = { entries: [stale] };

    const result = cleanupTombstones(data, NOW);

    expect(result.entries).toEqual([]);
  });

  it("returns the same object reference when nothing was purged", () => {
    const data: VocabData = { entries: [makeEntry({ id: "1" })] };
    expect(cleanupTombstones(data, NOW)).toBe(data);
  });
});
