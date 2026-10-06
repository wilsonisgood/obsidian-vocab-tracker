import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { RECENT_VERB_USAGE, verbUsageRows, type VerbUsageFavorite } from "../../../src/ui/sidebar/grammarRows";

// Wave 6 W: the 文法 section's 動詞用法 subsection — most recently
// generated / regenerated / saved first, capped at RECENT_VERB_USAGE.

function verb(id: string, word: string, over: Partial<VocabEntry> = {}): VocabEntry {
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
    partOfSpeech: "verb",
    grammar: "",
    source: null,
    added: "",
    lastReviewed: "",
    reviews: 0,
    ...over,
  };
}

describe("verbUsageRows", () => {
  const noFavorites = (): VerbUsageFavorite | undefined => undefined;

  it("only lists verbs with a generated usage block", () => {
    const entries = [
      verb("e1", "sugarcoat", { usage: { patterns: [], related: [], generatedAt: "2026-10-01T00:00:00Z", model: "m" } }),
      verb("e2", "undecided"), // no usage yet
    ];
    const rows = verbUsageRows(entries, noFavorites);
    expect(rows.map((r) => r.entryId)).toEqual(["e1"]);
  });

  it("skips deleted entries even with usage", () => {
    const entries = [
      verb("e1", "sugarcoat", {
        deletedAt: "2026-10-02T00:00:00Z",
        usage: { patterns: [], related: [], generatedAt: "2026-10-01T00:00:00Z", model: "m" },
      }),
    ];
    expect(verbUsageRows(entries, noFavorites)).toEqual([]);
  });

  it("orders by generatedAt, newest first", () => {
    const entries = [
      verb("e1", "early", { usage: { patterns: [], related: [], generatedAt: "2026-10-01T00:00:00Z", model: "m" } }),
      verb("e2", "late", { usage: { patterns: [], related: [], generatedAt: "2026-10-05T00:00:00Z", model: "m" } }),
      verb("e3", "mid", { usage: { patterns: [], related: [], generatedAt: "2026-10-03T00:00:00Z", model: "m" } }),
    ];
    expect(verbUsageRows(entries, noFavorites).map((r) => r.word)).toEqual(["late", "mid", "early"]);
  });

  it("a usage favorited after it was generated bumps it to the top", () => {
    const entries = [
      verb("e1", "recent", { usage: { patterns: [], related: [], generatedAt: "2026-10-05T00:00:00Z", model: "m" } }),
      verb("e2", "oldUsageNowSaved", { usage: { patterns: [], related: [], generatedAt: "2026-09-01T00:00:00Z", model: "m" } }),
    ];
    const favoriteOf = (id: string): VerbUsageFavorite | undefined =>
      id === "e2" ? { updatedAt: "2026-10-10T00:00:00Z" } : undefined;
    const rows = verbUsageRows(entries, favoriteOf);
    expect(rows.map((r) => r.word)).toEqual(["oldUsageNowSaved", "recent"]);
    expect(rows[0]).toMatchObject({ favorited: true, lastAt: "2026-10-10T00:00:00Z" });
    expect(rows[1]).toMatchObject({ favorited: false });
  });

  it("a favorite older than the last generation doesn't push it down", () => {
    const entries = [verb("e1", "regenerated", { usage: { patterns: [], related: [], generatedAt: "2026-10-10T00:00:00Z", model: "m" } })];
    const favoriteOf = (): VerbUsageFavorite | undefined => ({ updatedAt: "2026-09-01T00:00:00Z" });
    const rows = verbUsageRows(entries, favoriteOf);
    expect(rows[0]).toMatchObject({ favorited: true, lastAt: "2026-10-10T00:00:00Z" });
  });

  it("ties break on entry id, for a stable order", () => {
    const entries = [
      verb("b", "b", { usage: { patterns: [], related: [], generatedAt: "2026-10-01T00:00:00Z", model: "m" } }),
      verb("a", "a", { usage: { patterns: [], related: [], generatedAt: "2026-10-01T00:00:00Z", model: "m" } }),
    ];
    expect(verbUsageRows(entries, noFavorites).map((r) => r.entryId)).toEqual(["a", "b"]);
  });

  it("the cap leaves exactly RECENT_VERB_USAGE for the caller to slice to", () => {
    expect(RECENT_VERB_USAGE).toBe(10);
    const entries = Array.from({ length: 15 }, (_, i) =>
      verb(`e${i}`, `verb${i}`, { usage: { patterns: [], related: [], generatedAt: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`, model: "m" } })
    );
    const rows = verbUsageRows(entries, noFavorites);
    expect(rows).toHaveLength(15);
    expect(rows.slice(0, RECENT_VERB_USAGE)).toHaveLength(10);
    expect(rows[0].word).toBe("verb14");
  });
});
