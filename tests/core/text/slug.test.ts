import { describe, expect, it } from "vitest";
import { joinPath, linkTarget, noteBasename, slugify, wordSlug } from "../../../src/core/text/slug";

describe("slugify", () => {
  it("keeps ordinary names as they are", () => {
    expect(slugify("glittery")).toBe("glittery");
    expect(slugify("Taylor_Swift_NYU_Speech_Transcript")).toBe("Taylor_Swift_NYU_Speech_Transcript");
    expect(slugify("well-being")).toBe("well-being");
    expect(slugify("給我一杯水")).toBe("給我一杯水");
  });

  it.each([
    ["AC/DC", "AC-DC"],
    ["back\\slash", "back-slash"],
    ["Re: hello", "Re- hello"],
    ["what*", "what-"],
    ["why?", "why-"],
    ['"quoted"', "-quoted-"],
    ["<tag>", "-tag-"],
    ["a|b", "a-b"],
  ])("replaces the forbidden character in %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("replaces link syntax characters Obsidian rejects in file names", () => {
    expect(slugify("C# notes")).toBe("C- notes");
    expect(slugify("x^2")).toBe("x-2");
    expect(slugify("[[link]]")).toBe("-link-");
  });

  it("collapses runs of replacements", () => {
    expect(slugify("a//b")).toBe("a-b");
    expect(slugify("a/:*b")).toBe("a-b");
  });

  it("drops leading dots so the file isn't hidden", () => {
    expect(slugify(".hidden")).toBe("hidden");
    expect(slugify("...dots")).toBe("dots");
    expect(slugify(". space")).toBe("space");
  });

  it("drops trailing dots and spaces (Windows strips them)", () => {
    expect(slugify("etc.")).toBe("etc");
    expect(slugify("word. . ")).toBe("word");
  });

  it("collapses whitespace and removes control characters", () => {
    expect(slugify("  ice \t cream \n")).toBe("ice cream");
    expect(slugify("a\u0000b\u001fc")).toBe("abc");
  });

  it("falls back when nothing usable is left", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("...")).toBe("untitled");
    expect(slugify("   ", "word")).toBe("word");
  });

  it("caps very long names", () => {
    const out = slugify("x".repeat(500));
    expect(out.length).toBe(100);
  });

  it("normalizes to NFC so the same word always maps to the same file", () => {
    expect(slugify("café")).toBe(slugify("café"));
  });
});

describe("wordSlug", () => {
  it("shares one file between words that differ only in case", () => {
    expect(wordSlug("Glittery")).toBe("glittery");
    expect(wordSlug("GLITTERY")).toBe(wordSlug("glittery"));
    expect(wordSlug("Mother-in-Law")).toBe("mother-in-law");
  });

  it("still strips forbidden characters", () => {
    expect(wordSlug(".NET")).toBe("net");
    expect(wordSlug("and/or")).toBe("and-or");
  });

  it("has a fallback for empty words", () => {
    expect(wordSlug("")).toBe("word");
  });
});

describe("path helpers", () => {
  it("joinPath drops empty parts and stray slashes", () => {
    expect(joinPath("vocab-list/單字", "glittery.md")).toBe("vocab-list/單字/glittery.md");
    expect(joinPath("vocab-list/", "/單字/", "a.md")).toBe("vocab-list/單字/a.md");
    expect(joinPath("", "a.md")).toBe("a.md");
  });

  it("noteBasename strips folders and the extension", () => {
    expect(noteBasename("eng/Speech.md")).toBe("Speech");
    expect(noteBasename("Speech.md")).toBe("Speech");
    expect(noteBasename("a/b/v1.2 notes.md")).toBe("v1.2 notes");
    expect(noteBasename("a/.hidden")).toBe(".hidden");
  });

  it("linkTarget drops .md only", () => {
    expect(linkTarget("eng/Speech.md")).toBe("eng/Speech");
    expect(linkTarget("eng/Speech.canvas")).toBe("eng/Speech.canvas");
  });
});
