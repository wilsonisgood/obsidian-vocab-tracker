import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../src/core/i18n";
import { ERROR_TAGS } from "../../../src/core/model/grammar";
import { errorTagLabel, stageLabel } from "../../../src/ui/grammar/labels";

afterEach(() => setLocale("en"));

describe("stageLabel", () => {
  it("is 基礎／中級／進階 in zh-TW and Basic／Intermediate／Advanced in en", () => {
    setLocale("zh-TW");
    expect(([1, 2, 3] as const).map(stageLabel)).toEqual(["基礎", "中級", "進階"]);
    setLocale("en");
    expect(([1, 2, 3] as const).map(stageLabel)).toEqual(["Basic", "Intermediate", "Advanced"]);
  });
});

describe("errorTagLabel", () => {
  it("has a real label for every error tag in both languages", () => {
    for (const tag of ERROR_TAGS) {
      setLocale("zh-TW");
      expect(errorTagLabel(tag), tag).not.toMatch(/^grammar\./);
      expect(errorTagLabel(tag), tag).toMatch(/[一-鿿]/);
      setLocale("en");
      expect(errorTagLabel(tag), tag).toMatch(/^[A-Z]/);
    }
  });
});
