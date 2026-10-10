import { describe, expect, it } from "vitest";
import { hasDictionaryData } from "../../../src/ui/blocks/wordHeaderModel";
import { isOpen, parseFolds, toggle, toggleStored, type FoldState } from "../../../src/ui/reading/wordPageFolds";

describe("fold state", () => {
  it("defaults to info open, everything else closed", () => {
    expect(isOpen({}, "a", "info")).toBe(true);
    for (const s of ["dna", "families", "usage", "trivia", "discussion"] as const) expect(isOpen({}, "a", s)).toBe(false);
  });

  it("toggles each word and category independently", () => {
    let st: FoldState = {};
    st = toggle(st, "a", "usage");
    st = toggle(st, "a", "info");
    expect(isOpen(st, "a", "usage")).toBe(true);
    expect(isOpen(st, "a", "info")).toBe(false);
    expect(isOpen(st, "a", "trivia")).toBe(false);
    expect(isOpen(st, "b", "usage")).toBe(false);
    expect(isOpen(st, "b", "info")).toBe(true);
    st = toggle(st, "a", "usage");
    expect(isOpen(st, "a", "usage")).toBe(false);
  });

  it("survives bad stored data", () => {
    for (const bad of [null, undefined, 5, "{oops", "[]", '"x"', { a: 3 }, { a: { info: "yes", nope: true } }]) {
      const st = parseFolds(bad);
      expect(isOpen(st, "a", "info")).toBe(true);
      expect(isOpen(st, "a", "usage")).toBe(false);
    }
    expect(isOpen(parseFolds('{"a":{"usage":true}}'), "a", "usage")).toBe(true);
  });

  it("persists through a storage object and tolerates a throwing one", () => {
    const m = new Map<string, unknown>();
    const app = {
      loadLocalStorage: (k: string) => m.get(k) ?? null,
      saveLocalStorage: (k: string, v: unknown) => void m.set(k, v),
    };
    expect(toggleStored(app, "a", "usage")).toBe(true);
    expect(toggleStored(app, "a", "usage")).toBe(false);
    expect(toggleStored(app, "a", "info")).toBe(false);
    const broken = {
      loadLocalStorage: (): unknown => {
        throw new Error("x");
      },
      saveLocalStorage: (): void => {
        throw new Error("x");
      },
    };
    expect(toggleStored(broken, "a", "usage")).toBe(true);
  });
});

describe("hasDictionaryData", () => {
  const empty = { definition: "", definitionZh: "", phonetic: "", partOfSpeech: "", synonyms: "", antonyms: "", example: "", grammar: "" };
  it("is false when empty, or when only the note is filled", () => {
    expect(hasDictionaryData(empty)).toBe(false);
    const noted = { ...empty, grammar: "my note" };
    expect(hasDictionaryData(noted)).toBe(false);
    expect(hasDictionaryData({ ...empty, definition: "  " })).toBe(false);
  });
  it("is true when any dictionary field has a value", () => {
    for (const k of ["definition", "definitionZh", "phonetic", "partOfSpeech", "synonyms", "antonyms", "example"] as const) {
      expect(hasDictionaryData({ ...empty, [k]: "x" })).toBe(true);
    }
  });
});
