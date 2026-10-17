import { describe, expect, it } from "vitest";
import { DictionaryService } from "../../../src/services/dictionary/DictionaryService";
import { FakeHttpPort, jsonResponse } from "./fakeHttp";
import { dictionaryErrorKind } from "../../../src/services/dictionary/errors";

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
      formOf: "",
      sensesZh: "",
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

describe("DictionaryService word-first translation (1010-2)", () => {
  function httpFor(wordZh: string) {
    return new FakeHttpPort((url) => {
      if (url.includes("wiktionary.org")) {
        return jsonResponse(200, { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "a long gloss" }] }] });
      }
      if (url.includes("translate.googleapis.com")) {
        return url.includes("q=attic") ? jsonResponse(200, [[[wordZh, "attic"]]]) : jsonResponse(200, [[["長定義", "a long gloss"]]]);
      }
      return jsonResponse(200, []);
    });
  }
  it("uses the word's own translation as definitionZh", async () => {
    expect((await new DictionaryService(httpFor("閣樓")).fetchDictionary("attic")).definitionZh).toBe("閣樓");
  });
  it("falls back to translating the definition when Google echoes the word", async () => {
    expect((await new DictionaryService(httpFor("Attic")).fetchDictionary("attic")).definitionZh).toBe("長定義");
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

// 1017: an iPhone on a Wi-Fi that intercepts HTTPS — neither source answers.
describe("DictionaryService error kinds", () => {
  const fetchKind = async (router: (url: string) => ReturnType<typeof jsonResponse>) => {
    try {
      await new DictionaryService(new FakeHttpPort(router)).fetchDictionary("impatiently");
      return "ok";
    } catch (e) {
      return dictionaryErrorKind(e);
    }
  };

  it("is 'network' when neither dictionary could be reached", async () => {
    expect(
      await fetchKind((url) => {
        if (url.includes("wiktionary.org") || url.includes("md=d")) throw new Error("Request failed. TLS錯誤導致安全連線失敗。");
        return jsonResponse(200, []);
      })
    ).toBe("network");
  });

  it("is 'notFound' when a dictionary answered without the word", async () => {
    expect(
      await fetchKind((url) => {
        if (url.includes("wiktionary.org")) throw new Error("TLS");
        return jsonResponse(200, []);
      })
    ).toBe("notFound");
  });

  it("is 'other' for a server error", async () => {
    expect(await fetchKind(() => jsonResponse(500, {}))).toBe("other");
  });
});
