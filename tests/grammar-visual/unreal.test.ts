import { describe, expect, it } from "vitest";
import { KINDS } from "../../src/grammar-visual/kinds";
import { builtinVisual, layoutOf, parseVisual, topicsOfLayout, type UnrealVisual } from "../../src/grammar-visual";
import { clickButton, draw } from "./support";

const mod = KINDS.unreal;
const topics = topicsOfLayout("unreal");
const sample = (): UnrealVisual => structuredClone(mod.builtin["conditionals-unreal"]);

describe("unreal", () => {
  it("6 個主題都有 builtin，且通過自己的 parse", () => {
    expect(topics.length).toBe(6);
    for (const id of topics) {
      expect(layoutOf(id)).toBe("unreal");
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
    expect((mod.schema as { required: string[] }).required).toContain("current");
  });

  it("不合格輸入回 null", () => {
    const bad: ((v: UnrealVisual) => unknown)[] = [
      (v) => ({ ...v, current: { ...v.current, time: "later" } }),
      (v) => ({ ...v, current: { ...v.current, real: "" } }),
      (v) => ({ ...v, current: { ...v.current, hypo: 1 } }),
      (v) => ({ ...v, current: { ...v.current, shifts: [{ from: "a" }] } }),
      (v) => ({ ...v, others: [v.current, v.current, v.current, v.current] }),
      (v) => ({ ...v, current: undefined }),
      (v) => ({ ...v, explain: "" }),
    ];
    for (const f of bad) expect(mod.parse(JSON.parse(JSON.stringify(f(sample()))))).toBeNull();
    expect(mod.parse([])).toBeNull();
  });

  it("電腦版與手機版畫出現實與假設，切換鈕換內容", () => {
    for (const mobile of [false, true]) {
      const root = draw(mod.builtin["conditionals-unreal"], mobile);
      expect(root.textContent).toContain("現實世界");
      expect(root.textContent).toContain("假設世界");
      expect(root.textContent).toContain("didn't know → had known");
      expect(root.textContent).toContain(mobile ? "↓ 動詞往過去退一格" : "往過去退一格 →");
      clickButton(root, "第二型");
      expect(root.textContent).toContain("If I had time, I would help you.");
      clickButton(root, "第一型");
      expect(root.textContent).toContain("可能成真的事");
      expect(root.textContent).not.toContain("假設世界");
    }
  });
});
