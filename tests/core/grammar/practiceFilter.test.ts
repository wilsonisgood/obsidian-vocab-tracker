import { describe, expect, it } from "vitest";
import { GRAMMAR_TOPICS, topicsOfStage } from "../../../src/core/grammar/catalog";
import { parseGrammarFilter, stageOfDifficulty, startStage, topicsInFilter } from "../../../src/core/grammar/practiceFilter";

describe("parseGrammarFilter", () => {
  it("normalises junk to an empty filter", () => {
    for (const v of [undefined, null, 3, "x", [], {}, { stages: "1", topics: 2 }]) expect(parseGrammarFilter(v)).toEqual({ stages: [], topics: [] });
  });

  it("keeps valid stages (sorted, unique) and topic ids (unique strings)", () => {
    expect(parseGrammarFilter({ stages: [3, 1, 1, 7, "2"], topics: ["a", "a", 5, "", "b"] })).toEqual({ stages: [1, 3], topics: ["a", "b"] });
  });
});

describe("topicsInFilter", () => {
  const ids = (stage: 1 | 2 | 3) => topicsOfStage(stage).map((t) => t.id);

  it("converts difficulty to stage: 1–3 → 1, 4–6 → 2, 7–9 → 3", () => {
    expect([1, 3, 4, 6, 7, 9].map(stageOfDifficulty)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("starts at the learner's level when no stage is chosen", () => {
    expect(startStage("")).toBe(1);
    expect(startStage("B1")).toBe(2);
    expect(startStage("C1")).toBe(3);
    expect(topicsInFilter({ stages: [], topics: [] }, "")).toEqual(ids(1));
    expect(topicsInFilter({ stages: [], topics: [] }, "B2")).toEqual(ids(2));
    expect(topicsInFilter({ stages: [], topics: [] }, "C2")).toEqual(ids(3));
  });

  it("all topics of the chosen stages, in catalog order", () => {
    const got = topicsInFilter({ stages: [1, 3], topics: [] }, "B1");
    expect(got).toEqual([...ids(1), ...ids(3)]);
    expect(got.every((id) => GRAMMAR_TOPICS.some((t) => t.id === id))).toBe(true);
  });

  it("named topics inside the stages narrow it; strays and unknown ids are ignored", () => {
    const [a, b] = ids(2);
    const other = ids(1)[0];
    expect(topicsInFilter({ stages: [2], topics: [b, a] }, "")).toEqual([a, b]);
    expect(topicsInFilter({ stages: [2], topics: [a, other, "nope"] }, "")).toEqual([a]);
    // none usable: the whole stage
    expect(topicsInFilter({ stages: [2], topics: [other, "nope"] }, "")).toEqual(ids(2));
  });
});
