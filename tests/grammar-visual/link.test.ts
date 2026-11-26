import { describe, expect, it } from "vitest";
import { parseVisual, topicsOfLayout, builtinVisual } from "../../src/grammar-visual";
import { linkKind } from "../../src/grammar-visual/kinds/link";
import { clickButton, draw } from "./support";

const topics = topicsOfLayout("link");
const sample = () => JSON.parse(JSON.stringify(linkKind.builtin[topics[0]]));

describe("link builtin", () => {
  it("每個主題都有 builtin 且通過自己的 parse", () => {
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      const v = linkKind.builtin[t];
      expect(v, t).toBeTruthy();
      expect(linkKind.parse(JSON.parse(JSON.stringify(v))), t).toEqual(v);
      expect(builtinVisual(t)).toEqual(v);
      expect(parseVisual(JSON.parse(JSON.stringify(v)))).toEqual(v);
    }
  });
  it("schema 的 required 與 properties 一致", () => {
    const s = linkKind.schema as { required: string[]; properties: Record<string, unknown> };
    expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
    expect(linkKind.guide.length).toBeLessThanOrEqual(600);
  });
});

describe("link parse 擋掉不合格", () => {
  it("缺欄位、kind 不對", () => {
    expect(linkKind.parse(null)).toBeNull();
    expect(linkKind.parse({ ...sample(), kind: "compare" })).toBeNull();
    const noExplain = sample();
    delete noExplain.explain;
    expect(linkKind.parse(noExplain)).toBeNull();
  });
  it("連線的字不在句子裡、沒有連線、kind 錯", () => {
    // 對不到的那條略過；全部對不到才 null。
    const a = sample(); a.links[0].from = "zzz";
    expect(linkKind.parse(a)?.links.length ?? 0).toBe(sample().links.length - 1);
    const all = sample(); for (const l of all.links) l.from = "zzz";
    expect(linkKind.parse(all)).toBeNull();
    const b = sample(); b.links = [];
    expect(linkKind.parse(b)).toBeNull();
    const c = sample(); c.links[0].kind = "x";
    expect(linkKind.parse(c)?.links.length ?? 0).toBe(sample().links.length - 1);
  });
  it("所有格：彎引號、大小寫不同也找得到", () => {
    const v = linkKind.parse({
      kind: "link",
      sentence: { text: "Tom's bike is red.", marks: [] },
      explain: "'s 表示誰的。",
      links: [{ from: "TOM’S", to: "bike", kind: "refer", why: "誰的腳踏車" }],
    });
    expect(v?.links.length).toBe(1);
  });
});

describe("link render", () => {
  for (const mobile of [false, true]) {
    it(`點一列，句子裡兩端的字一起亮（mobile=${mobile}）`, () => {
      const root = draw(linkKind.builtin["personal-pronouns"], mobile);
      const lit = () => root.querySelectorAll(".gv-mark").map((m) => m.textContent);
      expect(lit()).toEqual(["Mia", "she"]);
      expect(root.querySelectorAll(".gv-link-row").length).toBe(3);
      clickButton(root, "them → keys");
      expect(lit()).toEqual(["keys", "them"]);
      expect(root.textContent).toContain("受格 them");
    });
  }
  it("每個主題的每條連線都能點出兩端", () => {
    for (const t of topics) {
      const root = draw(linkKind.builtin[t]);
      linkKind.builtin[t].links.forEach((l, i) => {
        root.querySelectorAll(".gv-link-row")[i].click();
        expect(root.querySelectorAll(".gv-mark").length, `${t} ${l.from}`).toBeGreaterThanOrEqual(1);
      });
    }
  });
});
