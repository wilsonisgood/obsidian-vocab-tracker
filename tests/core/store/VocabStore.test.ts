import { describe, expect, it, vi } from "vitest";
import { VocabStore } from "../../../src/core/store/VocabStore";
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
    added: "2026-01-01 00:00:00",
    lastReviewed: "2026-01-01 00:00:00",
    reviews: 0,
    ...overrides,
  };
}

describe("VocabStore", () => {
  it("emits data:changed immediately but debounces the actual write", async () => {
    vi.useFakeTimers();
    try {
      const data: VocabData = { entries: [] };
      const persist = vi.fn().mockResolvedValue(undefined);
      const store = new VocabStore(data, persist);
      const onChanged = vi.fn();
      store.events.on("data:changed", onChanged);

      await store.save();
      expect(onChanged).toHaveBeenCalledWith(data);
      expect(persist).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(500);
      expect(persist).toHaveBeenCalledTimes(1);
      expect(persist).toHaveBeenCalledWith(data);
    } finally {
      vi.useRealTimers();
    }
  });

  it("coalesces rapid saves within the debounce window into one write", async () => {
    vi.useFakeTimers();
    try {
      const data: VocabData = { entries: [] };
      const persist = vi.fn().mockResolvedValue(undefined);
      const store = new VocabStore(data, persist);

      await store.save();
      await vi.advanceTimersByTimeAsync(200);
      await store.save();
      await vi.advanceTimersByTimeAsync(200);
      await store.save();
      await vi.advanceTimersByTimeAsync(500);

      expect(persist).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush() forces a pending debounced write to land immediately", async () => {
    vi.useFakeTimers();
    try {
      const data: VocabData = { entries: [] };
      const persist = vi.fn().mockResolvedValue(undefined);
      const store = new VocabStore(data, persist);

      await store.save();
      expect(persist).not.toHaveBeenCalled();

      await store.flush();
      expect(persist).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush() is a no-op (resolves) when there is nothing pending", async () => {
    const data: VocabData = { entries: [] };
    const persist = vi.fn().mockResolvedValue(undefined);
    const store = new VocabStore(data, persist);

    await expect(store.flush()).resolves.toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
  });

  it("exposes the same object reference passed in, so external holders stay in sync", () => {
    const data: VocabData = { entries: [] };
    const store = new VocabStore(data, async () => {});
    expect(store.vocabData).toBe(data);
  });

  it("replace() swaps the underlying data and emits data:changed", () => {
    const store = new VocabStore({ entries: [] }, async () => {});
    const onChanged = vi.fn();
    store.events.on("data:changed", onChanged);

    const next: VocabData = { entries: [] };
    store.replace(next);

    expect(store.vocabData).toBe(next);
    expect(onChanged).toHaveBeenCalledWith(next);
  });

  describe("entries", () => {
    it("excludes soft-deleted entries but vocabData.entries keeps them", async () => {
      const live = makeEntry({ id: "1" });
      const deleted = makeEntry({ id: "2", deletedAt: "2026-01-01T00:00:00.000Z" });
      const store = new VocabStore({ entries: [live, deleted] }, async () => {});

      expect(store.entries).toEqual([live]);
      expect(store.vocabData.entries).toHaveLength(2);
    });
  });

  describe("addEntry", () => {
    it("stamps createdAt/updatedAt/rev and pushes the same reference", async () => {
      vi.useFakeTimers();
      try {
        const data: VocabData = { entries: [] };
        const persist = vi.fn().mockResolvedValue(undefined);
        const store = new VocabStore(data, persist);
        const entry = makeEntry({ id: "new" });

        await store.addEntry(entry);

        expect(store.entries).toEqual([entry]);
        expect(entry.rev).toBe(0);
        expect(entry.createdAt).toBeDefined();
        expect(entry.updatedAt).toBe(entry.createdAt);

        // Mutating the caller's reference after addEntry must be visible
        // in the store's array (enrichEntry relies on this).
        entry.phonetic = "/wɜːd/";
        expect(store.entries[0].phonetic).toBe("/wɜːd/");

        await vi.advanceTimersByTimeAsync(500);
        expect(persist).toHaveBeenCalledWith(data);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("touch", () => {
    it("bumps updatedAt and increments rev", async () => {
      const entry = makeEntry({ id: "1", rev: 2, updatedAt: "2020-01-01T00:00:00.000Z" });
      const store = new VocabStore({ entries: [entry] }, async () => {});

      await store.touch(entry);

      expect(entry.rev).toBe(3);
      expect(entry.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    });
  });

  describe("deleteEntry", () => {
    it("sets deletedAt instead of removing the entry", async () => {
      const entry = makeEntry({ id: "1" });
      const store = new VocabStore({ entries: [entry] }, async () => {});

      await store.deleteEntry("1");

      expect(store.entries).toEqual([]);
      expect(store.vocabData.entries).toHaveLength(1);
      expect(entry.deletedAt).toBeDefined();
      expect(entry.updatedAt).toBe(entry.deletedAt);
    });

    it("is a no-op when the id doesn't exist", async () => {
      const entry = makeEntry({ id: "1" });
      const persist = vi.fn().mockResolvedValue(undefined);
      const store = new VocabStore({ entries: [entry] }, persist);

      await store.deleteEntry("missing");

      expect(entry.deletedAt).toBeUndefined();
      expect(persist).not.toHaveBeenCalled();
    });
  });
});
