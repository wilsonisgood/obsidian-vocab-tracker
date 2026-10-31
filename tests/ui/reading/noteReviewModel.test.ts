import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import {
  noteVocabRefs,
  parseReviewPrefs,
  renameReviewPrefs,
  reviewPrefsOf,
  reviewProgress,
  vocabTabCount,
  serializeReviewPrefs,
  showsReview,
} from "../../../src/ui/reading/noteReviewModel";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const entry = (id: string, over: Partial<VocabEntry> = {}): VocabEntry =>
  ({ id, word: id, definitionZh: `${id} 中`, partOfSpeech: "n.", added: "2026-10-01", ...over }) as VocabEntry;

describe("noteReviewModel (1030 #4 複習這篇筆記)", () => {
  it("shows the panel only on user notes with a word or a discussion", () => {
    expect(showsReview({ skip: false, words: 1, discussions: 0 })).toBe(true);
    expect(showsReview({ skip: false, words: 0, discussions: 2 })).toBe(true);
    expect(showsReview({ skip: false, words: 0, discussions: 0 })).toBe(false);
    expect(showsReview({ skip: true, words: 5, discussions: 5 })).toBe(false);
  });

  it("remembers open / tab per note for good, defaulting to closed on 單字, and follows renames", () => {
    const all = parseReviewPrefs({ "a.md": { open: true, tab: "ai" }, "b.md": { open: "yes" }, bad: 3 });
    expect(reviewPrefsOf(all, "a.md")).toEqual({ open: true, tab: "ai" });
    expect(reviewPrefsOf(all, "b.md")).toEqual({ open: false, tab: "vocab" });
    expect(reviewPrefsOf(all, "new.md")).toEqual({ open: false, tab: "vocab" });
    expect(renameReviewPrefs(all, "a.md", "x/a.md")).toBe(true);
    expect(serializeReviewPrefs(all)).toEqual({ "b.md": { open: false, tab: "vocab" }, "x/a.md": { open: true, tab: "ai" } });
    expect(parseReviewPrefs(null).size).toBe(0);
  });

  it("asks about the note's words with their meaning in this note, due first, then newest", () => {
    const entries = [
      entry("trade", { createdAt: "2026-10-05" }),
      entry("cell", { createdAt: "2026-10-09" }),
      entry("due", { srs: { due: "2026-10-29T00:00:00.000Z", state: 2, reps: 3 } as VocabEntry["srs"] }),
      entry("outside"),
      entry("nozh", { definitionZh: "" }),
      entry("gone", { deletedAt: "2026-10-10" }),
    ];
    const scope = new Set(["trade", "cell", "due", "nozh", "gone"]);
    const gloss = (w: string) => (w === "trade" ? { zh: "拿…換取", pos: "v." } : undefined);
    const refs = noteVocabRefs(entries, scope, gloss, NOW);
    expect(refs.map((r) => r.id)).toEqual(["due", "cell", "trade"]);
    expect(refs.find((r) => r.id === "trade")).toEqual({ id: "trade", word: "trade", zh: "拿…換取", pos: "v." });
    expect(refs.find((r) => r.id === "cell")?.zh).toBe("cell 中");
    expect(noteVocabRefs(entries, scope, gloss, NOW, 1)).toHaveLength(1);
  });

  it("「單字 (3)17」: answered words since the round started; a finished round restarts at (0)", () => {
    const ids = new Set(["a", "b", "c"]);
    const ev = (id: string, at: string, result = "correct", track = "vocab") =>
      ({ at, track, focus: { kind: "word", id }, result }) as never;
    const events = [
      ev("a", "2026-10-30T00:00:00.000Z"),
      ev("b", "2026-10-31T01:00:00.000Z", "wrong"),
      ev("c", "2026-10-31T02:00:00.000Z", "skipped"),
      ev("x", "2026-10-31T02:00:00.000Z"),
      ev("c", "2026-10-31T02:00:00.000Z", "correct", "poly"),
    ];
    const p = reviewProgress(ids, events, "2026-10-31T00:00:00.000Z");
    expect([...p.done]).toEqual(["b"]);
    expect(p.total).toBe(3);
    expect(p.restart).toBe(false);
    expect(vocabTabCount(p.done.size, p.total)).toBe("(1)3");
    const all = reviewProgress(ids, [...events, ev("a", "2026-10-31T03:00:00.000Z", "hinted"), ev("c", "2026-10-31T03:00:00.000Z")], "2026-10-31T00:00:00.000Z");
    expect(all).toEqual({ done: new Set(), total: 3, restart: true });
  });

  it("asks the words not reviewed yet this round first", () => {
    const entries = [entry("a", { createdAt: "2026-10-09" }), entry("b", { createdAt: "2026-10-05" })];
    const refs = noteVocabRefs(entries, new Set(["a", "b"]), () => undefined, NOW, 12, new Set(["a"]));
    expect(refs.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("keeps the round start in the prefs", () => {
    expect(reviewPrefsOf(parseReviewPrefs({ "a.md": { open: true, tab: "vocab", roundAt: "2026-10-31T00:00:00.000Z" } }), "a.md").roundAt).toBe(
      "2026-10-31T00:00:00.000Z"
    );
  });
});
