import { describe, expect, it } from "vitest";
import { clauseKind } from "../../src/grammar-visual/kinds/clause";
import { topicsOfLayout } from "../../src/grammar-visual";
import { clickButton, draw } from "./support";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const topics = topicsOfLayout("clause");

describe("clause", () => {
  it("每個主題都有 builtin，且通過 parse", () => {
    expect(topics.length).toBe(7);
    for (const id of topics) {
      const v = clauseKind.builtin[id];
      expect(v, id).toBeDefined();
      expect(clauseKind.parse(clone(v)), id).toEqual(v);
    }
  });
  it("不合格輸入回 null", () => {
    const v = clone(clauseKind.builtin["advanced-relative-clauses"]);
    expect(clauseKind.parse(undefined)).toBeNull();
    expect(clauseKind.parse({ ...v, clauses: [] })).toBeNull();
    const jump = clone(v);
    jump.clauses[0].depth = 2;
    expect(clauseKind.parse(jump)).toBeNull();
    const deep = clone(v);
    deep.clauses[1].depth = 4;
    expect(clauseKind.parse(deep)).toBeNull();
    expect(clauseKind.parse({ ...v, core: "" })).toBeNull();
  });
  it("展開子句與只看主幹可以切換", () => {
    const v = clauseKind.builtin["relative-clauses-basic"];
    for (const mobile of [false, true]) {
      const root = draw(v, mobile);
      expect(root.textContent).toContain("主幹（先讀這個）");
      expect(root.textContent).toContain("掛在 The woman 後面");
      expect(root.textContent).toContain("關係子句（限定）");
      clickButton(root, "只看主幹");
      expect(root.textContent).not.toContain("掛在 The woman 後面");
      expect(root.textContent).toContain("子句先收起來了");
      clickButton(root, "展開子句");
      expect(root.textContent).toContain("掛在 The woman 後面");
    }
  });
});
