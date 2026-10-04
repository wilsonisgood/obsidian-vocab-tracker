import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { cleanSentence, mergeLevel, planImport } from "../../../src/core/wordlists/importPlan";
import type { ScanHit } from "../../../src/core/wordlists/scan";

const entry = (word: string, fields: Partial<VocabEntry> = {}) => ({ id: word, word, level: "", ...fields }) as VocabEntry;
const hit = (word: string, tags: string[], line = 0): ScanHit => ({ word, tags, line, sentence: `- The **${word}** here.` });
const labelsOf = (tags: readonly string[]) => tags.filter((t) => t !== "exam/OFF").map((t) => t.split("/").pop()!);

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
    const plan = planImport([hit("analyze", ["exam/IELTS", "exam/TOEFL"], 4)], [], labelsOf);
    expect(plan.create).toEqual([{ word: "analyze", level: "IELTS, TOEFL", line: 4, example: "The analyze here." }]);
    expect(plan.retag).toEqual([]);
  });

  it("retags tracked words instead of duplicating them", () => {
    const tracked = entry("Data", { level: "B2" });
    const plan = planImport([hit("data", ["exam/TOEFL"])], [tracked], labelsOf);
    expect(plan.create).toEqual([]);
    expect(plan.retag).toEqual([{ entry: tracked, level: "B2, TOEFL" }]);
  });

  it("leaves already-labelled words alone", () => {
    const plan = planImport([hit("data", ["exam/TOEFL"])], [entry("data", { level: "TOEFL" })], labelsOf);
    expect(plan).toEqual({ create: [], retag: [] });
  });

  it("never re-adds a word the user deleted", () => {
    const plan = planImport([hit("data", ["exam/TOEFL"])], [entry("data", { deletedAt: "2026-10-01" })], labelsOf);
    expect(plan).toEqual({ create: [], retag: [] });
  });

  it("prefers a live entry over a tombstone of the same word", () => {
    const live = entry("data");
    const plan = planImport([hit("data", ["exam/TOEFL"])], [entry("data", { deletedAt: "x" }), live], labelsOf);
    expect(plan.retag).toEqual([{ entry: live, level: "TOEFL" }]);
  });

  it("skips words whose only lists are disabled", () => {
    expect(planImport([hit("data", ["exam/OFF"])], [], labelsOf).create).toEqual([]);
  });
});
