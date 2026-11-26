import { describe, expect, it } from "vitest";
import { parseVisual, topicsOfLayout, builtinVisual } from "../../src/grammar-visual";
import { backshiftKind } from "../../src/grammar-visual/kinds/backshift";
import { draw } from "./support";

const topics = topicsOfLayout("backshift");
const sample = () => JSON.parse(JSON.stringify(backshiftKind.builtin[topics[0]]));

describe("backshift builtin", () => {
  it("每個主題都有 builtin 且通過自己的 parse", () => {
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      const v = backshiftKind.builtin[t];
      expect(v, t).toBeTruthy();
      expect(backshiftKind.parse(JSON.parse(JSON.stringify(v))), t).toEqual(v);
      expect(builtinVisual(t)).toEqual(v);
      expect(parseVisual(JSON.parse(JSON.stringify(v)))).toEqual(v);
    }
  });
  it("schema 的 required 與 properties 一致", () => {
    const s = backshiftKind.schema as { required: string[]; properties: Record<string, unknown> };
    expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
    expect(backshiftKind.guide.length).toBeLessThanOrEqual(600);
  });
});

describe("backshift parse 擋掉不合格", () => {
  it("缺欄位、kind 不對", () => {
    expect(backshiftKind.parse(null)).toBeNull();
    expect(backshiftKind.parse({ ...sample(), kind: "link" })).toBeNull();
    const noExplain = sample();
    delete noExplain.explain;
    expect(backshiftKind.parse(noExplain)).toBeNull();
  });
  it("swap 的字不在句子裡、沒有 swaps", () => {
    // 對不到的那組略過；全部對不到才 null。
    const a = sample(); a.swaps[0].from = "zzz";
    expect(backshiftKind.parse(a)?.swaps.length ?? 0).toBe(sample().swaps.length - 1);
    const all = sample(); for (const s of all.swaps) s.from = "zzz";
    expect(backshiftKind.parse(all)).toBeNull();
    const b = sample(); b.swaps = [];
    expect(backshiftKind.parse(b)).toBeNull();
    const c = sample(); c.swaps[0].type = "mood";
    expect(backshiftKind.parse(c)).toBeNull();
  });
});

describe("backshift render", () => {
  for (const mobile of [false, true]) {
    it(`畫出原話、轉述與對照（mobile=${mobile}）`, () => {
      const root = draw(backshiftKind.builtin["reported-speech"], mobile);
      expect(root.textContent).toContain("I will call you tomorrow.");
      expect(root.textContent).toContain("She said she would call me the next day.");
      expect(root.textContent).toContain("時態：");
      expect(root.querySelectorAll(".gv-backshift-row").length).toBe(4);
    });
  }
});
