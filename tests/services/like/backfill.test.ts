import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { likeBackfillDecider } from "../../../src/services/like/backfill";

function entry(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: "e1",
    word: "apron",
    level: "TOEFL",
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
    origin: "wordlist",
    ...overrides,
  };
}

function threads(counts: Record<string, number> = {}) {
  return { wordQuestionCount: (id: string) => counts[id] ?? 0 };
}

describe("likeBackfillDecider (1006report.md #23)", () => {
  it("likes anything not auto-imported from a word list, regardless of signals", () => {
    const decide = likeBackfillDecider({ threads: threads() });
    expect(decide(entry({ origin: undefined }))).toBe(true);
    expect(decide(entry({ origin: "family:f1" }))).toBe(true);
  });

  it("a plain exam-word import with no AI/review/edit activity stays unliked", () => {
    const decide = likeBackfillDecider({ threads: threads() });
    expect(decide(entry())).toBe(false);
  });

  it("dictionary-filled fields (definition, phonetic, …) don't count as edited — only grammar does", () => {
    const decide = likeBackfillDecider({ threads: threads() });
    expect(
      decide(
        entry({
          definition: "a protective garment",
          definitionZh: "圍裙",
          phonetic: "/ˈeɪprən/",
          partOfSpeech: "noun",
          synonyms: "apron, pinafore",
        })
      )
    ).toBe(false);
    expect(decide(entry({ grammar: "常用於 put on an apron" }))).toBe(true);
  });

  it("example filled from the note sentence doesn't count — only a real AI/review/grammar signal does", () => {
    const decide = likeBackfillDecider({ threads: threads() });
    expect(decide(entry({ example: "She put on an apron before cooking." }))).toBe(false);
  });

  it("counts a word thread, saved verb usage, or a review as already liked", () => {
    expect(likeBackfillDecider({ threads: threads({ e1: 1 }) })(entry())).toBe(true);
    expect(
      likeBackfillDecider({ threads: threads() })(entry({ usage: { patterns: [], related: [], generatedAt: "x", model: "m" } }))
    ).toBe(true);
    expect(likeBackfillDecider({ threads: threads() })(entry({ reviews: 1 }))).toBe(true);
    expect(
      likeBackfillDecider({ threads: threads() })(
        entry({ srs: { due: "x", stability: 1, difficulty: 1, elapsedDays: 0, scheduledDays: 0, reps: 1, lapses: 0, state: 2 } })
      )
    ).toBe(true);
  });
});
