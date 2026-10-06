import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Family, FamilyMember } from "../../../src/core/model/family";
import { buildGalaxyModel, constellationPoints, type GalaxyLookup, zoomFilter } from "../../../src/ui/galaxy/galaxyModel";
import { entry } from "../../services/learn/fakes";

// A lookup backed by a plain Map<entryId, VocabEntry>; isKnown mirrors the
// real A3 rule (liked === true), emoji falls back to the member's own emoji
// (set by FamilyService/EmojiService in the real app) or "❓".
function lookupOf(entries: Record<string, VocabEntry>): GalaxyLookup {
  return {
    entry: (m: FamilyMember) => (m.entryId ? entries[m.entryId] : undefined),
    emoji: (m: FamilyMember, e?: VocabEntry) => m.emoji ?? (e ? "📘" : "❓"),
    isKnown: (e?: VocabEntry) => e?.liked === true,
  };
}

const family = (groups: Family["groups"], extra: Partial<Family> = {}): Family => ({
  id: "f1",
  topic: "kitchenware",
  label: "廚房用品",
  source: "ai",
  groups,
  ...extra,
});

describe("buildGalaxyModel", () => {
  it("只有 1 組時，單字直接連中心（沒有 group 節點）", () => {
    const f = family([
      {
        label: "烹調",
        members: [
          { entryId: "e1", word: "pan", zh: "平底鍋" },
          { word: "spatula", zh: "鍋鏟" },
        ],
      },
    ]);
    const m = buildGalaxyModel(f, lookupOf({ e1: entry("e1", "pan") }), { onlyKnown: false });
    expect(m.nodes.filter((n) => n.kind === "group")).toHaveLength(0);
    expect(m.links).toEqual(
      expect.arrayContaining([
        { source: "hub", target: "e1" },
        { source: "hub", target: "w:spatula" },
      ]),
    );
    expect(m.nodes).toHaveLength(3); // hub + 2 words
  });

  it("≥2 組時加 group 節點（中心→分組→單字），group 節點沒有 emoji", () => {
    const f = family([
      { label: "烹調", members: [{ entryId: "e1", word: "pan", zh: "平底鍋" }] },
      { label: "穿戴", members: [{ word: "apron", zh: "圍裙" }] },
    ]);
    const m = buildGalaxyModel(f, lookupOf({ e1: entry("e1", "pan") }), { onlyKnown: false });
    const groups = m.nodes.filter((n) => n.kind === "group");
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.word)).toEqual(["烹調", "穿戴"]);
    expect(groups.every((g) => g.emoji === "")).toBe(true);
    expect(m.links).toEqual(
      expect.arrayContaining([
        { source: "hub", target: "group:0" },
        { source: "hub", target: "group:1" },
        { source: "group:0", target: "e1" },
        { source: "group:1", target: "w:apron" },
      ]),
    );
  });

  it("onlyKnown 時去掉未學節點，以及因此變空的分組節點", () => {
    const f = family([
      { label: "烹調", members: [{ entryId: "e1", word: "pan", zh: "平底鍋" }] },
      { label: "穿戴", members: [{ word: "apron", zh: "圍裙" }] },
    ]);
    const m = buildGalaxyModel(f, lookupOf({ e1: entry("e1", "pan") }), { onlyKnown: true });
    expect(m.nodes.map((n) => n.id).sort()).toEqual(["e1", "group:0", "hub"].sort());
    // counts 仍反映整個字族的真實已學／未學，不受 onlyKnown 影響
    expect(m.counts).toEqual({ known: 1, unknown: 1, total: 2 });
  });

  it("同一個字在兩個分組只出現一次（第一個）", () => {
    const f = family([
      { label: "A", members: [{ word: "apron", zh: "圍裙1" }] },
      { label: "B", members: [{ word: "Apron ", zh: "圍裙2" }] },
    ]);
    const m = buildGalaxyModel(f, lookupOf({}), { onlyKnown: false });
    const words = m.nodes.filter((n) => n.kind === "unknown");
    expect(words).toHaveLength(1);
    expect(words[0].zh).toBe("圍裙1");
    expect(m.links.filter((l) => l.target === "w:apron")).toHaveLength(1);
  });

  it("counts：known/unknown/total", () => {
    const f = family([
      {
        label: "烹調",
        members: [
          { entryId: "e1", word: "pan", zh: "平底鍋" },
          { word: "spatula", zh: "鍋鏟" },
        ],
      },
    ]);
    const m = buildGalaxyModel(f, lookupOf({ e1: entry("e1", "pan") }), { onlyKnown: false });
    expect(m.counts).toEqual({ known: 1, unknown: 1, total: 2 });
  });

  it("ariaLabel：已學／未學字串", () => {
    const f = family([
      {
        label: "烹調",
        members: [
          { entryId: "e1", word: "pan", zh: "平底鍋" },
          { word: "spatula", zh: "鍋鏟" },
        ],
      },
    ]);
    const m = buildGalaxyModel(f, lookupOf({ e1: entry("e1", "pan") }), { onlyKnown: false });
    const known = m.nodes.find((n) => n.id === "e1")!;
    const unknown = m.nodes.find((n) => n.id === "w:spatula")!;
    expect(known.ariaLabel).toBe("pan 平底鍋，已學");
    expect(unknown.ariaLabel).toBe("spatula 鍋鏟，未學");
  });

  it("entry 在庫但沒 like → 畫成未學（A3）", () => {
    const f = family([{ label: "烹調", members: [{ entryId: "e1", word: "pan", zh: "平底鍋" }] }]);
    const m = buildGalaxyModel(f, lookupOf({ e1: entry("e1", "pan", { liked: false }) }), { onlyKnown: false });
    expect(m.nodes.find((n) => n.id === "e1")!.kind).toBe("unknown");
    expect(m.counts).toEqual({ known: 0, unknown: 1, total: 1 });
  });

  it("fresh：依 opts.fresh 的 node id 標記", () => {
    const f = family([{ label: "烹調", members: [{ word: "spatula", zh: "鍋鏟" }] }]);
    const m = buildGalaxyModel(f, lookupOf({}), { onlyKnown: false, fresh: new Set(["w:spatula"]) });
    expect(m.nodes.find((n) => n.id === "w:spatula")!.fresh).toBe(true);
    expect(m.nodes.find((n) => n.id === "hub")!.fresh).toBe(false);
  });

  it("hub 節點帶 family 的 topic/label/emoji", () => {
    const f = family([{ label: "烹調", members: [{ word: "pan", zh: "平底鍋" }] }], { emoji: "🍳" });
    const m = buildGalaxyModel(f, lookupOf({}), { onlyKnown: false });
    const hub = m.nodes.find((n) => n.id === "hub")!;
    expect(hub).toMatchObject({ kind: "hub", word: "kitchenware", zh: "廚房用品", emoji: "🍳" });
  });

  it("空字族（沒有分組）回傳只有 hub、沒有連線", () => {
    const f = family([]);
    const m = buildGalaxyModel(f, lookupOf({}), { onlyKnown: false });
    expect(m.nodes).toEqual([expect.objectContaining({ id: "hub" })]);
    expect(m.links).toEqual([]);
    expect(m.counts).toEqual({ known: 0, unknown: 0, total: 0 });
  });
});

describe("constellationPoints", () => {
  it("回傳 n 個點，固定圓形排版，帶 known 旗標", () => {
    const pts = constellationPoints(4, [true, false, true, false]);
    expect(pts).toHaveLength(4);
    expect(pts[0]).toEqual({ x: 37 + 30, y: 15, known: true });
    expect(pts.map((p) => p.known)).toEqual([true, false, true, false]);
  });

  it("known 陣列比 n 短時，缺的視為未學", () => {
    const pts = constellationPoints(3, [true]);
    expect(pts.map((p) => p.known)).toEqual([true, false, false]);
  });

  it("n=0 回傳空陣列", () => {
    expect(constellationPoints(0, [])).toEqual([]);
  });
});

describe("zoomFilter", () => {
  const wheel = (ctrlKey: boolean, metaKey = false) => ({ type: "wheel", ctrlKey, metaKey });
  const touch = (touches: number) => ({ type: "touchstart", ctrlKey: false, metaKey: false, touches });
  const mouse = (button = 0) => ({ type: "mousedown", ctrlKey: false, metaKey: false, button });

  it("mobile 且 embedded：一律 false", () => {
    const mode = { embedded: true, mobile: true };
    expect(zoomFilter(wheel(true), mode)).toBe(false);
    expect(zoomFilter(touch(2), mode)).toBe(false);
    expect(zoomFilter(mouse(0), mode)).toBe(false);
  });

  it("embedded 桌面：wheel 只有 ctrl/meta 才 true", () => {
    const mode = { embedded: true, mobile: false };
    expect(zoomFilter(wheel(false), mode)).toBe(false);
    expect(zoomFilter(wheel(true), mode)).toBe(true);
    expect(zoomFilter(wheel(false, true), mode)).toBe(true);
  });

  it("embedded 桌面：雙指 true，單指 false", () => {
    const mode = { embedded: true, mobile: false };
    expect(zoomFilter(touch(2), mode)).toBe(true);
    expect(zoomFilter(touch(1), mode)).toBe(false);
  });

  it("embedded 桌面：滑鼠拖背景平移 true（右鍵 false）", () => {
    const mode = { embedded: true, mobile: false };
    expect(zoomFilter(mouse(0), mode)).toBe(true);
    expect(zoomFilter(mouse(2), mode)).toBe(false);
  });

  it("非 embedded（全畫面 GalaxyView）：照 d3 預設，非右鍵即可", () => {
    const mode = { embedded: false, mobile: false };
    expect(zoomFilter(wheel(false), mode)).toBe(true);
    expect(zoomFilter(mouse(0), mode)).toBe(true);
    expect(zoomFilter(mouse(2), mode)).toBe(false);
    // 非 embedded 的 mobile（GalaxyView 在手機上展開）一樣照預設
    expect(zoomFilter(touch(1), { embedded: false, mobile: true })).toBe(true);
  });
});
