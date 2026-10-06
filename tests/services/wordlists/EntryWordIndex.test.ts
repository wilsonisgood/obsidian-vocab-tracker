import { describe, expect, it, vi } from "vitest";
import { VocabStore } from "../../../src/core/store/VocabStore";
import type { VocabData, VocabEntry } from "../../../src/core/model/entry";
import { EntryWordIndex } from "../../../src/services/wordlists/EntryWordIndex";

function entry(id: string, word: string, extra: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id,
    word,
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
    ...extra,
  };
}

function setup(entries: VocabEntry[]) {
  const data: VocabData = { schemaVersion: 2, entries };
  const store = new VocabStore(data, vi.fn().mockResolvedValue(undefined));
  return { store, data };
}

describe("EntryWordIndex (1006report.md #25 效能)", () => {
  it("finds the live entry for a word, case-insensitively", () => {
    const { store } = setup([entry("e1", "Apron")]);
    const index = new EntryWordIndex(store);
    expect(index.live("apron")?.id).toBe("e1");
    expect(index.live("APRON")?.id).toBe("e1");
    expect(index.live("nope")).toBeUndefined();
  });

  it("latestTombstone() ignores live entries and picks the most recently deleted one", () => {
    const { store } = setup([
      entry("d1", "data", { deletedAt: "2026-10-01T00:00:00.000Z" }),
      entry("d2", "data", { deletedAt: "2026-10-03T00:00:00.000Z" }),
    ]);
    const index = new EntryWordIndex(store);
    expect(index.live("data")).toBeUndefined();
    expect(index.latestTombstone("data")?.id).toBe("d2");
  });

  it("only rebuilds after data:changed — not on every lookup", async () => {
    const { store, data } = setup([entry("e1", "apron")]);
    const index = new EntryWordIndex(store);
    expect(index.live("apron")?.id).toBe("e1");
    expect(index.live("brand-new")).toBeUndefined();

    // A new entry added directly (bypassing store.addEntry, as a sync
    // merge's replace() would) without firing data:changed yet shouldn't
    // be visible: the cache hasn't been invalidated.
    data.entries.push(entry("e2", "brand-new"));
    expect(index.live("brand-new")).toBeUndefined();

    // Going through the store's own write path fires data:changed →
    // invalidates the cache → the next lookup sees it.
    await store.addEntry(entry("e3", "second-new"));
    expect(index.live("second-new")?.id).toBe("e3");
    expect(index.live("brand-new")?.id).toBe("e2"); // picked up by the same rebuild
  });

  it("dispose() stops listening for further changes", async () => {
    const { store } = setup([]);
    const index = new EntryWordIndex(store);
    expect(index.live("apron")).toBeUndefined(); // builds the (empty) cache now
    index.dispose();
    await store.addEntry(entry("e1", "apron"));
    // data:changed fired, but dispose() already removed the listener:
    // the stale, already-built empty cache is never invalidated.
    expect(index.live("apron")).toBeUndefined();
  });
});
