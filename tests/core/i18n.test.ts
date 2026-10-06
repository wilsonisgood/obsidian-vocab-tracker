import { afterEach, describe, expect, it } from "vitest";
import { joinWords, resolveLocale, setLocale, t } from "../../src/core/i18n";
import { en } from "../../src/core/i18n/en";
import { zhTW } from "../../src/core/i18n/zh-TW";

describe("t", () => {
  afterEach(() => setLocale("en"));

  it("returns the English string by default", () => {
    expect(t("row.delete")).toBe("Delete");
  });

  it("interpolates {param} placeholders", () => {
    expect(t("row.meta.added", { date: "2026-01-01" })).toBe("Added: 2026-01-01");
  });

  it("leaves unmatched placeholders untouched", () => {
    expect(t("row.meta.added")).toBe("Added: {date}");
  });

  it("switches locale via setLocale", () => {
    setLocale("zh-TW");
    expect(t("row.delete")).toBe("刪除");
  });
});

describe("dictionaries", () => {
  it("fill every key in both languages, with the same placeholders", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[key].trim(), key).not.toBe("");
      expect(zhTW[key].trim(), key).not.toBe("");
      expect(vars(zhTW[key]), key).toEqual(vars(en[key]));
    }
  });

  it("carry the M7 learning-block strings", () => {
    setLocale("zh-TW");
    expect(t("learn.family.saved", { families: 3 })).toBe(
      "已存 3 個字族。新字以文字成員存在字族樹裡，點一下（或旁邊的 ＋）就能加入單字庫。"
    );
    setLocale("en");
    expect(t("learn.family.saved", { families: 3 })).toBe(
      "Saved 3 families. New words sit in the tree as text — tap one (or its ＋) to add it."
    );
    expect(t("learn.trivia.random")).toBe("Random from your {n} words");
  });
});

describe("joinWords", () => {
  afterEach(() => setLocale("en"));

  it("joins with 、 in Chinese and a comma in English", () => {
    setLocale("zh-TW");
    expect(joinWords(["aprons", "kitchenware"])).toBe("aprons、kitchenware");
    setLocale("en");
    expect(joinWords(["a", "b"])).toBe("a, b");
    expect(joinWords([])).toBe("");
  });
});

describe("resolveLocale", () => {
  it("follows Obsidian's language when set to auto", () => {
    expect(resolveLocale("auto", "zh-TW")).toBe("zh-TW");
    expect(resolveLocale("auto", "zh")).toBe("zh-TW");
    expect(resolveLocale("auto", "en")).toBe("en");
    expect(resolveLocale("auto", "ja")).toBe("en");
  });

  it("honours an explicit choice", () => {
    expect(resolveLocale("en", "zh-TW")).toBe("en");
    expect(resolveLocale("zh-TW", "en")).toBe("zh-TW");
  });
});
