import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLocale, setLocale, type Locale } from "../../../src/core/i18n";
import type { UsageBlock } from "../../../src/core/model/usage";
import {
  filterVerbs,
  noteName,
  parseVerbsParams,
  phoneticLine,
  pickVerb,
  shortDate,
  usageDates,
  usageMeta,
  usageRows,
} from "../../../src/ui/blocks/verbsModel";
import { entry } from "../../services/learn/fakes";

const usage: UsageBlock = {
  patterns: [
    { pattern: "sugarcoat + 名詞", meaningZh: "把壞消息說得好聽", example: "I won't sugarcoat the results." },
    { pattern: " ", meaningZh: "", example: "" },
  ],
  related: [
    { phrase: "gloss over", zh: "輕描淡寫帶過" },
    { phrase: "", zh: "空的" },
  ],
  generatedAt: "2026-10-02T09:00:00",
  model: "claude-sonnet-5",
};

describe("parseVerbsParams", () => {
  it("reads word (or verb)", () => {
    expect(parseVerbsParams("word: sugarcoat")).toEqual({ word: "sugarcoat" });
    expect(parseVerbsParams("verb: 'toil'")).toEqual({ word: "toil" });
    expect(parseVerbsParams("")).toEqual({});
  });
});

describe("filterVerbs", () => {
  const verbs = [entry("1", "sugarcoat", { definitionZh: "粉飾" }), entry("2", "toil", { definitionZh: "辛勞" })];

  it("matches the word or the Chinese gloss", () => {
    expect(filterVerbs(verbs, "SUGAR").map((e) => e.id)).toEqual(["1"]);
    expect(filterVerbs(verbs, "辛").map((e) => e.id)).toEqual(["2"]);
    expect(filterVerbs(verbs, "  ").map((e) => e.id)).toEqual(["1", "2"]);
    expect(filterVerbs(verbs, "zzz")).toEqual([]);
  });
});

describe("pickVerb", () => {
  const verbs = [entry("1", "expel"), entry("2", "sugarcoat", { usage }), entry("3", "toil")];

  it("keeps the selection, else opens the first verb with usage, else the first", () => {
    expect(pickVerb(verbs, "3")).toBe("3");
    expect(pickVerb(verbs, "gone")).toBe("2");
    expect(pickVerb([entry("1", "expel")], undefined)).toBe("1");
    expect(pickVerb([], "1")).toBeUndefined();
  });
});

describe("meta line", () => {
  it("names the note without folder or extension", () => {
    expect(noteName("eng/Cadence_Gao_School_Speech_Transcript.md")).toBe("Cadence_Gao_School_Speech_Transcript");
    expect(noteName("Note.MD")).toBe("Note");
    expect(noteName(undefined)).toBeUndefined();
  });

  it("formats dates as MM/DD and ignores bad stamps", () => {
    expect(shortDate("2026-10-02T09:00:00")).toBe("10/02");
    expect(shortDate("not a date")).toBeUndefined();
    expect(shortDate(undefined)).toBeUndefined();
  });

  it("builds 「出自 … · MM/DD 由 AI 產生」 parts", () => {
    const e = entry("1", "sugarcoat", { source: { path: "eng/Talk.md", line: 3 } });
    expect(usageMeta(e, usage)).toEqual({ source: "Talk", date: "10/02" });
    expect(usageMeta(entry("2", "toil"), undefined)).toEqual({});
  });

  it("wraps the phonetic in slashes and adds the part of speech", () => {
    expect(phoneticLine({ phonetic: "ˈʃʊɡ.ə.kəʊt", partOfSpeech: "verb" })).toBe("/ˈʃʊɡ.ə.kəʊt/ · verb");
    expect(phoneticLine({ phonetic: "/tɔɪl/", partOfSpeech: "" })).toBe("/tɔɪl/");
    expect(phoneticLine({ phonetic: "", partOfSpeech: "verb" })).toBe("verb");
  });
});

describe("usageRows", () => {
  it("drops empty patterns and related phrases", () => {
    const rows = usageRows(usage);
    expect(rows.patterns.map((p) => p.pattern)).toEqual(["sugarcoat + 名詞"]);
    expect(rows.related.map((r) => r.phrase)).toEqual(["gloss over"]);
  });

  it("tolerates missing arrays from older output", () => {
    const partial = { generatedAt: "", model: "" } as unknown as UsageBlock;
    expect(usageRows(partial)).toEqual({ patterns: [], related: [] });
  });
});

describe("usageDates (1005 #14)", () => {
  let previous: Locale;
  beforeAll(() => {
    previous = getLocale();
    setLocale("zh-TW");
  });
  afterAll(() => setLocale(previous));
  const NOW = new Date(2026, 9, 5, 12);
  const at = (d: number) => new Date(2026, 9, d, 12).toISOString();
  it("reads 加入 (first generation) and 更新 (latest 重新產生)", () => {
    expect(usageDates({ createdAt: at(2), generatedAt: at(5) }, NOW)).toBe("加入 10/02 · 更新 10/05");
    expect(usageDates({ createdAt: at(2), generatedAt: at(2) }, NOW)).toBe("加入 10/02");
    // Older blocks without createdAt.
    expect(usageDates({ generatedAt: at(4) }, NOW)).toBe("加入 10/04");
    expect(usageDates(undefined, NOW)).toBe("");
  });
});
