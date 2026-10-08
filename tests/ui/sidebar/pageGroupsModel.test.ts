import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { PageGroup, PageWord } from "../../../src/ui/page/pageContext";
import {
  pageGroupEntryIds,
  pageScopedEntries,
  resetPageCollapsed,
  tierPageWords,
  uniquePageWordCount,
} from "../../../src/ui/sidebar/pageGroupsModel";

function entry(id: string, over: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id,
    word: id,
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
    ...over,
  };
}

function word(w: string, over: Partial<PageWord> = {}): PageWord {
  return { word: w, zh: `中${w}`, emoji: "🙂", ...over };
}

describe("tierPageWords (1007-2 #8, #13)", () => {
  it("tiers liked → unliked → suggested, stable within each tier", () => {
    const liked = entry("liked", { liked: true });
    const unliked = entry("unliked", { liked: false });
    const entryById = (id: string) => ({ liked, unliked }[id as "liked" | "unliked"]);
    const words = [
      word("sugg1", { entryId: undefined }),
      word("Unliked", { entryId: "unliked" }),
      word("sugg2", { entryId: undefined }),
      word("Liked", { entryId: "liked" }),
    ];
    const rows = tierPageWords(words, entryById, () => []);
    expect(rows.map((r) => r.word.word)).toEqual(["Liked", "Unliked", "sugg1", "sugg2"]);
    expect(rows.map((r) => r.kind)).toEqual(["liked", "unliked", "suggested", "suggested"]);
  });

  it("treats a missing or deleted entry as suggested", () => {
    const gone = entry("gone", { liked: true, deletedAt: "2026-01-01" });
    const entryById = (id: string) => (id === "gone" ? gone : (id === "ghost" ? undefined : undefined));
    const rows = tierPageWords([word("a", { entryId: "gone" }), word("b", { entryId: "ghost" })], entryById, () => []);
    expect(rows.every((r) => r.kind === "suggested" && r.entry === undefined)).toBe(true);
  });

  it("de-dupes by lowercase word, merging morpheme labels and keeping first-seen position", () => {
    const words = [
      word("Trans", { morpheme: { id: "m1", label: "trans-" } }),
      word("other"),
      word("trans", { morpheme: { id: "m2", label: "-port" } }),
      word("TRANS", { morpheme: { id: "m1", label: "trans-" } }), // duplicate label, same morpheme
    ];
    const rows = tierPageWords(words, () => undefined, () => []);
    // "other" sorts into the suggested tier alongside "Trans", in the
    // order they were first seen.
    expect(rows.map((r) => r.word.word)).toEqual(["Trans", "other"]);
    expect(rows[0].morphemeLabels).toEqual(["trans-", "-port"]);
  });

  it("levelTags: an entry uses levelTags(entry.level); a suggestion uses tagsOf(word).map(tagLabel)", () => {
    const withLevel = entry("w1", { liked: true, level: "GRE, IELTS" });
    const rows = tierPageWords(
      [word("tracked", { entryId: "w1" }), word("untracked")],
      (id) => (id === "w1" ? withLevel : undefined),
      (w) => (w === "untracked" ? ["exam/TOEFL"] : [])
    );
    const tracked = rows.find((r) => r.word.word === "tracked")!;
    const untracked = rows.find((r) => r.word.word === "untracked")!;
    expect(tracked.levelTags).toEqual(["GRE", "IELTS"]);
    expect(untracked.levelTags).toEqual(["TOEFL"]);
  });
});

describe("uniquePageWordCount / pageScopedEntries / pageGroupEntryIds (1007-2 #8, #9, #10)", () => {
  const groups: PageGroup[] = [
    { key: "g1", title: "G1", words: [word("A", { entryId: "e1" }), word("b")] },
    { key: "g2", title: "G2", words: [word("a", { entryId: "e1" }), word("C", { entryId: "e2" })] },
  ];

  it("counts distinct words across every group, case-insensitively, including suggestions", () => {
    expect(uniquePageWordCount(groups)).toBe(3); // a/A, b, C
  });

  it("pageScopedEntries dedupes by entryId across groups and drops missing ones", () => {
    const entries = [entry("e1"), entry("e2")];
    const out = pageScopedEntries(groups, entries);
    expect(out.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("pageScopedEntries skips an entryId the store no longer has", () => {
    const out = pageScopedEntries(groups, [entry("e2")]);
    expect(out.map((e) => e.id)).toEqual(["e2"]);
  });

  it("pageGroupEntryIds lists one group's own entryIds, deduped", () => {
    expect(pageGroupEntryIds(groups[0])).toEqual(["e1"]);
    expect(pageGroupEntryIds(groups[1])).toEqual(["e1", "e2"]);
  });
});

describe("resetPageCollapsed (1007-2 #8, #13)", () => {
  it("collapses every group except the active one", () => {
    const groups: PageGroup[] = [
      { key: "a", title: "A", words: [] },
      { key: "b", title: "B", words: [] },
      { key: "c", title: "C", words: [] },
    ];
    expect(resetPageCollapsed(groups, "b")).toEqual(new Set(["a", "c"]));
  });

  it("with no active group, every group collapses", () => {
    const groups: PageGroup[] = [{ key: "a", title: "A", words: [] }];
    expect(resetPageCollapsed(groups, null)).toEqual(new Set(["a"]));
  });
});
