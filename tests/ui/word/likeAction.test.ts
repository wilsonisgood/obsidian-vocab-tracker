import { afterEach, describe, expect, it, vi } from "vitest";

// Same actionNotice mock pattern as tests/ui/kit/undoable.test.ts and
// tests/ui/mobile/WordSheet.test.ts — just record what runUndoable() asked
// it to show, obsidian's real Notice never gets touched.
vi.mock("../../../src/ui/mobile/actionNotice", () => ({
  actionNotice: () => ({ hide: vi.fn() }),
}));

import { flushUndoables } from "../../../src/ui/kit/undoable";
import { unlikeEntry } from "../../../src/ui/word/likeAction";
import type { VocabEntry } from "../../../src/core/model/entry";

function makeEntry(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: "1",
    word: "glittery",
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
    liked: true,
    ...overrides,
  };
}

function makePlugin(knownTags: string[] = []) {
  return {
    wordlists: { index: { tags: knownTags } },
    store: {
      setLiked: vi.fn().mockResolvedValue(undefined),
      deleteEntry: vi.fn().mockResolvedValue(undefined),
      restoreEntry: vi.fn().mockResolvedValue(undefined),
    },
    linkage: { unlink: vi.fn() },
    unhighlightWord: vi.fn().mockResolvedValue(undefined),
  };
}

describe("unlikeEntry", () => {
  afterEach(() => flushUndoables());

  it("a tagged word (even dimmed) just loses its like — no delete", () => {
    const plugin = makePlugin(["exam/TOEFL"]);
    const entry = makeEntry({ level: "TOEFL" });

    const deleted = unlikeEntry(plugin as never, entry);

    expect(deleted).toBe(false);
    expect(plugin.store.setLiked).toHaveBeenCalledWith(entry, false);
    expect(plugin.store.deleteEntry).not.toHaveBeenCalled();
  });

  it("an untagged word is soft-deleted with an undo window, not setLiked", () => {
    const plugin = makePlugin(["exam/TOEFL"]);
    const entry = makeEntry({ level: "", source: null });

    const deleted = unlikeEntry(plugin as never, entry);

    expect(deleted).toBe(true);
    expect(plugin.store.setLiked).not.toHaveBeenCalled();
    expect(plugin.store.deleteEntry).toHaveBeenCalledWith("1");
    // Unlink/unhighlight only happen once the undo window closes (commit),
    // not immediately on apply.
    expect(plugin.linkage.unlink).not.toHaveBeenCalled();

    flushUndoables();
    expect(plugin.linkage.unlink).toHaveBeenCalledWith("1");
  });

  it("commit unhighlights the source note when the word has one", () => {
    const plugin = makePlugin([]);
    const entry = makeEntry({ level: "", source: { path: "notes/a.md", line: 3 } });

    unlikeEntry(plugin as never, entry);
    flushUndoables();

    expect(plugin.unhighlightWord).toHaveBeenCalledWith("glittery", "notes/a.md");
  });

  it("a word with no source never calls unhighlightWord", () => {
    const plugin = makePlugin([]);
    const entry = makeEntry({ level: "", source: null });

    unlikeEntry(plugin as never, entry);
    flushUndoables();

    expect(plugin.linkage.unlink).toHaveBeenCalledWith("1");
    expect(plugin.unhighlightWord).not.toHaveBeenCalled();
  });

  it("restore() instead of letting the window close never unlinks/deletes-for-real", () => {
    const plugin = makePlugin([]);
    const entry = makeEntry({ level: "", source: null });

    unlikeEntry(plugin as never, entry);
    // restoreEntry only happens if the learner clicks "復原"; without that
    // the queue still holds the pending commit until flush/timer.
    expect(plugin.store.restoreEntry).not.toHaveBeenCalled();
  });
});
