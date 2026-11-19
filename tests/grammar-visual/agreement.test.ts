import { describe, expect, it } from "vitest";
import { parseVisual, topicsOfLayout, builtinVisual } from "../../src/grammar-visual";
import { agreementKind } from "../../src/grammar-visual/kinds/agreement";
import { draw } from "./support";

const topics = topicsOfLayout("agreement");
const sample = () => JSON.parse(JSON.stringify(agreementKind.builtin[topics[0]]));

describe("agreement builtin", () => {
  it("每個主題都有 builtin 且通過自己的 parse", () => {
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      const v = agreementKind.builtin[t];
      expect(v, t).toBeTruthy();
      expect(agreementKind.parse(JSON.parse(JSON.stringify(v))), t).toEqual(v);
      expect(builtinVisual(t)).toEqual(v);
      expect(parseVisual(JSON.parse(JSON.stringify(v)))).toEqual(v);
    }
  });
  it("schema 的 required 與 properties 一致", () => {
    const s = agreementKind.schema as { required: string[]; properties: Record<string, unknown> };
    expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
    expect(agreementKind.guide.length).toBeLessThanOrEqual(600);
  });
});

describe("agreement parse 擋掉不合格", () => {
  it("缺欄位、kind 不對", () => {
    expect(agreementKind.parse(null)).toBeNull();
    expect(agreementKind.parse({ ...sample(), kind: "link" })).toBeNull();
    const noExplain = sample();
    delete noExplain.explain;
    expect(agreementKind.parse(noExplain)).toBeNull();
  });
  it("head / verb 不在句子裡、步驟太少", () => {
    const a = sample(); a.head = "zzz";
    expect(agreementKind.parse(a)).toBeNull();
    const b = sample(); b.steps = ["only one"];
    expect(agreementKind.parse(b)).toBeNull();
    const c = sample(); c.number = "many";
    expect(agreementKind.parse(c)).toBeNull();
  });
});

describe("agreement render", () => {
  for (const mobile of [false, true]) {
    it(`畫出步驟與容易看錯的例子（mobile=${mobile}）`, () => {
      const root = draw(agreementKind.builtin["agreement-difficult"], mobile);
      expect(root.textContent).toContain("number → is");
      expect(root.textContent).toContain("單數");
      expect(root.querySelectorAll("li").length).toBe(3 + 3);
      expect(root.textContent).toContain("A number of students are late.");
    });
  }
});
