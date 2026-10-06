import { describe, expect, it } from "vitest";
import {
  DNA_THREAD_PREFIX,
  isInflection,
  matchMorpheme,
  morphemeKey,
  morphemeOrigin,
  morphemeThreadId,
  normalizeForm,
  originMorphemeId,
  resolveMorphemeId,
  type Morpheme,
} from "../../../src/core/model/morpheme";

function morph(id: string, type: Morpheme["type"], form: string, extra: Partial<Morpheme> = {}): Morpheme {
  return {
    id,
    form,
    variants: [],
    type,
    meaningZh: "x",
    origin: morphemeOrigin(id),
    timeline: [],
    suggested: [],
    source: "ai",
    ...extra,
  };
}

describe("normalizeForm", () => {
  it("lowercases and strips hyphens and whitespace", () => {
    expect(normalizeForm("Un-")).toBe("un");
    expect(normalizeForm(" -tion ")).toBe("tion");
    expect(normalizeForm("re")).toBe("re");
  });
});

describe("morphemeKey", () => {
  it("combines type and the normalized form", () => {
    expect(morphemeKey("prefix", "Un-")).toBe("prefix:un");
    expect(morphemeKey("suffix", "-tion")).toBe(morphemeKey("suffix", "tion"));
  });
});

describe("matchMorpheme", () => {
  it("matches on the normalized form", () => {
    const list = [morph("a", "prefix", "un-")];
    expect(matchMorpheme(list, "prefix", "Un")).toBe(list[0]);
    expect(matchMorpheme(list, "suffix", "un")).toBeUndefined(); // wrong type
  });

  it("matches on a variant", () => {
    const list = [morph("a", "root", "ten", { variants: ["tin", "tain"] })];
    expect(matchMorpheme(list, "root", "tain")).toBe(list[0]);
    expect(matchMorpheme(list, "root", "nope")).toBeUndefined();
  });

  it("skips a tombstoned record", () => {
    const list = [morph("a", "root", "ten", { deletedAt: "2026-10-01T00:00:00Z" })];
    expect(matchMorpheme(list, "root", "ten")).toBeUndefined();
  });

  it("skips a record a merge already redirected (mergedInto)", () => {
    const list = [morph("a", "root", "ten", { mergedInto: "b" }), morph("b", "root", "ten")];
    expect(matchMorpheme(list, "root", "ten")).toBe(list[1]);
  });
});

describe("resolveMorphemeId", () => {
  it("returns the id unchanged when it isn't redirected", () => {
    const list = [morph("a", "root", "ten")];
    expect(resolveMorphemeId(list, "a")).toBe("a");
  });

  it("follows a chain of redirects to the live id", () => {
    const list = [morph("a", "root", "a", { mergedInto: "b" }), morph("b", "root", "b", { mergedInto: "c" }), morph("c", "root", "c")];
    expect(resolveMorphemeId(list, "a")).toBe("c");
  });

  it("stops instead of looping forever on a cycle", () => {
    const list = [morph("a", "root", "a", { mergedInto: "b" }), morph("b", "root", "b", { mergedInto: "a" })];
    expect(() => resolveMorphemeId(list, "a")).not.toThrow();
    expect(["a", "b"]).toContain(resolveMorphemeId(list, "a"));
  });

  it("returns the id as is when it isn't in the list at all", () => {
    expect(resolveMorphemeId([], "ghost")).toBe("ghost");
  });
});

describe("isInflection", () => {
  it("accepts the whitelisted inflectional endings", () => {
    for (const s of ["s", "es", "ed", "d", "ing", "er", "est", "'s", "ING", " S "]) expect(isInflection(s)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const s of ["tion", "un", "ness", "", "ies"]) expect(isInflection(s)).toBe(false);
  });
});

describe("morphemeOrigin / originMorphemeId", () => {
  it("round-trips an id through the dna: origin tag", () => {
    expect(morphemeOrigin("m1")).toBe("dna:m1");
    expect(originMorphemeId("dna:m1")).toBe("m1");
  });

  it("returns null for any other origin", () => {
    expect(originMorphemeId("family:f1")).toBeNull();
    expect(originMorphemeId("wordlist")).toBeNull();
    expect(originMorphemeId(undefined)).toBeNull();
    expect(originMorphemeId("dna:")).toBeNull();
  });
});

describe("morphemeThreadId", () => {
  it("prefixes the morpheme id", () => {
    expect(morphemeThreadId("m1")).toBe(`${DNA_THREAD_PREFIX}m1`);
    expect(morphemeThreadId("m1")).toBe("morpheme:m1");
  });
});
