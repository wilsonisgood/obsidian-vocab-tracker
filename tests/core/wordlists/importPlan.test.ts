import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { buildEntryLookup, cleanSentence, mergeLevel, planImport, REIMPORT_UNDO_WINDOW_MS } from "../../../src/core/wordlists/importPlan";
import type { ScanHit } from "../../../src/core/wordlists/scan";

const entry = (word: string, fields: Partial<VocabEntry> = {}) => ({ id: word, word, level: "", ...fields }) as VocabEntry;
const hit = (word: string, tags: string[], line = 0): ScanHit => ({ word, tags, line, sentence: `- The **${word}** here.` });
const labelsOf = (tags: readonly string[]) => tags.filter((t) => t !== "exam/OFF").map((t) => t.split("/").pop()!);
const NOW = Date.parse("2026-10-04T12:00:00Z");

// planImport() now takes an EntryLookup instead of a raw entries array —
// buildEntryLookup() adapts a plain array for these tests the same way
// services/wordlists/EntryWordIndex does for the real (cached) path.
function plan(hits: ScanHit[], entries: VocabEntry[], opts: { now?: number; undoWindowMs?: number } = {}) {
  return planImport(hits, buildEntryLookup(entries), labelsOf, { now: opts.now ?? NOW, undoWindowMs: opts.undoWindowMs });
}

describe("mergeLevel", () => {
  it("appends missing labels case-insensitively", () => {
    expect(mergeLevel("", ["TOEFL", "IELTS"])).toBe("TOEFL, IELTS");
    expect(mergeLevel("多益中級, toefl", ["TOEFL", "IELTS"])).toBe("多益中級, toefl, IELTS");
    expect(mergeLevel("TOEFL", [])).toBe("TOEFL");
  });
});

describe("cleanSentence", () => {
  it("strips markdown that rides along on the raw line", () => {
    expect(cleanSentence("- The **data** is ==clear==.")).toBe("The data is clear.");
    expect(cleanSentence("## A *big* deal")).toBe("A big deal");
    expect(cleanSentence("> 1. quoted  text")).toBe("quoted text");
  });
});

describe("planImport", () => {
  it("creates new words with their exam labels, line and example", () => {
    const p = plan([hit("analyze", ["exam/IELTS", "exam/TOEFL"], 4)], []);
    expect(p.create).toEqual([{ word: "analyze", level: "IELTS, TOEFL", line: 4, example: "The analyze here." }]);
    expect(p.retag).toEqual([]);
  });

  it("retags tracked words instead of duplicating them", () => {
    const tracked = entry("Data", { level: "B2" });
    const p = plan([hit("data", ["exam/TOEFL"])], [tracked]);
    expect(p.create).toEqual([]);
    expect(p.retag).toEqual([{ entry: tracked, level: "B2, TOEFL" }]);
  });

  it("leaves already-labelled words alone", () => {
    const p = plan([hit("data", ["exam/TOEFL"])], [entry("data", { level: "TOEFL" })]);
    expect(p).toEqual({ create: [], retag: [] });
  });

  it("prefers a live entry over a tombstone of the same word", () => {
    const live = entry("data");
    const p = plan([hit("data", ["exam/TOEFL"])], [entry("data", { deletedAt: "2026-10-01T00:00:00.000Z" }), live]);
    expect(p.retag).toEqual([{ entry: live, level: "TOEFL" }]);
  });

  it("skips words whose only lists are disabled", () => {
    expect(plan([hit("data", ["exam/OFF"])], []).create).toEqual([]);
  });

  describe("re-adding a deleted exam word (1006report.md #25)", () => {
    it("recreates a word deleted well outside the undo window, as a brand-new entry (not the tombstone)", () => {
      const longAgo = new Date(NOW - 60_000).toISOString(); // 60s ago
      const p = plan([hit("data", ["exam/TOEFL"])], [entry("data", { deletedAt: longAgo })]);
      expect(p.create).toEqual([{ word: "data", level: "TOEFL", line: 0, example: "The data here." }]);
      expect(p.retag).toEqual([]);
    });

    it("leaves a word alone while its tombstone is still inside the undo window (R's 取消 like 復原)", () => {
      const justNow = new Date(NOW - 2_000).toISOString(); // 2s ago
      const p = plan([hit("data", ["exam/TOEFL"])], [entry("data", { deletedAt: justNow })]);
      expect(p.create).toEqual([]);
      expect(p.retag).toEqual([]);
    });

    it("respects a custom undo window", () => {
      const at = new Date(NOW - 5_000).toISOString(); // 5s ago
      expect(plan([hit("data", ["exam/TOEFL"])], [entry("data", { deletedAt: at })], { undoWindowMs: 3_000 }).create).toHaveLength(1);
      expect(plan([hit("data", ["exam/TOEFL"])], [entry("data", { deletedAt: at })], { undoWindowMs: 8_000 }).create).toHaveLength(0);
    });

    it("picks the most recently deleted tombstone when there are several for the same word", () => {
      const old = new Date(NOW - 5 * REIMPORT_UNDO_WINDOW_MS).toISOString();
      const recent = new Date(NOW - 1_000).toISOString();
      const p = plan([hit("data", ["exam/TOEFL"])], [entry("data", { id: "d1", deletedAt: old }), entry("data", { id: "d2", deletedAt: recent })]);
      expect(p.create).toEqual([]); // the recent one wins and is still in its undo window
    });
  });
});
