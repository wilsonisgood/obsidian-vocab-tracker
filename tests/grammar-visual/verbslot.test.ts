import { describe, expect, it } from "vitest";
import { topicsOfLayout } from "../../src/grammar-visual";
import { verbslotKind } from "../../src/grammar-visual/kinds/verbslot";
import type { Visual } from "../../src/grammar-visual";
import { draw } from "./support";

const entries = Object.entries(verbslotKind.builtin) as [string, Visual][];
const clone = (v: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(v));

describe("verbslot 版面", () => {
  it("每個主題都有內建版面", () => {
    expect(Object.keys(verbslotKind.builtin).sort()).toEqual([...topicsOfLayout("verbslot")].sort());
  });

  it("每份內建都通過自己的 parse", () => {
    for (const [id, v] of entries) expect(verbslotKind.parse(clone(v)), id).toEqual(v);
  });

  it("不合格的輸入回 null", () => {
    const good = clone(entries[0][1]);
    expect(verbslotKind.parse(null)).toBeNull();
    expect(verbslotKind.parse({ ...good, kind: "scale" })).toBeNull();
    expect(verbslotKind.parse({ ...good, explain: "" })).toBeNull();
    expect(verbslotKind.parse({ ...good, explain: "字".repeat(200) })).toBeNull();
    expect(verbslotKind.parse({ ...good, cards: [] })).toBeNull();
    const cards = good.cards as { current: boolean; picture: unknown[] }[];
    expect(verbslotKind.parse({ ...good, cards: cards.map((c) => ({ ...c, current: false })) })).toBeNull();
    expect(verbslotKind.parse({ ...good, cards: cards.map((c) => ({ ...c, picture: Array(6).fill({ text: "x", tone: "plain" }) })) })).toBeNull();
    expect(verbslotKind.parse({ ...good, family: "remember" })).toBeNull();
  });

  it("電腦版與手機版都畫得出來", () => {
    const [, v] = entries[0];
    for (const mobile of [false, true]) {
      const root = draw(v, mobile);
      expect(root.textContent).toContain(v.sentence.text);
      expect(root.textContent).toContain(v.explain);
      expect(root.textContent).toContain((v as { verb: string }).verb);
    }
  });

});
