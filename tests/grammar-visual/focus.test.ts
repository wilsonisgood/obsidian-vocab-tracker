import { describe, expect, it } from "vitest";
import { topicsOfLayout } from "../../src/grammar-visual";
import { focusKind } from "../../src/grammar-visual/kinds/focus";
import type { Visual } from "../../src/grammar-visual";
import { draw } from "./support";

const entries = Object.entries(focusKind.builtin) as [string, Visual][];
const clone = (v: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(v));

describe("focus 版面", () => {
  it("每個主題都有內建版面", () => {
    expect(Object.keys(focusKind.builtin).sort()).toEqual([...topicsOfLayout("focus")].sort());
  });

  it("每份內建都通過自己的 parse", () => {
    for (const [id, v] of entries) expect(focusKind.parse(clone(v)), id).toEqual(v);
  });

  it("不合格的輸入回 null", () => {
    const good = clone(entries[0][1]);
    expect(focusKind.parse(null)).toBeNull();
    expect(focusKind.parse({ ...good, kind: "scale" })).toBeNull();
    expect(focusKind.parse({ ...good, explain: "" })).toBeNull();
    expect(focusKind.parse({ ...good, explain: "字".repeat(200) })).toBeNull();
    expect(focusKind.parse({ ...good, cards: [] })).toBeNull();
    const cards = good.cards as { current: boolean }[];
    expect(focusKind.parse({ ...good, cards: cards.map((c) => ({ ...c, current: true })) })).toBeNull();
    expect(focusKind.parse({ ...good, cards: cards.map((c) => ({ ...c, current: false })) })).toBeNull();
    expect(focusKind.parse({ ...good, cards: cards.map((c) => ({ ...c, focus: "boss" })) })).toBeNull();
  });

  it("電腦版與手機版都畫得出來", () => {
    const [, v] = entries[0];
    for (const mobile of [false, true]) {
      const root = draw(v, mobile);
      expect(root.textContent).toContain(v.sentence.text);
      expect(root.textContent).toContain(v.explain);
      expect(root.textContent).toContain("先看到");
    }
  });

});
