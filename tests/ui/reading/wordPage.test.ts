import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  setIcon: () => undefined,
  MarkdownRenderChild: class {
    constructor(public containerEl: unknown) {}
  },
}));

import { getLocale, setLocale, type Locale } from "../../../src/core/i18n";
import { renderWordPageFile } from "../../../src/services/export/renderers/wordPage";
import { exportLabels } from "../../../src/services/export/labels";
import { sectionAtHeading, sectionByTitle, wordPageEntryId } from "../../../src/ui/reading/WordPageDecorator";
import { dueLabel, findTarget, sourceLabel, wordTarget } from "../../../src/ui/blocks/wordHeader";
import { entry } from "../../services/export/fixtures";

let previousLocale: Locale;
beforeAll(() => {
  previousLocale = getLocale();
  setLocale("zh-TW");
});
afterAll(() => setLocale(previousLocale));

describe("WordPageDecorator", () => {
  it("only acts on word pages", () => {
    expect(wordPageEntryId({ "vocab-tracker": "word", "vocab-tracker-id": "1721900000000" })).toBe("1721900000000");
    expect(wordPageEntryId({ "vocab-tracker": "word", "vocab-tracker-id": 17 })).toBe("17");
    expect(wordPageEntryId({ "vocab-tracker": "ai-note", "vocab-tracker-id": "eng/x.md" })).toBeNull();
    expect(wordPageEntryId({ "vocab-tracker": "word" })).toBeNull();
    expect(wordPageEntryId({ title: "x" })).toBeNull();
    expect(wordPageEntryId(null)).toBeNull();
  });

  it("finds each managed heading of a real word page by its marker", () => {
    const labels = exportLabels();
    const page = renderWordPageFile(
      { entry: { id: "1", word: "glittery" }, families: [], trivia: [] },
      { labels, formatDate: (s) => s, taskLabel: () => undefined, entryWord: () => undefined, pageLink: () => null }
    );
    const lines = page.split("\n");
    const found = lines.flatMap((line, i) => (line.startsWith("## ") ? [[line.slice(3), sectionAtHeading(page, i)]] : []));
    expect(found).toEqual([
      [labels.families, "families"],
      [labels.usage, "usage"],
      [labels.trivia, "trivia"],
      [labels.discussion, "discussion"],
    ]);
  });

  it("ignores the user's own headings, and unknown or foreign sections", () => {
    const text = [
      "%% vt:begin families %%",
      "",
      "## 字族", // 2
      "%% vt:end families %%",
      "## 我的筆記", // 4
      "%% vt:begin trivia-favorites %%",
      "## 收藏", // 6
      "## first line", // 7
    ].join("\n");
    expect(sectionAtHeading(text, 2)).toBe("families");
    expect(sectionAtHeading(text, 4)).toBeNull();
    expect(sectionAtHeading(text, 6)).toBeNull();
    expect(sectionAtHeading("## first line", 0)).toBeNull();
  });

  it("falls back to the heading's text in the current language", () => {
    expect(sectionByTitle(" 字族 ")).toBe("families");
    expect(sectionByTitle("AI 討論")).toBe("discussion");
    expect(sectionByTitle("我的筆記")).toBeNull();
  });
});

describe("vocab-word header", () => {
  const GLITTERY = entry("1721900000000", "glittery");
  const OTHER = entry("2", "Leotard");

  it("takes the word from the block, then the page's id, then the note's name", () => {
    const fm = { "vocab-tracker": "word", "vocab-tracker-id": "1721900000000" };
    expect(wordTarget({ id: "9" }, fm, "單字/glittery.md")).toEqual({ id: "9" });
    expect(wordTarget({ word: "leotard" }, fm, "單字/glittery.md")).toEqual({ word: "leotard" });
    expect(wordTarget({}, fm, "我的/閃亮.md")).toEqual({ id: "1721900000000" });
    expect(wordTarget({}, { "vocab-tracker-id": "1" }, "單字/glittery.md")).toEqual({ word: "glittery" });
    expect(wordTarget({}, null, "單字/glittery.md")).toEqual({ word: "glittery" });
  });

  it("finds live entries by id or by word in any case", () => {
    const deleted = entry("3", "gone", { deletedAt: "2026-10-01T00:00:00Z" });
    const all = [GLITTERY, OTHER, deleted];
    expect(findTarget(all, { id: "1721900000000" })).toBe(GLITTERY);
    expect(findTarget(all, { word: "leotard" })).toBe(OTHER);
    expect(findTarget(all, { id: "3" })).toBeUndefined();
    expect(findTarget(all, { word: "" })).toBeUndefined();
  });

  it("labels the next review", () => {
    const now = new Date(2026, 9, 5, 15, 0);
    const card = (due: Date) => ({
      due: due.toISOString(),
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 3,
      lapses: 0,
      state: 2 as const,
    });
    expect(dueLabel(entry("n", "new"), now)).toBe("還沒開始複習");
    expect(dueLabel(entry("a", "a", { srs: card(new Date(2026, 9, 5, 23, 59)) }), now)).toBe("今天到期");
    expect(dueLabel(entry("b", "b", { srs: card(new Date(2026, 9, 1)) }), now)).toBe("今天到期");
    expect(dueLabel(entry("c", "c", { srs: card(new Date(2026, 9, 6, 0, 0)) }), now)).toBe("下次複習 10/06");
  });

  it("labels the source with its paragraph number when known", () => {
    expect(sourceLabel("eng/Taylor_Swift_NYU.md", 12)).toBe("出自 Taylor_Swift_NYU ¶12");
    expect(sourceLabel("eng/Taylor_Swift_NYU.md", null)).toBe("出自 Taylor_Swift_NYU");
  });
});
