import { describe, expect, it } from "vitest";
import { parseBlockParams, parseFlashcardParams } from "../../../src/ui/blocks/params";

describe("parseBlockParams", () => {
  it("parses key: value lines, ignoring blanks and comments", () => {
    const src = "mode: cloze\n\n# a comment\n// another\nSource:  eng/ \nlimit:30\n";
    expect(parseBlockParams(src)).toEqual({ mode: "cloze", source: "eng/", limit: "30" });
  });

  it("keeps colons inside values and lets later keys win", () => {
    expect(parseBlockParams("source: a:b/\nsource: c/")).toEqual({ source: "c/" });
    expect(parseBlockParams("source: a:b/")).toEqual({ source: "a:b/" });
  });

  it("skips lines without a key", () => {
    expect(parseBlockParams("just text\n: nokey")).toEqual({});
  });
});

describe("parseFlashcardParams", () => {
  it("defaults to en-zh with no filter", () => {
    expect(parseFlashcardParams("")).toEqual({ mode: "en-zh" });
  });

  it("accepts every mode and a few aliases", () => {
    expect(parseFlashcardParams("mode: zh-en").mode).toBe("zh-en");
    expect(parseFlashcardParams("mode: Cloze").mode).toBe("cloze");
    expect(parseFlashcardParams("mode: listen").mode).toBe("listen");
    expect(parseFlashcardParams("mode: 例句填空").mode).toBe("cloze");
    expect(parseFlashcardParams("mode: 中→英").mode).toBe("zh-en");
  });

  it("falls back on unknown modes and bad limits", () => {
    expect(parseFlashcardParams("mode: nope\nlimit: abc")).toEqual({ mode: "en-zh" });
    expect(parseFlashcardParams("limit: 0")).toEqual({ mode: "en-zh" });
    expect(parseFlashcardParams("limit: 2.5")).toEqual({ mode: "en-zh" });
  });

  it("normalizes the source prefix", () => {
    expect(parseFlashcardParams('source: "/eng/"\nlimit: 30')).toEqual({
      mode: "en-zh",
      source: "eng/",
      limit: 30,
    });
  });
});
