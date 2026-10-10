import { afterEach, describe, expect, it } from "vitest";
import { setLocale, t } from "../../../src/core/i18n";
import type { Family } from "../../../src/core/model/family";
import { buildTopics, resolveAddWord } from "../../../src/ui/galaxy/galaxyView.model";

afterEach(() => setLocale("en"));

const family = (groups: Family["groups"], extra: Partial<Family> = {}): Family => ({
  id: "f1",
  topic: "kitchenware",
  label: "廚房用品",
  source: "ai",
  groups,
  ...extra,
});

describe("buildTopics", () => {
  it("每個字族一筆：id／topic／label／emoji（1007-2 #4：拿掉 known/unknown 數字與星座縮圖）", () => {
    const f = family([{ label: "烹調", members: [{ entryId: "e1", word: "pan", zh: "平底鍋" }] }], { emoji: "🍳" });
    const [topic] = buildTopics([f]);
    expect(topic).toEqual({ id: "f1", topic: "kitchenware", label: "廚房用品", emoji: "🍳" });
  });

  it("字族沒設 emoji 時用預設 🌌", () => {
    const f = family([{ label: "A", members: [{ word: "apron", zh: "圍裙" }] }]);
    const [topic] = buildTopics([f]);
    expect(topic.emoji).toBe("🌌");
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
    setLocale("zh-TW");
    const text = t("galaxy.expandFound", { n: 2, words: "kettle、jar" });
    expect(text).toContain("AI 找到 2 個新字");
    expect(text).toContain("點節點再按 ＋ 加入");
  });

  it("addedWord：加入單字庫文案", () => {
    setLocale("zh-TW");
    expect(t("galaxy.addedWord", { word: "kettle" })).toBe("已加入 kettle");
  });

  it("noMoreSuggestions：固定文案", () => {
    setLocale("zh-TW");
    expect(t("galaxy.noMoreSuggestions")).toBe("目前沒有更多建議了");
  });
});
