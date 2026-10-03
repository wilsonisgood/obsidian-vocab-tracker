import { describe, expect, it } from "vitest";
import { translateWithGoogle } from "../../../../src/services/dictionary/translate/google";
import { FakeHttpPort, jsonResponse } from "../fakeHttp";

describe("translateWithGoogle", () => {
  it("joins segments from a successful response", async () => {
    const http = new FakeHttpPort(() => jsonResponse(200, [[["你好", "hello"]]]));
    expect(await translateWithGoogle(http, "hello")).toBe("你好");
  });

  it("throws when the HTTP status isn't 200", async () => {
    const http = new FakeHttpPort(() => jsonResponse(500, {}));
    await expect(translateWithGoogle(http, "hello")).rejects.toThrow(/HTTP 500/);
  });

  it("throws when the translation looks corrupted", async () => {
    const http = new FakeHttpPort(() => jsonResponse(200, [[["%20act", "hello"]]]));
    await expect(translateWithGoogle(http, "hello")).rejects.toThrow(/corrupted/);
  });

  it("wraps a transport failure", async () => {
    const http = new FakeHttpPort(() => {
      throw new Error("network down");
    });
    await expect(translateWithGoogle(http, "hello")).rejects.toThrow(/Google Translate request failed/);
  });
});
