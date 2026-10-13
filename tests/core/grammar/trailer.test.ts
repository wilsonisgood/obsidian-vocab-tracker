import { describe, expect, it } from "vitest";
import { formatGrammarTrailer, parseGrammarTrailer, stripGrammarTrailer } from "../../../src/core/grammar/trailer";

const known = (id: string) => ["present-simple", "past-simple", "passive-basic"].includes(id);

describe("parseGrammarTrailer", () => {
  it("reads ids, de-duplicated and in order", () => {
    const c = "解析…\n<!-- vt-grammar: past-simple, present-simple, past-simple -->";
    expect(parseGrammarTrailer(c, known)).toEqual(["past-simple", "present-simple"]);
  });
  it("tolerates spacing, full-width commas and case", () => {
    expect(parseGrammarTrailer("x\n<!--VT-Grammar:  Past-Simple，passive-basic  -->  \n", known)).toEqual([
      "past-simple",
      "passive-basic",
    ]);
    expect(parseGrammarTrailer("<!--vt-grammar:present-simple-->", known)).toEqual(["present-simple"]);
  });
  it("drops unknown ids and uses the built-in catalog by default", () => {
    expect(parseGrammarTrailer("<!-- vt-grammar: nope, past-simple -->")).toEqual(["past-simple"]);
    expect(parseGrammarTrailer("<!-- vt-grammar: nope -->")).toEqual([]);
  });
  it("only reads the last trailer", () => {
    const c = "<!-- vt-grammar: past-simple -->\nmore\n<!-- vt-grammar: present-simple -->";
    expect(parseGrammarTrailer(c, known)).toEqual(["present-simple"]);
  });
  it("returns [] with no trailer, an empty one, or an unfinished one", () => {
    expect(parseGrammarTrailer("plain", known)).toEqual([]);
    expect(parseGrammarTrailer("<!-- vt-grammar: -->", known)).toEqual([]);
    expect(parseGrammarTrailer("<!-- vt-grammar: past-simple", known)).toEqual([]);
  });
});

describe("stripGrammarTrailer", () => {
  it("removes the trailer and trailing whitespace", () => {
    expect(stripGrammarTrailer("答案\n\n<!-- vt-grammar: past-simple -->\n")).toBe("答案");
  });
  it("removes every trailer", () => {
    expect(stripGrammarTrailer("a\n<!-- vt-grammar: x -->\nb\n<!--vt-grammar:y-->")).toBe("a\n\nb");
  });
  it("removes a half-written trailer while streaming", () => {
    for (const tail of ["<!-", "<!--", "<!-- vt-gram", "<!-- vt-grammar:", "<!-- vt-grammar: past-sim", "<!-- vt-grammar: a, b --"]) {
      expect(stripGrammarTrailer(`答案\n${tail}`), tail).toBe("答案");
    }
  });
  it("keeps other comments and text that merely contains <", () => {
    expect(stripGrammarTrailer("a <!-- note --> b")).toBe("a <!-- note --> b");
    expect(stripGrammarTrailer("a <!-- not a trailer")).toBe("a <!-- not a trailer");
    expect(stripGrammarTrailer("x < y")).toBe("x < y");
  });
  it("leaves content without a trailer alone", () => {
    expect(stripGrammarTrailer("hello")).toBe("hello");
  });
});

describe("formatGrammarTrailer", () => {
  it("round-trips through parse", () => {
    const t = formatGrammarTrailer(["past-simple", "passive-basic"]);
    expect(t).toBe("<!-- vt-grammar: past-simple, passive-basic -->");
    expect(parseGrammarTrailer(t, known)).toEqual(["past-simple", "passive-basic"]);
    expect(stripGrammarTrailer(`x\n${t}`)).toBe("x");
  });
  it("is empty for no ids", () => {
    expect(formatGrammarTrailer([])).toBe("");
  });
});
