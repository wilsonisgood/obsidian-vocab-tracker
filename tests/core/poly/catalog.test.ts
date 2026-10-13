import { describe, expect, it } from "vitest";
import { parsePolyFilter, POLY_WORDS, polyWord, senseById, sensesInFilter } from "../../../src/core/poly/catalog";

describe("poly catalog", () => {
  it("has the 87 words and 600 unique senses of the map", () => {
    expect(POLY_WORDS).toHaveLength(87);
    const ids = POLY_WORDS.flatMap((w) => w.senses.map((s) => s.id));
    expect(ids).toHaveLength(600);
    expect(new Set(ids).size).toBe(600);
    for (const w of POLY_WORDS) {
      for (const s of w.senses) {
        expect(s.id.startsWith(`${w.word}.`)).toBe(true);
        expect(s.cue.length).toBeGreaterThan(0);
      }
    }
  });

  it("looks words and senses up", () => {
    expect(polyWord(" Get ")?.category).toBe("B");
    expect(senseById("get.arrive")?.zh).toBe("到達");
    expect(senseById("nope.x")).toBeUndefined();
  });

  it("parses a stored filter, dropping unknown values", () => {
    expect(parsePolyFilter(undefined)).toEqual({ words: [], levels: [], excluded: [] });
    expect(parsePolyFilter({ words: ["get", "zzz", "get"], levels: [3, 1, 9], excluded: ["get.annoy", "x.y"] })).toEqual({
      words: ["get"],
      levels: [1, 3],
      excluded: ["get.annoy"],
    });
  });

  it("splits tested and reference senses", () => {
    const { tested, reference } = sensesInFilter({ words: ["get"], levels: [1], excluded: ["get.buy"] });
    expect(tested.every((s) => s.level === 1 && s.id !== "get.buy")).toBe(true);
    expect(reference.map((s) => s.id)).toContain("get.buy");
    expect(reference.map((s) => s.id)).toContain("get.annoy");
    expect(tested.length + reference.length).toBe(polyWord("get")!.senses.length);
  });
});
