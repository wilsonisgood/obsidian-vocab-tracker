import { describe, expect, it } from "vitest";
import { topicsOfStage } from "../../../src/core/grammar/catalog";
import { STAGE3_EXPLANATIONS } from "../../../src/core/grammar/explanations/stage3";

describe("STAGE3_EXPLANATIONS", () => {
  const ids = topicsOfStage(3).map((t) => t.id);

  it("covers every stage-3 topic and nothing else", () => {
    expect(Object.keys(STAGE3_EXPLANATIONS).sort()).toEqual([...ids].sort());
  });

  it.each(ids)("%s is well formed", (id) => {
    const text = STAGE3_EXPLANATIONS[id];
    expect(text.length).toBeGreaterThanOrEqual(200);
    expect(text.length).toBeLessThanOrEqual(1500);
    expect(text.split("\n").some((l) => l.startsWith("#"))).toBe(false);
    for (const h of ["**核心概念**", "**例句**", "**容易犯的錯**"]) expect(text).toContain(h);
    expect(text).not.toMatch(/Grammar in Use|Murphy|Cambridge/i);
  });
});
