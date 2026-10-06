import { describe, expect, it } from "vitest";
import type { Family } from "../../../src/core/model/family";
import type { TriviaItem } from "../../../src/core/model/trivia";
import type { WordMeta } from "../../../src/core/model/wordMeta";
import {
  addMentionForNewEntry,
  clearBreakdownOnRename,
  clearFamilyMemberEntry,
  clearTriviaMention,
  deletionImpact,
  familiesContaining,
  hasNoLinks,
  syncFamilyMemberText,
  triviaMentioning,
} from "../../../src/services/learn/linkage";
import { WordIndex } from "../../../src/services/learn/wordIndex";
import { entry } from "./fakes";

function wordMeta(id: string, extra: Partial<WordMeta> = {}): WordMeta {
  return { id, ...extra };
}

function fam(id: string, members: { entryId?: string; word: string; zh: string }[]): Family {
  return { id, topic: id, label: id, source: "ai", groups: [{ label: "g", members }] };
}

function trivia(id: string, entryId: string, mentions: string[], extra: Partial<TriviaItem> = {}): TriviaItem {
  return { id, entryId, mentions, title: "t", body: "b", ...extra };
}

describe("clearFamilyMemberEntry", () => {
  it("drops entryId but keeps the member's text", () => {
    const f = fam("f1", [{ entryId: "e1", word: "apron", zh: "圍裙" }, { word: "oven mitt", zh: "隔熱手套" }]);
    const updated = clearFamilyMemberEntry(f, "e1");
    expect(updated.groups[0].members[0]).toEqual({ word: "apron", zh: "圍裙" });
    expect(updated.groups[0].members[1]).toEqual({ word: "oven mitt", zh: "隔熱手套" });
  });

  it("is a no-op (same reference) when the entry isn't a member", () => {
    const f = fam("f1", [{ word: "apron", zh: "圍裙" }]);
    expect(clearFamilyMemberEntry(f, "nope")).toBe(f);
  });

  it("clears every matching member across groups (many-to-many)", () => {
    const f: Family = {
      id: "f1",
      topic: "f1",
      label: "f1",
      source: "ai",
      groups: [
        { label: "a", members: [{ entryId: "e1", word: "pan", zh: "鍋" }] },
        { label: "b", members: [{ entryId: "e1", word: "pan", zh: "鍋" }, { word: "lid", zh: "蓋子" }] },
      ],
    };
    const updated = clearFamilyMemberEntry(f, "e1");
    expect(updated.groups[0].members[0]).toEqual({ word: "pan", zh: "鍋" });
    expect(updated.groups[1].members[0]).toEqual({ word: "pan", zh: "鍋" });
    expect(updated.groups[1].members[1]).toEqual({ word: "lid", zh: "蓋子" });
  });
});

describe("clearTriviaMention", () => {
  it("drops the id from mentions", () => {
    const item = trivia("t1", "subject", ["e1", "e2"]);
    expect(clearTriviaMention(item, "e1").mentions).toEqual(["e2"]);
  });

  it("is a no-op (same reference) when absent", () => {
    const item = trivia("t1", "subject", ["e2"]);
    expect(clearTriviaMention(item, "e1")).toBe(item);
  });
});

describe("syncFamilyMemberText", () => {
  it("updates word and zh for the renamed entry's member", () => {
    const f = fam("f1", [{ entryId: "e1", word: "colour", zh: "顏色" }]);
    const updated = syncFamilyMemberText(f, entry("e1", "color", { definitionZh: "顏色（美式）" }));
    expect(updated.groups[0].members[0]).toEqual({ entryId: "e1", word: "color", zh: "顏色（美式）" });
  });

  it("is a no-op (same reference) when nothing differs", () => {
    const f = fam("f1", [{ entryId: "e1", word: "color", zh: "顏色" }]);
    expect(syncFamilyMemberText(f, entry("e1", "color", { definitionZh: "顏色" }))).toBe(f);
  });

  it("leaves other members' text alone", () => {
    const f = fam("f1", [
      { entryId: "e1", word: "color", zh: "顏色" },
      { entryId: "e2", word: "colour", zh: "顏色" },
    ]);
    const updated = syncFamilyMemberText(f, entry("e1", "coloration", { definitionZh: "著色" }));
    expect(updated.groups[0].members[1]).toEqual({ entryId: "e2", word: "colour", zh: "顏色" });
  });
});

describe("addMentionForNewEntry", () => {
  const index = new WordIndex([entry("new1", "gleam"), entry("subj", "glitter")]);

  it("adds the new entry when its word appears in the saved text", () => {
    const item = trivia("t1", "subj", [], { title: "Glitter vs gleam", body: "both shine" });
    const updated = addMentionForNewEntry(item, entry("new1", "gleam"), index);
    expect(updated.mentions).toEqual(["new1"]);
  });

  it("is a no-op when the word isn't in the text", () => {
    const item = trivia("t1", "subj", [], { title: "Glitter", body: "shines a lot" });
    expect(addMentionForNewEntry(item, entry("new1", "gleam"), index)).toBe(item);
  });

  it("never mentions an item's own subject", () => {
    const item = trivia("t1", "new1", [], { title: "Gleam", body: "gleam gleam" });
    expect(addMentionForNewEntry(item, entry("new1", "gleam"), index)).toBe(item);
  });

  it("is idempotent once the mention is already there", () => {
    const item = trivia("t1", "subj", ["new1"], { title: "Glitter and gleam", body: "" });
    expect(addMentionForNewEntry(item, entry("new1", "gleam"), index)).toBe(item);
  });
});

describe("familiesContaining / triviaMentioning / deletionImpact", () => {
  it("counts what's linked, for the delete confirm dialog", () => {
    const families = [fam("f1", [{ entryId: "e1", word: "pan", zh: "鍋" }]), fam("f2", [{ word: "lid", zh: "蓋" }])];
    const triviaItems = [trivia("t1", "other", ["e1"]), trivia("t2", "e1", [])];
    expect(familiesContaining(families, "e1").map((f) => f.id)).toEqual(["f1"]);
    expect(triviaMentioning(triviaItems, "e1").map((t) => t.id)).toEqual(["t1"]);

    const impact = deletionImpact("e1", {
      families,
      trivia: triviaItems,
      hasVerbFavorite: true,
      wordPageExists: true,
      threadCount: 3,
    });
    expect(impact).toEqual({ families: 1, triviaMentions: 1, verbFavorite: true, wordPageExists: true, threadCount: 3 });
    expect(hasNoLinks(impact)).toBe(false);
  });

  it("hasNoLinks is true when nothing points at the word", () => {
    const impact = deletionImpact("e1", {
      families: [],
      trivia: [],
      hasVerbFavorite: false,
      wordPageExists: false,
      threadCount: 0,
    });
    expect(hasNoLinks(impact)).toBe(true);
  });
});

describe("clearBreakdownOnRename", () => {
  it("drops the breakdown but keeps the emoji", () => {
    const meta = wordMeta("e1", {
      emoji: "📘",
      emojiSource: "user",
      breakdown: { status: "ok", parts: [], gloss: "g", word: "colour", generatedAt: "t", model: "m" },
    });
    const updated = clearBreakdownOnRename(meta);
    expect(updated.breakdown).toBeUndefined();
    expect(updated).toMatchObject({ id: "e1", emoji: "📘", emojiSource: "user" });
  });

  it("is a no-op (same reference) when there's no breakdown to clear", () => {
    const meta = wordMeta("e1", { emoji: "📘" });
    expect(clearBreakdownOnRename(meta)).toBe(meta);
  });
});

