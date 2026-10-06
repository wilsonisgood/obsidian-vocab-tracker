import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLocale, setLocale, type Locale } from "../../../src/core/i18n";
import type { DeletionImpact } from "../../../src/services/learn/linkage";
import { deletionImpactLines } from "../../../src/ui/word/deleteEntryImpact";

let previousLocale: Locale;
beforeAll(() => {
  previousLocale = getLocale();
  setLocale("zh-TW");
});
afterAll(() => setLocale(previousLocale));

const impact = (extra: Partial<DeletionImpact> = {}): DeletionImpact => ({
  families: 0,
  triviaMentions: 0,
  verbFavorite: false,
  wordPageExists: false,
  threadCount: 0,
  ...extra,
});

describe("deletionImpactLines", () => {
  it("is empty when nothing is linked", () => {
    expect(deletionImpactLines(impact())).toEqual([]);
  });

  it("lists only what's actually linked, in a fixed order", () => {
    const lines = deletionImpactLines(
      impact({ families: 2, triviaMentions: 1, verbFavorite: true, wordPageExists: true, threadCount: 5 })
    );
    expect(lines).toEqual([
      "在 2 個字族裡（文字會保留，之後可再加回）",
      "被 1 則冷知識提及",
      "已收藏用法",
      "有單字頁",
      "單字頁有 5 則討論",
    ]);
  });

  it("skips zero counts and false flags individually", () => {
    expect(deletionImpactLines(impact({ families: 1 }))).toEqual(["在 1 個字族裡（文字會保留，之後可再加回）"]);
    expect(deletionImpactLines(impact({ verbFavorite: true }))).toEqual(["已收藏用法"]);
  });
});
