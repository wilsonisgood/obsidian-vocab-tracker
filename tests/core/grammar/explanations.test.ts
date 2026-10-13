import { describe, expect, it } from "vitest";
import { GRAMMAR_TOPICS } from "../../../src/core/grammar/catalog";
import { builtInExplanation } from "../../../src/core/grammar/explanations";
import { STAGE1_EXPLANATIONS } from "../../../src/core/grammar/explanations/stage1";
import { sanitizeExplanation } from "../../../src/services/grammar/topicPage";

const stage1 = GRAMMAR_TOPICS.filter((t) => t.stage === 1);

describe("stage-1 built-in explanations", () => {
  it("has one for every stage-1 topic and none for unknown ids", () => {
    expect(Object.keys(STAGE1_EXPLANATIONS).sort()).toEqual(stage1.map((t) => t.id).sort());
    expect(stage1).toHaveLength(31);
  });

  it.each(stage1.map((t) => [t.id, t.related.length > 0] as const))("%s is well-formed", (id, hasRelated) => {
    const text = STAGE1_EXPLANATIONS[id];
    expect(builtInExplanation(id)).toBe(text);
    expect(sanitizeExplanation(text)).toBe(text);
    expect(text).not.toMatch(/^#/m);
    expect(text.length).toBeGreaterThanOrEqual(200);
    expect(text.length).toBeLessThanOrEqual(1500);
    for (const h of ["核心概念", "句型", "例句", "容易犯的錯"]) expect(text).toContain(`**${h}**`);
    expect(text.includes("**和相關主題的差別**")).toBe(hasRelated);
    expect(text).not.toMatch(/Grammar in Use|Murphy|Cambridge/i);
  });

  it("returns undefined for an unknown id", () => {
    expect(builtInExplanation("nope")).toBeUndefined();
    expect(builtInExplanation("toString")).toBeUndefined();
  });
});
