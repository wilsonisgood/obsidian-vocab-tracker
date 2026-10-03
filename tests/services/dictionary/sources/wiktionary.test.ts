import { describe, expect, it } from "vitest";
import { fetchWiktionaryDefinition } from "../../../../src/services/dictionary/sources/wiktionary";
import { FakeHttpPort, jsonResponse } from "../fakeHttp";

describe("fetchWiktionaryDefinition", () => {
  it("strips HTML tags and lowercases the part of speech", async () => {
    const http = new FakeHttpPort(() =>
      jsonResponse(200, {
        en: [{ partOfSpeech: "Noun", definitions: [{ definition: "a <i>test</i> thing" }] }],
      })
    );
    expect(await fetchWiktionaryDefinition(http, "test")).toEqual({
      definition: "a test thing",
      partOfSpeech: "noun",
    });
  });

  it("throws a not-found error on 404", async () => {
    const http = new FakeHttpPort(() => jsonResponse(404, {}));
    await expect(fetchWiktionaryDefinition(http, "zzz")).rejects.toThrow(/not found/);
  });

  it("throws a not-found error when no entry has a definition", async () => {
    const http = new FakeHttpPort(() => jsonResponse(200, { en: [{ partOfSpeech: "noun", definitions: [] }] }));
    await expect(fetchWiktionaryDefinition(http, "zzz")).rejects.toThrow(/not found/);
  });

  it("throws on other HTTP errors", async () => {
    const http = new FakeHttpPort(() => jsonResponse(500, {}));
    await expect(fetchWiktionaryDefinition(http, "test")).rejects.toThrow(/HTTP 500/);
  });
});
