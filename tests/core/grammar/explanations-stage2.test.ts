import { describe, expect, it } from "vitest";
import { topicsOfStage } from "../../../src/core/grammar/catalog";
import { STAGE2_EXPLANATIONS } from "../../../src/core/grammar/explanations/stage2";

const BANNED = /Grammar in Use|Murphy|Cambridge/i;

describe("STAGE2_EXPLANATIONS", () => {
  const ids = topicsOfStage(2).map((t) => t.id);

  it("covers every stage-2 topic and nothing else", () => {
    expect(Object.keys(STAGE2_EXPLANATIONS).sort()).toEqual([...ids].sort());
  });

  it.each(ids)("%s is well-formed", (id) => {
    const text = STAGE2_EXPLANATIONS[id]!;
    expect(text.split("\n").some((l) => l.startsWith("#"))).toBe(false);
    expect(text.length).toBeGreaterThanOrEqual(200);
    expect(text.length).toBeLessThanOrEqual(1500);
    for (const h of ["**核心概念**", "**例句**", "**容易犯的錯**"]) expect(text).toContain(h);
    expect(text).not.toMatch(BANNED);
  });
});
