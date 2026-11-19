import { describe, expect, it } from "vitest";
import { parseVisual, topicsOfLayout, builtinVisual } from "../../src/grammar-visual";
import { compareKind } from "../../src/grammar-visual/kinds/compare";
import { clickButton, draw } from "./support";

const topics = topicsOfLayout("compare");
const sample = () => JSON.parse(JSON.stringify(compareKind.builtin[topics[0]]));

describe("compare builtin", () => {
  it("每個主題都有 builtin 且通過自己的 parse", () => {
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      const v = compareKind.builtin[t];
      expect(v, t).toBeTruthy();
      expect(compareKind.parse(JSON.parse(JSON.stringify(v))), t).toEqual(v);
      expect(builtinVisual(t)).toEqual(v);
      expect(parseVisual(JSON.parse(JSON.stringify(v)))).toEqual(v);
    }
  });
  it("schema 的 required 與 properties 一致", () => {
    const s = compareKind.schema as { required: string[]; properties: Record<string, unknown> };
    expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
    expect(compareKind.guide.length).toBeLessThanOrEqual(600);
  });
});

describe("compare parse 擋掉不合格", () => {
  it("缺欄位、kind 不對", () => {
    expect(compareKind.parse(null)).toBeNull();
    expect(compareKind.parse({ ...sample(), kind: "link" })).toBeNull();
    const noExplain = sample();
    delete noExplain.explain;
    expect(compareKind.parse(noExplain)).toBeNull();
  });
  it("項目太少、value 超出、focus 不在 items", () => {
    const a = sample(); a.items = a.items.slice(0, 1);
    expect(compareKind.parse(a)).toBeNull();
    const b = sample(); b.items[0].value = 0;
    expect(compareKind.parse(b)).toBeNull();
    const c = sample(); c.focus = "Nobody";
    expect(compareKind.parse(c)).toBeNull();
    const d = sample(); d.relation = "bigger";
    expect(compareKind.parse(d)).toBeNull();
  });
});

describe("compare render", () => {
  for (const mobile of [false, true]) {
    it(`畫得出長條，切換鈕換說明（mobile=${mobile}）`, () => {
      const root = draw(compareKind.builtin["comparatives-superlatives"], mobile);
      expect(root.textContent).toContain("taller than");
      expect(root.textContent).toContain("Amy");
      expect(root.textContent).toContain("兩者相比");
      expect(root.querySelectorAll(".gv-compare-bar").map((b) => b.style.width)).toEqual(["50%", "70%", "85%"]);
      clickButton(root, "最高");
      expect(root.textContent).toContain("挑第一名");
      clickButton(root, "一樣");
      expect(root.textContent).toContain("as + 形容詞 + as");
    });
  }
});
