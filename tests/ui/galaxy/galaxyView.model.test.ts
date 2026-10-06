import { describe, expect, it } from "vitest";
import { t } from "../../../src/core/i18n";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Family, FamilyMember } from "../../../src/core/model/family";
import type { GalaxyLookup } from "../../../src/ui/galaxy/galaxyModel";
import { buildGalaxyModel } from "../../../src/ui/galaxy/galaxyModel";
import {
  buildGalaxyCard,
  buildTopics,
  detailRows,
  L,
  resolveAddWord,
} from "../../../src/ui/galaxy/galaxyView.model";
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

describe("buildTopics", () => {
  it("每個字族一筆，counts／emoji／星座點都跟 buildGalaxyModel 一致", () => {
    const f = family([{ label: "烹調", members: [{ entryId: "e1", word: "pan", zh: "平底鍋" }, { word: "spatula", zh: "鍋鏟" }] }], {
      emoji: "🍳",
    });
    const [topic] = buildTopics([f], lookupOf({ e1: entry("e1", "pan") }));
    expect(topic).toMatchObject({ id: "f1", topic: "kitchenware", label: "廚房用品", emoji: "🍳", known: 1, unknown: 1 });
    expect(topic.points).toHaveLength(2);
    expect(topic.points.map((p) => p.known)).toEqual([true, false]);
  });

  it("字族沒設 emoji 時用預設 🌌", () => {
    const f = family([{ label: "A", members: [{ word: "apron", zh: "圍裙" }] }]);
    const [topic] = buildTopics([f], lookupOf({}));
    expect(topic.emoji).toBe("🌌");
  });

  it("空字族：counts 0、沒有星座點", () => {
    const f = family([]);
    const [topic] = buildTopics([f], lookupOf({}));
    expect(topic).toMatchObject({ known: 0, unknown: 0 });
    expect(topic.points).toEqual([]);
  });
});

describe("resolveAddWord", () => {
  const f = family([
    { label: "烹調", members: [{ entryId: "e1", word: "pan", zh: "平底鍋" }] },
    { label: "穿戴", members: [{ word: "Apron", zh: "圍裙" }] },
  ]);

  it("w:<word> 形式的 id 找回建議字", () => {
    expect(resolveAddWord("w:apron", f)).toBe("Apron");
  });

  it("entryId 形式的 id 找回在庫字（在庫沒 like 時也走 addSuggested）", () => {
    expect(resolveAddWord("e1", f)).toBe("pan");
  });

  it("找不到就回傳 undefined", () => {
    expect(resolveAddWord("w:missing", f)).toBeUndefined();
  });
});

describe("toast 文案", () => {
  it("expandFound：n 個新字＋頓號清單", () => {
    expect(L.expandFound(["kettle", "jar"])).toContain("AI 找到 2 個新字");
    expect(L.expandFound(["kettle", "jar"])).toContain("點節點再按 ＋ 加入");
  });

  it("addedWord：加入單字庫文案", () => {
    expect(L.addedWord("kettle")).toBe("已把 kettle 加入單字庫，會自動查字典");
  });

  it("noMoreSuggestions：固定文案", () => {
    expect(L.noMoreSuggestions).toBe("目前沒有更多建議了");
  });
});

describe("detailRows", () => {
  it("只列已學（有 entryId）的節點，照 graph 的去重順序", () => {
    const f = family([
      { label: "烹調", members: [{ entryId: "e1", word: "pan", zh: "平底鍋" }, { word: "spatula", zh: "鍋鏟" }] },
    ]);
    const model = buildGalaxyModel(f, lookupOf({ e1: entry("e1", "pan") }), { onlyKnown: false });
    expect(detailRows(model)).toEqual([{ entryId: "e1", word: "pan", zh: "平底鍋", emoji: "📘" }]);
  });

  it("沒有已學字時回傳空陣列", () => {
    const f = family([{ label: "烹調", members: [{ word: "spatula", zh: "鍋鏟" }] }]);
    const model = buildGalaxyModel(f, lookupOf({}), { onlyKnown: false });
    expect(detailRows(model)).toEqual([]);
  });
});

describe("buildGalaxyCard", () => {
  it("帶出詳情卡欄位，source 有值時給「出自 檔名」", () => {
    const e = entry("e1", "apron", {
      phonetic: "/ˈeɪprən/",
      partOfSpeech: "n.",
      definitionZh: "圍裙",
      example: "She wore an apron.",
      source: { path: "folder/My Note.md", line: 3 },
    });
    const card = buildGalaxyCard(e, "🧑‍🍳", undefined);
    expect(card.sourceLabel).toBe(t("wordPage.source", { source: "My Note" }));
    expect(card).toMatchObject({ entryId: "e1", word: "apron", emoji: "🧑‍🍳", zh: "圍裙", example: "She wore an apron." });
    expect(card.breakdown).toBeUndefined();
  });

  it("沒有 source 時 sourceLabel 是 null", () => {
    const e = entry("e1", "apron");
    expect(buildGalaxyCard(e, "🧑‍🍳", undefined).sourceLabel).toBeNull();
  });

  it("breakdown status 不是 ok 時不帶出（09 §2 決定 4/5）", () => {
    const e = entry("e1", "apron");
    const breakdown = { status: "none" as const, parts: [], gloss: "", word: "apron", generatedAt: "", model: "" };
    expect(buildGalaxyCard(e, "🧑‍🍳", breakdown).breakdown).toBeUndefined();
  });

  it("breakdown status ok 時原樣帶出", () => {
    const e = entry("e1", "apron");
    const breakdown = { status: "ok" as const, parts: [], gloss: "", word: "apron", generatedAt: "", model: "" };
    expect(buildGalaxyCard(e, "🧑‍🍳", breakdown).breakdown).toEqual(breakdown);
  });
});
