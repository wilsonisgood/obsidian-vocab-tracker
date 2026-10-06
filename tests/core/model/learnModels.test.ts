import { describe, expect, it } from "vitest";
import { familyMembers, familyOrigin, familyScope, type Family } from "../../../src/core/model/family";
import { TRIVIA_THREAD_ID } from "../../../src/core/model/trivia";
import { formatPos, isVerb, parsePos, usagesOf, type UsageBlock } from "../../../src/core/model/usage";

describe("isVerb", () => {
  it("accepts the dictionary's verb spellings", () => {
    for (const pos of ["verb", "Verb", "transitive verb", "noun, verb", "v.", "動詞"]) expect(isVerb(pos)).toBe(true);
  });

  it("rejects adverbs, other parts of speech and empty values", () => {
    for (const pos of ["adverb", "Adverb", "noun", "adjective", "proverb", "", undefined]) expect(isVerb(pos)).toBe(false);
  });
});

// Wave 8 U1 (1006-2 #17 #20): usage for every part of speech, not just
// verbs — parsePos()/formatPos() read and write the free-text
// partOfSpeech field; usagesOf() merges the legacy single `usage` field
// into the new per-pos `usages` map.
describe("parsePos", () => {
  it("resolves the dictionary's and the AI's free text to pos keys, deduped and ordered", () => {
    expect(parsePos("verb")).toEqual(["v"]);
    expect(parsePos("Verb, noun")).toEqual(["n", "v"]);
    expect(parsePos("transitive verb")).toEqual(["v"]);
    expect(parsePos("v.")).toEqual(["v"]);
    expect(parsePos("動詞")).toEqual(["v"]);
    expect(parsePos("adjective")).toEqual(["adj"]);
    expect(parsePos("adverb")).toEqual(["adv"]);
    expect(parsePos("noun, verb, adjective, adverb")).toEqual(["n", "v", "adj", "adv"]);
    expect(parsePos("pronoun")).toEqual(["pron"]);
    expect(parsePos("preposition; conjunction; interjection")).toEqual(["prep", "conj", "interj"]);
  });

  it("doesn't let adverb match verb or pronoun match noun", () => {
    expect(parsePos("adverb")).not.toContain("v");
    expect(parsePos("pronoun")).not.toContain("n");
  });

  it("ignores unknown text and empty input", () => {
    expect(parsePos("whatever this is")).toEqual([]);
    expect(parsePos("")).toEqual([]);
    expect(parsePos(undefined)).toEqual([]);
  });
});

describe("formatPos", () => {
  it("writes keys back out as readable English labels in a fixed order", () => {
    expect(formatPos(["v"])).toBe("verb");
    expect(formatPos(["v", "n"])).toBe("noun, verb");
    expect(formatPos(["interj", "adv", "n"])).toBe("noun, adverb, interjection");
    expect(formatPos([])).toBe("");
  });
});

function block(generatedAt: string, createdAt?: string): UsageBlock {
  return { patterns: [], related: [], generatedAt, createdAt, model: "m" };
}

describe("usagesOf", () => {
  it("reads the new per-pos map as is", () => {
    const n = block("2026-10-01T00:00:00Z");
    expect(usagesOf({ usages: { n } })).toEqual({ n });
  });

  it("folds the legacy `usage` field in under pos v when there's no new-format v yet", () => {
    const legacy = block("2026-10-01T00:00:00Z");
    expect(usagesOf({ usage: legacy })).toEqual({ v: legacy });
    expect(usagesOf({ usage: legacy, usages: { n: block("2026-09-01T00:00:00Z") } })).toEqual({
      v: legacy,
      n: block("2026-09-01T00:00:00Z"),
    });
  });

  it("when both a legacy usage and a new-format v exist, the newer generatedAt wins", () => {
    const older = block("2026-10-01T00:00:00Z");
    const newer = block("2026-10-05T00:00:00Z");
    // Legacy is newer (another device regenerated before picking up the
    // new format): it must win, or a sync that compares the whole
    // entry's updatedAt could silently drop the newer legacy write.
    expect(usagesOf({ usage: newer, usages: { v: older } })).toEqual({ v: newer });
    expect(usagesOf({ usage: older, usages: { v: newer } })).toEqual({ v: newer });
  });

  it("is empty when the entry has neither", () => {
    expect(usagesOf({})).toEqual({});
  });
});

describe("family helpers", () => {
  it("flattens members across groups and builds the origin tag", () => {
    const f: Family = {
      id: "f1",
      topic: "clothing",
      label: "服裝",
      source: "ai",
      groups: [
        { label: "a", members: [{ entryId: "e1", word: "glittery", zh: "閃亮的" }] },
        { label: "b", members: [{ word: "sequin", zh: "亮片" }] },
      ],
    };
    expect(familyMembers(f).map((m) => m.word)).toEqual(["glittery", "sequin"]);
    expect(familyOrigin("f1")).toBe("family:f1");
  });

  it("familyScope reads the field, and infers it for families saved without one", () => {
    const base = { source: "ai" as const };
    expect(familyScope({ ...base, scope: "word" })).toBe("word");
    expect(familyScope({ ...base, scope: "list", seedEntryIds: ["e1"] })).toBe("list");
    // Old data: 找字族 always had a seed word, the whole-list grouping never.
    expect(familyScope({ ...base, seedEntryIds: ["e1"] })).toBe("word");
    expect(familyScope({ ...base, seedEntryIds: [] })).toBe("list");
    expect(familyScope(base)).toBe("list");
    // Never replaced by 重新分群 either.
    expect(familyScope({ source: "manual" })).toBe("word");
    // A hand-edited bogus value falls back to the inference.
    expect(familyScope({ ...base, scope: "x" as never, seedEntryIds: ["e1"] })).toBe("word");
  });

  it("trivia lives in one fixed-id thread", () => {
    expect(TRIVIA_THREAD_ID).toBe("trivia-session");
  });
});
