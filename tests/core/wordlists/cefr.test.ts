import { describe, expect, it } from "vitest";
import { cefrOf, type CefrTier } from "../../../src/core/wordlists/cefr";

describe("cefrOf", () => {
  it("looks up the CEFR-J list, case and space insensitive", () => {
    expect(cefrOf("walk")).toBe("A1");
    expect(cefrOf("  Book ")).toBe("A1");
    expect(cefrOf("basket")).toBe("A2");
    expect(cefrOf("anxiety")).toBe("B1");
    expect(cefrOf("ARROGANT")).toBe("B2");
  });

  it("finds the base form of an inflected word", () => {
    expect(cefrOf("walked")).toBe("A1");
    expect(cefrOf("studies")).toBe("A1");
    expect(cefrOf("batteries")).toBe("A2");
  });

  it("knows phrases that are in the list", () => {
    expect(cefrOf("ice cream")).toBe("A1");
    expect(cefrOf("Carbon Footprint")).toBe("B2");
  });

  it("returns undefined for an unknown word or an empty string", () => {
    expect(cefrOf("ubiquitous")).toBeUndefined();
    expect(cefrOf("")).toBeUndefined();
    expect(cefrOf("   ")).toBeUndefined();
  });

  it("falls back to the AI-tagged levels, exact form or base form", () => {
    const extra = new Map<string, CefrTier>([["ubiquitous", "C1"], ["pug", "B2"]]);
    expect(cefrOf("ubiquitous", extra)).toBe("C1");
    expect(cefrOf("Pugs", extra)).toBe("B2");
    expect(cefrOf("zzzz", extra)).toBeUndefined();
  });

  it("the built-in list wins over the AI-tagged one", () => {
    expect(cefrOf("walk", new Map<string, CefrTier>([["walk", "C2"]]))).toBe("A1");
  });
});
