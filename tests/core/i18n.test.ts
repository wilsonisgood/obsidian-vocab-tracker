import { afterEach, describe, expect, it } from "vitest";
import { setLocale, t } from "../../src/core/i18n";

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
