import { describe, expect, it } from "vitest";
import { looksLikeValidTranslation } from "../../../../src/services/dictionary/translate/validate";

describe("looksLikeValidTranslation", () => {
  it("rejects an empty string", () => {
    expect(looksLikeValidTranslation("")).toBe(false);
  });

  it("rejects raw percent-encoding (mobile encoding bug)", () => {
    expect(looksLikeValidTranslation("%20act %20of")).toBe(false);
  });

  it("accepts a normal translation", () => {
    expect(looksLikeValidTranslation("你好")).toBe(true);
  });
});
