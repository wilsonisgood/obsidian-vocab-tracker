import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLocale, setLocale, type Locale } from "../../../src/core/i18n";
import { datesText, dayLabel, recordDates } from "../../../src/ui/kit/dates";

// 加入 / 更新日期 on the learning pages (1005 回饋 #14).

let previous: Locale;
beforeAll(() => {
  previous = getLocale();
  setLocale("zh-TW");
});
afterAll(() => setLocale(previous));

// Local noon, so the day doesn't move with the test machine's time zone.
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const NOW = new Date(2026, 9, 5, 12);

describe("dates", () => {
  it("labels a day, with the year only when it isn't this year", () => {
    expect(dayLabel(local(2026, 10, 3), NOW)).toBe("10/03");
    expect(dayLabel(local(2025, 12, 31), NOW)).toBe("2025/12/31");
    expect(dayLabel(undefined, NOW)).toBeUndefined();
    expect(dayLabel("not a date", NOW)).toBeUndefined();
  });

  it("shows 更新 only when it's another day", () => {
    expect(recordDates({ createdAt: local(2026, 10, 3), updatedAt: local(2026, 10, 5) }, NOW)).toEqual({ added: "10/03", updated: "10/05" });
    expect(recordDates({ createdAt: local(2026, 10, 3), updatedAt: local(2026, 10, 3) }, NOW)).toEqual({ added: "10/03" });
    expect(recordDates({}, NOW)).toEqual({});
  });

  it("reads 「加入 10/03 · 更新 10/05」, or 「收藏 …」", () => {
    expect(datesText({ added: "10/03", updated: "10/05" })).toBe("加入 10/03 · 更新 10/05");
    expect(datesText({ added: "10/03" }, "saved")).toBe("收藏 10/03");
    expect(datesText({ updated: "10/05" })).toBe("更新 10/05");
    expect(datesText({})).toBe("");
    setLocale("en");
    expect(datesText({ added: "10/03", updated: "10/05" })).toBe("Added 10/03 · Updated 10/05");
    setLocale("zh-TW");
  });
});
