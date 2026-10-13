import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { DictionaryService } from "../../../src/services/dictionary/DictionaryService";
import { refreshStaleDictionary } from "../../../src/services/dictionary/refresh";
import { formatSensesZh } from "../../../src/services/dictionary/translate/google";
import { FakeHttpPort, jsonResponse } from "./fakeHttp";

const formHtml = (lead: string, base: string) =>
  `<span class="form-of-definition use-with-mention"><a href="/wiki/${lead}">${lead}</a> of <span class="form-of-definition-link"><i class="Latn mention"><a rel="mw:WikiLink" href="/wiki/${base}#English" title="${base}">${base}</a></i></span></span>`;

function http(opts: { stressesSenses?: unknown } = {}) {
  return new FakeHttpPort((url) => {
    if (url.includes("wiktionary.org") && url.endsWith("/stresses")) {
      return jsonResponse(200, { en: [{ partOfSpeech: "Noun", definitions: [{ definition: formHtml("plural", "stress") }] }] });
    }
    if (url.includes("wiktionary.org") && url.endsWith("/stress")) {
      return jsonResponse(200, { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "Emphasis placed on a word." }] }] });
    }
    if (url.includes("wiktionary.org") && url.endsWith("/scudded")) {
      return jsonResponse(200, { en: [{ partOfSpeech: "Verb", definitions: [{ definition: formHtml("simple past", "scud") }] }] });
    }
    if (url.includes("wiktionary.org")) return jsonResponse(404, {});
    if (url.includes("translate.googleapis.com")) {
      const q = decodeURIComponent(url.split("&q=")[1]);
      if (q === "stresses") return jsonResponse(200, [[["壓力", "stresses"]], opts.stressesSenses ?? [["noun", ["壓力", "應力", "重音", "多餘"], []], ["verb", ["強調"], []]]]);
      if (q === "scudded") return jsonResponse(200, [[["疾行", "scudded"]], null]);
      return jsonResponse(200, [[["翻:" + q, q]]]);
    }
    return jsonResponse(200, []);
  });
}

describe("form-of lookup (A1)", () => {
  it("defines the lemma and keeps the form-of sentence as formOf", async () => {
    const r = await new DictionaryService(http()).fetchDictionary("stresses");
    expect(r.definition).toBe("Emphasis placed on a word.");
    expect(r.formOf).toBe("plural of stress");
    expect(r.partOfSpeech).toBe("noun");
  });

  it("keeps the sentence and leaves formOf empty when the lemma can't be found", async () => {
    const r = await new DictionaryService(http()).fetchDictionary("scudded");
    expect(r.definition).toBe("simple past of scud");
    expect(r.formOf).toBe("");
  });
});

describe("sensesZh (A2)", () => {
  it("formats up to 3 per POS with abbreviations", async () => {
    const r = await new DictionaryService(http()).fetchDictionary("stresses");
    expect(r.sensesZh).toBe("n. 壓力、應力、重音；v. 強調");
    expect(r.definitionZh).toBe("壓力");
  });
  it("is '' when data[1] is null, and unknown POS passes through", async () => {
    expect((await new DictionaryService(http()).fetchDictionary("scudded")).sensesZh).toBe("");
    expect(formatSensesZh([["phrase", ["a"]], ["adjective", ["b"]]])).toBe("phrase a；adj. b");
    expect(formatSensesZh(undefined)).toBe("");
  });
  it("is '' on the MyMemory fallback", async () => {
    const h = new FakeHttpPort((url) => {
      if (url.includes("wiktionary.org")) return jsonResponse(200, { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "a thing" }] }] });
      if (url.includes("translate.googleapis.com")) return jsonResponse(500, {});
      if (url.includes("mymemory")) return jsonResponse(200, { responseData: { translatedText: "東西" } });
      return jsonResponse(200, []);
    });
    const r = await new DictionaryService(h).fetchDictionary("thing");
    expect(r.definitionZh).toBe("東西");
    expect(r.sensesZh).toBe("");
  });
});

describe("refreshStaleDictionary (A3)", () => {
  const entry = (f: Partial<VocabEntry>) => ({ word: "stresses", definition: "", definitionZh: "", ...f }) as VocabEntry;
  const dict = new DictionaryService(http());

  it("overwrites machine-made gloss and form-of definition, fills formOf/sensesZh", async () => {
    const e = entry({ definition: "plural of stress", definitionZh: "翻:plural of stress" });
    expect(await refreshStaleDictionary(e, dict)).toBe(true);
    expect(e.definition).toBe("Emphasis placed on a word.");
    expect(e.definitionZh).toBe("壓力");
    expect(e.formOf).toBe("plural of stress");
    expect(e.sensesZh).toBe("n. 壓力、應力、重音；v. 強調");
  });

  it("leaves a hand-edited definitionZh alone but still marks sensesZh", async () => {
    const e = entry({ definition: "plural of stress", definitionZh: "我自己寫的" });
    await refreshStaleDictionary(e, dict);
    expect(e.definitionZh).toBe("我自己寫的");
    expect(e.definition).toBe("Emphasis placed on a word.");
    expect(e.sensesZh).not.toBeUndefined();
  });

  it("leaves a hand-edited definition alone", async () => {
    const e = entry({ definition: "my own note", definitionZh: "翻:my own note" });
    await refreshStaleDictionary(e, dict);
    expect(e.definition).toBe("my own note");
    expect(e.formOf).toBeUndefined();
    expect(e.definitionZh).toBe("壓力");
  });

  it("returns false and changes nothing when the fetch fails", async () => {
    const e = entry({ word: "zzzz", definition: "plural of x" });
    const bad = new DictionaryService(new FakeHttpPort(() => jsonResponse(404, {})));
    expect(await refreshStaleDictionary(e, bad)).toBe(false);
    expect(e.sensesZh).toBeUndefined();
  });
});
