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
        expect(entry.lang).toBe("en");

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

  describe("setLiked", () => {
    it("sets liked and bumps updatedAt/rev like touch() does", async () => {
      const entry = makeEntry({ id: "1", rev: 1, updatedAt: "2020-01-01T00:00:00.000Z" });
      const store = new VocabStore({ entries: [entry] }, async () => {});

      await store.setLiked(entry, true);

      expect(entry.liked).toBe(true);
      expect(entry.rev).toBe(2);
      expect(entry.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    });

    it("can unlike (set false) the same way", async () => {
      const entry = makeEntry({ id: "1", liked: true });
      const store = new VocabStore({ entries: [entry] }, async () => {});

      await store.setLiked(entry, false);

      expect(entry.liked).toBe(false);
    });

    it("emits data:changed", async () => {
      const entry = makeEntry({ id: "1" });
      const store = new VocabStore({ entries: [entry] }, async () => {});
      const onChanged = vi.fn();
      store.events.on("data:changed", onChanged);

      await store.setLiked(entry, true);

      expect(onChanged).toHaveBeenCalled();
    });
  });

  describe("backfillLiked", () => {
    it("fills liked only for entries that don't have it yet", async () => {
      const untouched = makeEntry({ id: "1", liked: undefined });
      const alreadyTrue = makeEntry({ id: "2", liked: true });
      const alreadyFalse = makeEntry({ id: "3", liked: false });
      const persist = vi.fn().mockResolvedValue(undefined);
      const store = new VocabStore({ entries: [untouched, alreadyTrue, alreadyFalse] }, persist);

      const decide = vi.fn().mockReturnValue(true);
      const changed = await store.backfillLiked(decide);

      expect(changed).toBe(1);
      expect(decide).toHaveBeenCalledTimes(1);
      expect(decide).toHaveBeenCalledWith(untouched);
      expect(untouched.liked).toBe(true);
      // Already-decided entries are left exactly as they were.
      expect(alreadyTrue.liked).toBe(true);
      expect(alreadyFalse.liked).toBe(false);
    });

    it("bumps updatedAt/rev only for the entries it actually changes", async () => {
      const untouched = makeEntry({ id: "1", liked: undefined, rev: 0, updatedAt: "2020-01-01T00:00:00.000Z" });
      const alreadyTrue = makeEntry({ id: "2", liked: true, rev: 5, updatedAt: "2020-01-01T00:00:00.000Z" });
      const store = new VocabStore({ entries: [untouched, alreadyTrue] }, async () => {});

      await store.backfillLiked(() => false);

      expect(untouched.rev).toBe(1);
      expect(untouched.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
      expect(alreadyTrue.rev).toBe(5);
      expect(alreadyTrue.updatedAt).toBe("2020-01-01T00:00:00.000Z");
    });

    it("decides per entry, so different entries can come out liked differently", async () => {
      const wordlistWord = makeEntry({ id: "1", liked: undefined, origin: "wordlist" });
      const handAdded = makeEntry({ id: "2", liked: undefined, origin: undefined });
      const store = new VocabStore({ entries: [wordlistWord, handAdded] }, async () => {});

      await store.backfillLiked((e) => e.origin !== "wordlist");

      expect(wordlistWord.liked).toBe(false);
      expect(handAdded.liked).toBe(true);
    });

    it("returns 0 and never calls persist when nothing needs backfilling", async () => {
      const entry = makeEntry({ id: "1", liked: true });
      const persist = vi.fn().mockResolvedValue(undefined);
      const store = new VocabStore({ entries: [entry] }, persist);

      const changed = await store.backfillLiked(() => false);

      expect(changed).toBe(0);
      await store.flush();
      expect(persist).not.toHaveBeenCalled();
    });

    it("includes tombstoned entries", async () => {
      const deleted = makeEntry({ id: "1", liked: undefined, deletedAt: "2026-01-01T00:00:00.000Z" });
      const store = new VocabStore({ entries: [deleted] }, async () => {});

      const changed = await store.backfillLiked(() => true);

      expect(changed).toBe(1);
      expect(deleted.liked).toBe(true);
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
