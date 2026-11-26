import { describe, expect, it } from "vitest";
import { topicsOfLayout } from "../../src/grammar-visual";
import { connectorKind } from "../../src/grammar-visual/kinds/connector";
import type { Visual } from "../../src/grammar-visual";
import { clickButton, draw } from "./support";

const entries = Object.entries(connectorKind.builtin) as [string, Visual][];
const clone = (v: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(v));

describe("connector 版面", () => {
  it("每個主題都有內建版面", () => {
    expect(Object.keys(connectorKind.builtin).sort()).toEqual([...topicsOfLayout("connector")].sort());
  });

  it("每份內建都通過自己的 parse", () => {
    for (const [id, v] of entries) expect(connectorKind.parse(clone(v)), id).toEqual(v);
  });

  it("不合格的輸入回 null", () => {
    const good = clone(entries[0][1]);
    expect(connectorKind.parse(null)).toBeNull();
    expect(connectorKind.parse({ ...good, kind: "scale" })).toBeNull();
    expect(connectorKind.parse({ ...good, explain: "" })).toBeNull();
    expect(connectorKind.parse({ ...good, explain: "字".repeat(200) })).toBeNull();
    expect(connectorKind.parse({ ...good, relation: "other" })).toBeNull();
    expect(connectorKind.parse({ ...good, compare: [] })).toBeNull();
    expect(connectorKind.parse({ ...good, left: { text: "", note: "" } })).toBeNull();
  });

  it("電腦版與手機版都畫得出來", () => {
    const [, v] = entries[0];
    for (const mobile of [false, true]) {
      const root = draw(v, mobile);
      expect(root.textContent).toContain(v.sentence.text);
      expect(root.textContent).toContain(v.explain);
      expect(root.textContent).toContain("同樣是");
    }
  });

  it("六種關係的切換鈕", () => {
    const v = connectorKind.builtin["concession-contrast"];
    const root = draw(v);
    expect(root.querySelectorAll("button")).toHaveLength(6);
    clickButton(root, "因果");
    expect(root.textContent).toContain("Because it rained");
    expect(root.textContent).not.toContain(v.explain);
    clickButton(root, "轉折");
    expect(root.textContent).toContain(v.explain);
    expect(root.textContent).toContain("despite");
  });
});
