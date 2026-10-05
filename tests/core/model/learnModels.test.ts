import { describe, expect, it } from "vitest";
import { familyMembers, familyOrigin, familyScope, type Family } from "../../../src/core/model/family";
import { TRIVIA_THREAD_ID } from "../../../src/core/model/trivia";
import { isVerb } from "../../../src/core/model/usage";

describe("isVerb", () => {
  it("accepts the dictionary's verb spellings", () => {
    for (const pos of ["verb", "Verb", "transitive verb", "noun, verb", "v.", "動詞"]) expect(isVerb(pos)).toBe(true);
  });

  it("rejects adverbs, other parts of speech and empty values", () => {
    for (const pos of ["adverb", "Adverb", "noun", "adjective", "proverb", "", undefined]) expect(isVerb(pos)).toBe(false);
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
