import { describe, expect, it } from "vitest";
import { KINDS } from "../../src/grammar-visual/kinds";
import { builtinVisual, layoutOf, parseVisual, topicsOfLayout, type ScaleVisual } from "../../src/grammar-visual";
import { clickButton, draw } from "./support";

const mod = KINDS.scale;
const topics = topicsOfLayout("scale");
const sample = (): ScaleVisual => structuredClone(mod.builtin["modals-deduction"]);

describe("scale", () => {
  it("11 個主題都有 builtin，且通過自己的 parse", () => {
    expect(topics.length).toBe(11);
    for (const id of topics) {
      expect(layoutOf(id)).toBe("scale");
      const v = builtinVisual(id);
      expect(v, id).not.toBeNull();
      expect(mod.parse(JSON.parse(JSON.stringify(v))), id).toEqual(v);
      expect(parseVisual(JSON.parse(JSON.stringify(v))), id).toEqual(v);
    }
    expect(Object.keys(mod.builtin).sort()).toEqual([...topics].sort());
  });

  it("schema 與 guide 齊全", () => {
    expect(mod.guide.length).toBeGreaterThan(50);
    expect(mod.guide.length).toBeLessThanOrEqual(600);
    expect((mod.schema as { required: string[] }).required).toContain("steps");
  });

  it("不合格輸入回 null", () => {
    const bad: ((v: ScaleVisual) => unknown)[] = [
      (v) => ({ ...v, pick: 4 }),
      (v) => ({ ...v, pick: -1 }),
      (v) => ({ ...v, steps: v.steps.slice(0, 1) }),
      (v) => ({ ...v, scale: "speed" }),
      (v) => ({ ...v, alt: [v.alt[0], v.alt[0]] }),
      (v) => ({ ...v, alt: [{ ...v.alt[0], pick: 9 }] }),
      (v) => ({ ...v, evidence: 3 }),
      (v) => ({ ...v, steps: [{ word: "", gloss: "x" }, ...v.steps] }),
    ];
    for (const f of bad) expect(mod.parse(JSON.parse(JSON.stringify(f(sample()))))).toBeNull();
    expect(mod.parse(undefined)).toBeNull();
  });

  it("電腦版：橫的量尺，點切換鈕換成義務", () => {
    const root = draw(mod.builtin["modals-deduction"]);
    expect(root.textContent).toContain("幾乎確定");
    expect(root.textContent).toContain("The lights are off.");
    expect(root.querySelectorAll(".gv-sc-step").length).toBe(4);
    expect(root.textContent).not.toContain("非做不可");
    clickButton(root, "義務");
    expect(root.textContent).toContain("非做不可");
    expect(root.textContent).not.toContain("也許");
  });

  it("手機版：直的量尺，每一格都能點", () => {
    const root = draw(mod.builtin["frequency-adverbs"], true);
    expect(root.querySelectorAll(".gv-sc-row").length).toBe(6);
    expect(root.textContent).toContain("通常（約 80–90%） ← 這句");
    clickButton(root, "sometimes");
    expect(root.textContent).toContain("把 sometimes 放進這句");
    const few = draw(mod.builtin["negation-quantifiers-advanced"], true);
    expect(few.textContent).toContain("數量（few）");
    clickButton(few, "數量（little）");
    expect(few.textContent).toContain("a little");
  });
});
