import { afterEach, describe, expect, it } from "vitest";
import { resolveLocale, setLocale, t } from "../../src/core/i18n";

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
