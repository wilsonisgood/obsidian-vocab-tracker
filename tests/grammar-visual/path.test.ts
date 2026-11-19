import { describe, expect, it } from "vitest";
import { topicsOfLayout } from "../../src/grammar-visual";
import { pathKind } from "../../src/grammar-visual/kinds/path";
import type { Visual } from "../../src/grammar-visual";
import { draw } from "./support";

const entries = Object.entries(pathKind.builtin) as [string, Visual][];
const clone = (v: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(v));

describe("path 版面", () => {
  it("每個主題都有內建版面", () => {
    expect(Object.keys(pathKind.builtin).sort()).toEqual([...topicsOfLayout("path")].sort());
  });

  it("每份內建都通過自己的 parse", () => {
    for (const [id, v] of entries) expect(pathKind.parse(clone(v)), id).toEqual(v);
  });

  it("不合格的輸入回 null", () => {
    const good = clone(entries[0][1]);
    expect(pathKind.parse(null)).toBeNull();
    expect(pathKind.parse({ ...good, kind: "scale" })).toBeNull();
    expect(pathKind.parse({ ...good, explain: "" })).toBeNull();
    expect(pathKind.parse({ ...good, explain: "字".repeat(200) })).toBeNull();
    const steps = good.steps as unknown[];
    expect(pathKind.parse({ ...good, stopAt: steps.length })).toBeNull();
    expect(pathKind.parse({ ...good, stopAt: -1 })).toBeNull();
    expect(pathKind.parse({ ...good, stopAt: 0.5 })).toBeNull();
    expect(pathKind.parse({ ...good, steps: steps.slice(0, 1) })).toBeNull();
  });

  it("電腦版與手機版都畫得出來", () => {
    const [, v] = entries[0];
    for (const mobile of [false, true]) {
      const root = draw(v, mobile);
      expect(root.textContent).toContain(v.sentence.text);
      expect(root.textContent).toContain(v.explain);
      expect(root.querySelectorAll("li").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("停在哪一步就標哪一步", () => {
    const v = pathKind.builtin["articles-basic"];
    const root = draw(v);
    const hit = root.querySelectorAll("li").filter((l) => l.classList.contains("is-hit"));
    expect(hit).toHaveLength(1);
    expect(hit[0].textContent).toContain(v.steps[v.stopAt].result);
  });
});
