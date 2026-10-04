import { describe, expect, it } from "vitest";
import { WordIndex } from "../../../src/services/learn/wordIndex";
import { entry } from "./fakes";

const ENTRIES = [
  entry("apron", "aprons"),
  entry("napkin", "napkin"),
  entry("glitter", "Glitter"),
  entry("gloss", "gloss over"),
  entry("eke", "eke"),
  entry("gone", "umpire", { deletedAt: "2026-10-01T00:00:00Z" }),
];

describe("WordIndex.find", () => {
  const idx = new WordIndex(ENTRIES);

  it("matches case-insensitively and across simple inflections both ways", () => {
    expect(idx.find("napkin")?.id).toBe("napkin");
    expect(idx.find("NAPKINS")?.id).toBe("napkin");
    expect(idx.find("apron")?.id).toBe("apron"); // list has "aprons"
    expect(idx.find("glittered")?.id).toBe("glitter");
    expect(idx.find("Gloss Over")?.id).toBe("gloss");
  });

  it("ignores deleted entries and unknown words", () => {
    expect(idx.find("umpire")).toBeUndefined();
    expect(idx.find("leotard")).toBeUndefined();
    expect(idx.find("  ")).toBeUndefined();
  });
});

describe("WordIndex.mentions", () => {
  const idx = new WordIndex(ENTRIES);
  const TEXT = "**a napron → an apron**\n\napron 原本是 *a napron*，和 **napkin** 同源。Don't gloss over it — an umpire, eke.";

  it("lists learned words in order of first appearance, phrases included", () => {
    expect(idx.mentions(TEXT)).toEqual(["apron", "napkin", "eke", "gloss"]);
  });

  it("leaves out the subject word", () => {
    expect(idx.mentions(TEXT, new Set(["apron"]))).toEqual(["napkin", "eke", "gloss"]);
  });

  it("doesn't match inside other words", () => {
    expect(idx.mentions("glittery napkinless eked")).toEqual(["eke"]);
  });
});
