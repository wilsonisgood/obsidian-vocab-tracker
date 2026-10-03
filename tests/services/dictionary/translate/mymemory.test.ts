import { describe, expect, it } from "vitest";
import { translateWithMyMemory } from "../../../../src/services/dictionary/translate/mymemory";
import { FakeHttpPort, jsonResponse } from "../fakeHttp";

describe("translateWithMyMemory", () => {
  it("returns the translated text from a successful response", async () => {
    const http = new FakeHttpPort(() => jsonResponse(200, { responseData: { translatedText: "你好" } }));
    expect(await translateWithMyMemory(http, "hello")).toBe("你好");
  });

  it("throws when the HTTP status isn't 200", async () => {
    const http = new FakeHttpPort(() => jsonResponse(503, {}));
    await expect(translateWithMyMemory(http, "hello")).rejects.toThrow(/HTTP 503/);
  });

  it("throws when the translation looks corrupted", async () => {
    const http = new FakeHttpPort(() => jsonResponse(200, { responseData: { translatedText: "%20act" } }));
    await expect(translateWithMyMemory(http, "hello")).rejects.toThrow(/corrupted/);
  });

  it("wraps a transport failure", async () => {
    const http = new FakeHttpPort(() => {
      throw new Error("network down");
    });
    await expect(translateWithMyMemory(http, "hello")).rejects.toThrow(/MyMemory request failed/);
  });
});
