import { describe, expect, it } from "vitest";
import { DictionaryService } from "../../../src/services/dictionary/DictionaryService";
import { FakeHttpPort, jsonResponse } from "./fakeHttp";

describe("DictionaryService.fetchDictionary", () => {
  it("combines Wiktionary, Google Translate and Datamuse synonyms/antonyms", async () => {
    const http = new FakeHttpPort((url) => {
      if (url.includes("wiktionary.org")) {
        return jsonResponse(200, {
          en: [{ partOfSpeech: "Noun", definitions: [{ definition: "a test thing" }] }],
        });
      }
      if (url.includes("translate.googleapis.com")) {
        return jsonResponse(200, [[["測試", "a test thing"]]]);
      }
      if (url.includes("rel_syn")) return jsonResponse(200, [{ word: "exam" }]);
      if (url.includes("rel_ant")) return jsonResponse(200, [{ word: "disorder" }]);
      throw new Error(`unexpected url: ${url}`);
    });

    const dict = new DictionaryService(http);
    expect(await dict.fetchDictionary("Test")).toEqual({
      phonetic: "",
      audio: "",
      partOfSpeech: "noun",
      definition: "a test thing",
      definitionZh: "測試",
      synonyms: ["exam"],
      antonyms: ["disorder"],
    });
  });

  it("falls back to Datamuse definition and MyMemory translation when the primaries fail", async () => {
    const http = new FakeHttpPort((url) => {
      if (url.includes("wiktionary.org")) return jsonResponse(404, {});
      if (url.includes("api.datamuse.com") && url.includes("md=d")) {
        return jsonResponse(200, [{ defs: ["n\tfallback definition"] }]);
      }
      if (url.includes("translate.googleapis.com")) return jsonResponse(500, {});
      if (url.includes("mymemory.translated.net")) {
        return jsonResponse(200, { responseData: { translatedText: "備用翻譯" } });
      }
      if (url.includes("rel_syn") || url.includes("rel_ant")) return jsonResponse(200, []);
      throw new Error(`unexpected url: ${url}`);
    });

    const dict = new DictionaryService(http);
    const result = await dict.fetchDictionary("test");
    expect(result.definition).toBe("fallback definition");
    expect(result.partOfSpeech).toBe("noun");
    expect(result.definitionZh).toBe("備用翻譯");
  });

  it("throws combining both errors when Wiktionary and Datamuse both fail", async () => {
    const http = new FakeHttpPort((url) => {
      if (url.includes("wiktionary.org")) return jsonResponse(404, {});
      if (url.includes("api.datamuse.com") && url.includes("md=d")) return jsonResponse(200, [{ defs: [] }]);
      return jsonResponse(200, []);
    });

    const dict = new DictionaryService(http);
    await expect(dict.fetchDictionary("zzz")).rejects.toThrow(/fallback also failed/);
  });
});

describe("DictionaryService.translateToZhTW", () => {
  it("returns '' for empty input without making a request", async () => {
    const http = new FakeHttpPort(() => {
      throw new Error("should not be called");
    });
    const dict = new DictionaryService(http);
    expect(await dict.translateToZhTW("")).toBe("");
  });

  it("returns '' when both providers fail", async () => {
    const http = new FakeHttpPort(() => jsonResponse(500, {}));
    const dict = new DictionaryService(http);
    expect(await dict.translateToZhTW("hello")).toBe("");
  });
});
