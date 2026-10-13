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

import { grammarPlan } from "../../../src/ui/sidebar/grammarRows";

describe("grammarPlan (wave 14 U)", () => {
  it("Usage page visible: rows switch its word, uncapped", () => {
    expect(grammarPlan(true)).toEqual({ click: "select", limit: null });
  });
  it("otherwise: rows open the word page, capped", () => {
    expect(grammarPlan(false)).toEqual({ click: "openWord", limit: RECENT_VERB_USAGE });
  });
});

describe("verbUsageRows anyPos", () => {
  const noFav = (): VerbUsageFavorite | undefined => undefined;
  const noun = verb("n1", "table", {
    partOfSpeech: "noun",
    usages: { n: { patterns: [], related: [], generatedAt: "2026-10-05T00:00:00Z", model: "m" } },
  } as Partial<VocabEntry>);
  it("skips non-verbs by default, lists them with anyPos", () => {
    expect(verbUsageRows([noun], noFav)).toHaveLength(0);
    const rows = verbUsageRows([noun], noFav, true);
    expect(rows.map((r) => r.entryId)).toEqual(["n1"]);
    expect(rows[0].lastAt).toBe("2026-10-05T00:00:00Z");
  });
});

// ── Wave 15 S: 本篇用到的文法 / 待複習 ─────────────────────────────

import { topicById } from "../../../src/core/grammar/catalog";
import {
  dueGrammarRows,
  grammarTotal,
  MAX_DUE_GRAMMAR,
  MAX_NOTE_GRAMMAR,
  noteGrammarRows,
} from "../../../src/ui/sidebar/grammarRows";
import type { GrammarProgress, GrammarSighting, GrammarTopic } from "../../../src/core/model/grammar";
import { GRAMMAR_TOPICS } from "../../../src/core/grammar/catalog";

function sight(topicId: string, path = "a.md", n = 0): GrammarSighting {
  return { topicId, threadId: `t${n}`, turnId: `u${n}`, path, snapshot: "s", at: `2026-10-0${(n % 9) + 1}T00:00:00Z` };
}

describe("noteGrammarRows", () => {
  it("aggregates the note's sightings per topic, most-met first", () => {
    const rows = noteGrammarRows(
      [sight("past-simple", "a.md", 1), sight("passive-basic", "a.md", 2), sight("passive-basic", "a.md", 3), sight("past-simple", "b.md", 4)],
      "a.md"
    );
    expect(rows.map((r) => [r.topicId, r.count])).toEqual([
      ["passive-basic", 2],
      ["past-simple", 1],
    ]);
    expect(rows[0].title).toBe(topicById("passive-basic")!.title);
    expect(rows[0].stage).toBe(topicById("passive-basic")!.stage);
  });

  it("breaks count ties by stage then order", () => {
    const sorted = [...GRAMMAR_TOPICS].sort((a, b) => b.stage - a.stage || b.order - a.order);
    const [late, mid, early] = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]];
    const rows = noteGrammarRows([sight(late.id, "a.md", 1), sight(mid.id, "a.md", 2), sight(early.id, "a.md", 3)], "a.md");
    const key = (t: GrammarTopic) => t.stage * 1000 + t.order;
    expect(rows.map((r) => key(topicById(r.topicId)!))).toEqual([late, mid, early].map(key).sort((a, b) => a - b));
  });

  it("caps at 8, hides without a note or without sightings, drops unknown topics", () => {
    const many = GRAMMAR_TOPICS.slice(0, 12).map((t, i) => sight(t.id, "a.md", i));
    expect(noteGrammarRows(many, "a.md")).toHaveLength(MAX_NOTE_GRAMMAR);
    expect(noteGrammarRows(many, null)).toEqual([]);
    expect(noteGrammarRows(many, "other.md")).toEqual([]);
    expect(noteGrammarRows([sight("not-a-topic", "a.md", 1)], "a.md")).toEqual([]);
  });
});

describe("dueGrammarRows", () => {
  const NOW = new Date("2026-10-13T12:00:00Z");
  const srs = (due: string): GrammarProgress["srs"] => ({ due, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2 });

  it("lists due topics earliest first, capped at 5", () => {
    const progress = new Map<string, GrammarProgress>();
    GRAMMAR_TOPICS.slice(0, 7).forEach((t, i) => progress.set(t.id, { id: t.id, srs: srs(`2026-10-${String(10 + (i % 3)).padStart(2, "0")}T00:00:00Z`) }));
    progress.set(GRAMMAR_TOPICS[8].id, { id: GRAMMAR_TOPICS[8].id, srs: srs("2026-10-14T00:00:00Z") });
    const rows = dueGrammarRows(GRAMMAR_TOPICS, (id) => progress.get(id), NOW);
    expect(rows).toHaveLength(MAX_DUE_GRAMMAR);
    expect(rows.every((r) => r.title && r.stage)).toBe(true);
    expect(rows.map((r) => r.topicId)).not.toContain(GRAMMAR_TOPICS[8].id);
  });

  it("is empty when nothing has an srs card due", () => {
    expect(dueGrammarRows(GRAMMAR_TOPICS, () => undefined, NOW)).toEqual([]);
  });
});

describe("grammarTotal", () => {
  it("is the rows of all three subsections", () => {
    expect(grammarTotal(3, 2, 4)).toBe(9);
  });
});
