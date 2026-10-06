import { describe, expect, it } from "vitest";
import { computeNoteScope, likeCountInScope, noteScopeSig } from "../../../src/ui/sidebar/noteScope";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { ScanHit } from "../../../src/core/wordlists/scan";

function entry(partial: Partial<VocabEntry> & { id: string; word: string }): VocabEntry {
  return {
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
    ...partial,
  } as VocabEntry;
}

function hit(word: string): ScanHit {
  return { word, tags: ["exam/TOEFL"], line: 0, sentence: "" };
}

describe("computeNoteScope (1006report.md #6)", () => {
  it("includes a word found by the background scan, regardless of liked", () => {
    const e = entry({ id: "1", word: "analyze" });
    const ids = computeNoteScope([e], [hit("analyze")], null, true);
    expect(ids.has("1")).toBe(true);
  });

  it("excludes a deleted entry even if it's in the hits", () => {
    const e = entry({ id: "1", word: "analyze", deletedAt: "2026-01-01" });
    const ids = computeNoteScope([e], [hit("analyze")], null, true);
    expect(ids.has("1")).toBe(false);
  });

  it("a liked word not in any list still counts if the note text has it", () => {
    const e = entry({ id: "1", word: "glimmer", liked: true });
    const ids = computeNoteScope([e], [], "The lake had a faint glimmer.", true);
    expect(ids.has("1")).toBe(true);
  });

  it("a liked word absent from the note text is excluded", () => {
    const e = entry({ id: "1", word: "glimmer", liked: true });
    const ids = computeNoteScope([e], [], "Nothing here.", true);
    expect(ids.has("1")).toBe(false);
  });

  it("an un-liked word not in the hits is excluded even if the text has it", () => {
    const e = entry({ id: "1", word: "glimmer" });
    const ids = computeNoteScope([e], [], "There was a glimmer.", true);
    expect(ids.has("1")).toBe(false);
  });

  it("falls back to hits only when the note text isn't ready yet (null)", () => {
    const e = entry({ id: "1", word: "glimmer", liked: true });
    const ids = computeNoteScope([e], [], null, true);
    expect(ids.has("1")).toBe(false);
  });

  it("respects the inflections flag for liked words", () => {
    const e = entry({ id: "1", word: "analyze", liked: true });
    expect(computeNoteScope([e], [], "She analyzed it.", true).has("1")).toBe(true);
    expect(computeNoteScope([e], [], "She analyzed it.", false).has("1")).toBe(false);
  });
});

// Wave 8 S (1006-2 #4): the Like chip's own count — 本篇 (a Set) vs 全部
// (null, no scope restriction).
describe("likeCountInScope (1006-2 #4)", () => {
  const liked1 = entry({ id: "1", word: "a", liked: true });
  const liked2 = entry({ id: "2", word: "b", liked: true });
  const notLiked = entry({ id: "3", word: "c", liked: false });
  const likedDeleted = entry({ id: "4", word: "d", liked: true, deletedAt: "2026-01-01" });
  const all = [liked1, liked2, notLiked, likedDeleted];

  it("全部 (ids === null): every liked, non-deleted entry", () => {
    expect(likeCountInScope(all, null)).toBe(2);
  });

  it("本篇 (a Set): only liked entries whose id is in scope", () => {
    expect(likeCountInScope(all, new Set(["1"]))).toBe(1);
  });

  it("本篇: 0 when none of the liked entries are in scope", () => {
    expect(likeCountInScope(all, new Set(["3", "4"]))).toBe(0);
  });

  it("本篇: an empty scope counts 0", () => {
    expect(likeCountInScope(all, new Set())).toBe(0);
  });
});

// Wave 8 S (1006-2 #2): the noteScopeCache invalidation signature — must
// change for anything that could change computeNoteScope()'s output (an
// entry appearing/disappearing, a like toggling), and must NOT change for
// a plain field edit (so #10's "an edit doesn't reorder the list" holds).
describe("noteScopeSig (1006-2 #2)", () => {
  const e1 = entry({ id: "1", word: "a", liked: true });
  const e2 = entry({ id: "2", word: "b", liked: false });

  it("is stable across a plain field edit (word/example/etc. unchanged by liked/deletedAt)", () => {
    const before = noteScopeSig([e1, e2]);
    const edited = { ...e2, example: "a brand new example sentence" };
    expect(noteScopeSig([e1, edited])).toBe(before);
  });

  it("changes when an entry is added", () => {
    const before = noteScopeSig([e1, e2]);
    const added = entry({ id: "3", word: "c" });
    expect(noteScopeSig([e1, e2, added])).not.toBe(before);
  });

  it("changes when an entry is soft-deleted", () => {
    const before = noteScopeSig([e1, e2]);
    const deleted = { ...e2, deletedAt: "2026-01-01" };
    expect(noteScopeSig([e1, deleted])).not.toBe(before);
  });

  it("changes when a word is liked (count stays the same)", () => {
    const before = noteScopeSig([e1, e2]);
    const liked = { ...e2, liked: true };
    expect(noteScopeSig([e1, liked])).not.toBe(before);
    // Same number of live entries either way — the count alone wouldn't
    // have caught this; the liked-ids part of the signature does.
    expect([e1, e2].filter((e) => !e.deletedAt).length).toBe([e1, liked].filter((e) => !e.deletedAt).length);
  });

  it("is order-independent (same entries, different array order)", () => {
    expect(noteScopeSig([e1, e2])).toBe(noteScopeSig([e2, e1]));
  });
});
