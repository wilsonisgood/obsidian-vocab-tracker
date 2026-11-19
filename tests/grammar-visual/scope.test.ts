import { describe, expect, it } from "vitest";
import { scopeKind } from "../../src/grammar-visual/kinds/scope";
import { topicsOfLayout } from "../../src/grammar-visual";
import { clickButton, draw } from "./support";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const topics = topicsOfLayout("scope");

describe("scope", () => {
  it("每個主題都有 builtin，且通過 parse", () => {
    expect(topics.length).toBe(3);
    for (const id of topics) {
      const v = scopeKind.builtin[id];
      expect(v, id).toBeDefined();
      expect(scopeKind.parse(clone(v)), id).toEqual(v);
    }
  });
  it("不合格輸入回 null", () => {
    const v = clone(scopeKind.builtin["prepositions-time-place"]);
    expect(scopeKind.parse("x")).toBeNull();
    expect(scopeKind.parse({ ...v, hit: 3 })).toBeNull();
    expect(scopeKind.parse({ ...v, levels: [v.levels[0]] })).toBeNull();
    expect(scopeKind.parse({ ...v, domain: "space" })).toBeNull();
    expect(scopeKind.parse({ ...v, alt: [v.alt[0], v.alt[0]] })).toBeNull();
  });
  it("畫出層層框，並能切換時間與地點", () => {
    const v = scopeKind.builtin["prepositions-time-place"];
    for (const mobile of [false, true]) {
      const root = draw(v, mobile);
      expect(root.textContent).toContain("on Monday");
      expect(root.textContent).not.toContain("in Taipei");
      clickButton(root, "地點");
      expect(root.textContent).toContain("in Taipei");
      expect(root.textContent).not.toContain("on Monday ·");
    }
  });
});
