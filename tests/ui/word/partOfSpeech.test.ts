import { describe, expect, it } from "vitest";
import { abbreviatePartOfSpeech } from "../../../src/ui/word/partOfSpeech";

describe("abbreviatePartOfSpeech", () => {
  it("abbreviates the four common parts of speech", () => {
    expect(abbreviatePartOfSpeech("noun")).toEqual(["n."]);
    expect(abbreviatePartOfSpeech("verb")).toEqual(["v."]);
    expect(abbreviatePartOfSpeech("adjective")).toEqual(["adj."]);
    expect(abbreviatePartOfSpeech("adverb")).toEqual(["adv."]);
  });

  it("lists every part of speech in a comma-separated field, in order", () => {
    expect(abbreviatePartOfSpeech("Verb, noun")).toEqual(["v.", "n."]);
  });

  it("also splits on slash/semicolon", () => {
    expect(abbreviatePartOfSpeech("noun/verb")).toEqual(["n.", "v."]);
    expect(abbreviatePartOfSpeech("noun; verb")).toEqual(["n.", "v."]);
  });

  it("recognises a part of speech inside a longer descriptor", () => {
    expect(abbreviatePartOfSpeech("transitive verb")).toEqual(["v."]);
  });

  it("doesn't let adverb fall into the verb bucket just because it contains that substring", () => {
    expect(abbreviatePartOfSpeech("adjective, adverb")).toEqual(["adj.", "adv."]);
    expect(abbreviatePartOfSpeech("adverb")).not.toEqual(["v."]);
  });

  it("dedupes repeats", () => {
    expect(abbreviatePartOfSpeech("verb, verb")).toEqual(["v."]);
  });

  it("keeps text it doesn't recognise as-is (already abbreviated, or non-English)", () => {
    expect(abbreviatePartOfSpeech("v.")).toEqual(["v."]);
    expect(abbreviatePartOfSpeech("動詞")).toEqual(["動詞"]);
  });

  it("returns an empty list for empty/undefined input", () => {
    expect(abbreviatePartOfSpeech("")).toEqual([]);
    expect(abbreviatePartOfSpeech(undefined)).toEqual([]);
  });
});
