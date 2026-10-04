import { describe, expect, it } from "vitest";
import { en } from "../../../src/core/i18n/en";
import { zhTW } from "../../../src/core/i18n/zh-TW";
import { AI_ERROR_CODES, classifyHttpError, errorBodyMessage, parseRetryAfter } from "../../../src/services/ai/errors";

describe("AiError i18n", () => {
  it("has a message for every error code in both locales", () => {
    for (const code of AI_ERROR_CODES) {
      const key = `ai.error.${code}` as keyof typeof en;
      expect(en[key], code).toBeTruthy();
      expect(zhTW[key], code).toBeTruthy();
    }
  });

  it("uses the design's offline copy (D7)", () => {
    expect(zhTW["ai.gate.offline"]).toBe("目前離線。之前的討論可以看，連線後才能繼續問。");
    expect(zhTW["ai.gate.noKey.title"]).toBe("設定 AI 後才能討論");
  });
});

describe("error helpers", () => {
  it("parses retry-after seconds and HTTP dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter("Sun, 04 Oct 2026 00:00:10 GMT", Date.parse("Sun, 04 Oct 2026 00:00:00 GMT"))).toBe(10_000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });

  it("extracts messages from Anthropic, OpenAI, Ollama and plain bodies", () => {
    expect(errorBodyMessage('{"type":"error","error":{"type":"x","message":"a"}}')).toBe("a");
    expect(errorBodyMessage('{"error":{"message":"b","code":"c"}}')).toBe("b");
    expect(errorBodyMessage('{"error":"c"}')).toBe("c");
    expect(errorBodyMessage("<html>502</html>")).toBe("<html>502</html>");
  });

  it("classifies 5xx as overloaded (retryable) and 403 as auth", () => {
    expect(classifyHttpError(502, "")).toMatchObject({ code: "overloaded", retryable: true });
    expect(classifyHttpError(403, "")).toMatchObject({ code: "auth", retryable: false });
  });
});
