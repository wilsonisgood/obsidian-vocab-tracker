import { describe, expect, it } from "vitest";
import { KINDS } from "../../src/grammar-visual/kinds";
import { builtinVisual, layoutOf, parseVisual, topicsOfLayout, type TimelineVisual } from "../../src/grammar-visual";
import { draw } from "./support";

const mod = KINDS.timeline;
const topics = topicsOfLayout("timeline");
const sample = (): TimelineVisual => structuredClone(mod.builtin["present-perfect-continuous"]);

describe("timeline", () => {
  it("12 個主題都有 builtin，且通過自己的 parse", () => {
    expect(topics.length).toBe(12);
    for (const id of topics) {
      expect(layoutOf(id)).toBe("timeline");
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
    expect((mod.schema as { required: string[] }).required).toContain("events");
  });

  it("不合格輸入回 null", () => {
    const bad: ((v: TimelineVisual) => unknown)[] = [
      (v) => ({ ...v, events: [] }),
      (v) => ({ ...v, events: [{ ...v.events[0], shape: "wave" }] }),
      (v) => ({ ...v, ref: { at: "x", label: "x" } }),
      (v) => ({ ...v, kind: "scale" }),
    ];
    for (const f of bad) expect(mod.parse(JSON.parse(JSON.stringify(f(sample()))))).toBeNull();
    expect(mod.parse(null)).toBeNull();
    expect(mod.parse("x")).toBeNull();
  });

  it("電腦版與手機版都畫得出來", () => {
    const v = mod.builtin["past-perfect"];
    for (const mobile of [false, true]) {
      const root = draw(v, mobile);
      const text = root.textContent;
      expect(text).toContain("電影開始");
      expect(text).toContain("我到的時候");
      expect(text).toContain("現在");
      expect(text).toContain(v.explain);
      expect(root.querySelectorAll(".gv-tl-row").length).toBe(v.events.length);
      expect(root.querySelectorAll(".is-mobile").length).toBe(mobile ? 1 : 0);
    }
    const repeat = draw(mod.builtin["present-simple"]);
    expect(repeat.querySelectorAll(".gv-tl-dot").length).toBe(5);
  });
});
