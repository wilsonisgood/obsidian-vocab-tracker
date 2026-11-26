import { describe, expect, it } from "vitest";
import { orderKind } from "../../src/grammar-visual/kinds/order";
import { topicsOfLayout } from "../../src/grammar-visual";
import { draw } from "./support";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const topics = topicsOfLayout("order");

describe("order", () => {
  it("每個主題都有 builtin，且通過 parse", () => {
    expect(topics.length).toBe(11);
    for (const id of topics) {
      const v = orderKind.builtin[id];
      expect(v, id).toBeDefined();
      expect(orderKind.parse(clone(v)), id).toEqual(v);
    }
  });
  it("不合格輸入回 null", () => {
    const v = clone(orderKind.builtin["negative-inversion"]);
    expect(orderKind.parse(null)).toBeNull();
    expect(orderKind.parse({ ...v, kind: "scope" })).toBeNull();
    expect(orderKind.parse({ ...v, steps: [] })).toBeNull();
    expect(orderKind.parse({ ...v, base: [v.base[0]] })).toBeNull();
    // 步驟編號說了算：0 → plain；有編號卻標 plain → moved；超出範圍夾回。
    const bad = clone(v);
    bad.result[0].step = 0;
    expect(orderKind.parse(bad)?.result[0].role).toBe("plain");
    const bad2 = clone(v);
    bad2.base[0].step = 5;
    const p2 = orderKind.parse(bad2);
    expect(p2?.base[0].step).toBe(v.steps.length);
    expect(p2?.base[0].role).toBe("moved");
  });
  it("電腦版與手機版都畫得出來", () => {
    const v = orderKind.builtin["negative-inversion"];
    for (const mobile of [false, true]) {
      const root = draw(v, mobile);
      expect(root.textContent).toContain("一般語序");
      expect(root.textContent).toContain("① Rarely");
      expect(root.textContent).toContain("② have");
      expect(root.textContent).toContain("助動詞 have 跟著跳到主詞前面");
    }
  });
});
