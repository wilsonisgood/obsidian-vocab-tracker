import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Family, FamilyMember } from "../../../src/core/model/family";
import type { GalaxyLookup } from "../../../src/ui/galaxy/galaxyModel";
import { familiesPageGroups, familyGroupKey, familyIdOfGroupKey } from "../../../src/ui/galaxy/familiesPage";
import { entry } from "../../services/learn/fakes";

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

describe("familiesPageGroups", () => {
  it("每個字族一類：key/title/emoji 跟主題列同一個來源", () => {
    const f = family([{ label: "烹調", members: [{ entryId: "e1", word: "pan", zh: "平底鍋" }] }], { emoji: "🍳" });
    const [group] = familiesPageGroups([f], lookupOf({ e1: entry("e1", "pan") }));
    expect(group.key).toBe("family:f1");
    expect(group.title).toBe("🍳 kitchenware 廚房用品");
  });

  it("沒設 emoji 時標題用預設 🌌", () => {
    const f = family([{ label: "A", members: [{ word: "apron", zh: "圍裙" }] }]);
    const [group] = familiesPageGroups([f], lookupOf({}));
    expect(group.title).toBe("🌌 kitchenware 廚房用品");
  });

  it("在庫沒 like 也帶 entryId（不論有沒有 like）", () => {
    const f = family([{ label: "烹調", members: [{ entryId: "e1", word: "pan", zh: "平底鍋" }] }]);
    const [group] = familiesPageGroups([f], lookupOf({ e1: entry("e1", "pan", { liked: false }) }));
    expect(group.words[0]).toMatchObject({ word: "pan", entryId: "e1" });
  });

  it("不在庫的建議字不帶 entryId", () => {
    const f = family([{ label: "烹調", members: [{ word: "spatula", zh: "鍋鏟" }] }]);
    const [group] = familiesPageGroups([f], lookupOf({}));
    expect(group.words[0].entryId).toBeUndefined();
  });

  it("成員順序照字族分組的原始順序（跨分組 flatten）", () => {
    const f = family([
      { label: "烹調", members: [{ word: "pan", zh: "平底鍋" }, { word: "spatula", zh: "鍋鏟" }] },
      { label: "穿戴", members: [{ word: "apron", zh: "圍裙" }] },
    ]);
    const [group] = familiesPageGroups([f], lookupOf({}));
    expect(group.words.map((w) => w.word)).toEqual(["pan", "spatula", "apron"]);
  });

  it("空白字（沒有文字）的成員被跳過", () => {
    const f = family([{ label: "烹調", members: [{ word: "  ", zh: "" }, { word: "pan", zh: "平底鍋" }] }]);
    const [group] = familiesPageGroups([f], lookupOf({}));
    expect(group.words.map((w) => w.word)).toEqual(["pan"]);
  });

  it("分類順序照傳入的 families 順序（＝主題列順序）", () => {
    const f1 = family([{ label: "A", members: [{ word: "pan", zh: "" }] }], { id: "f1", topic: "a" });
    const f2 = family([{ label: "B", members: [{ word: "apron", zh: "" }] }], { id: "f2", topic: "b" });
    const groups = familiesPageGroups([f2, f1], lookupOf({}));
    expect(groups.map((g) => g.key)).toEqual(["family:f2", "family:f1"]);
  });
});

describe("familyGroupKey / familyIdOfGroupKey", () => {
  it("互為反函數", () => {
    expect(familyGroupKey("abc")).toBe("family:abc");
    expect(familyIdOfGroupKey("family:abc")).toBe("abc");
  });

  it("familyIdOfGroupKey 對沒有前綴的字串原樣回傳（防呆）", () => {
    expect(familyIdOfGroupKey("abc")).toBe("abc");
  });
});
