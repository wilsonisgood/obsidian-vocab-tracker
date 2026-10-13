import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../../src/core/i18n";
import type { PolySense } from "../../../../src/core/model/poly";
import {
  buildMixRequest,
  categoryOfTag,
  emptyTally,
  mixFocusIds,
  mixSummary,
  parseMixFilter,
  recordAnswer,
  tallyText,
  valueToMixFilter,
  type MixSources,
} from "../../../../src/ui/blocks/practice/mixTabModel";

beforeEach(() => setLocale("zh-TW"));

const sense = (id: string): PolySense => ({ id, word: id.split(".")[0], zh: "x", example: "e", cue: "c", level: 1 });
const vocab = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, word: `w${i}`, zh: "字", pos: "n." }));
const src = (over: Partial<MixSources> = {}): MixSources => ({
  vocab: vocab(12),
  grammar: [
    { topicId: "t1", objectiveId: "a", text: "x", title: "T1", pattern: "p" },
    { topicId: "t1", objectiveId: "b", text: "x", title: "T1", pattern: "p" },
    { topicId: "t2", objectiveId: "a", text: "x", title: "T2", pattern: "p" },
    { topicId: "t3", objectiveId: "a", text: "x", title: "T3", pattern: "p" },
  ],
  poly: { tested: [sense("get.arrive"), sense("of.part")], reference: [sense("get.obtain")] },
  ...over,
});
const all = parseMixFilter(undefined);

describe("filter", () => {
  it("defaults to everything, keeps a stored empty list", () => {
    expect(all.include).toEqual(["vocab", "grammar", "poly"]);
    expect(parseMixFilter({ include: [] }).include).toEqual([]);
    expect(valueToMixFilter({}).include).toEqual([]);
    expect(parseMixFilter({ include: ["poly", "junk"] }).include).toEqual(["poly"]);
  });
});

describe("mixSummary", () => {
  it("lists each category", () => {
    expect(mixSummary(all, src())).toBe("單字 12 字 · 文法 3 個主題 · 常用字 get, of");
  });
  it("marks empty ones and skips unticked", () => {
    expect(mixSummary(all, src({ vocab: [] }))).toBe("單字（未設定） · 文法 3 個主題 · 常用字 get, of");
    expect(mixSummary({ include: ["poly"] }, src())).toBe("常用字 get, of");
  });
});

describe("buildMixRequest", () => {
  it("skips empty and unticked categories", () => {
    const r = buildMixRequest(all, src({ grammar: [] }));
    expect(r).toMatchObject({ track: "mix" });
    expect(r && "grammar" in r).toBe(false);
    expect(buildMixRequest({ include: ["vocab"] }, src())).toEqual({ track: "mix", vocab: vocab(12) });
  });
  it("null when nothing is left", () => {
    expect(buildMixRequest({ include: [] }, src())).toBeNull();
    expect(buildMixRequest({ include: ["vocab"] }, src({ vocab: [] }))).toBeNull();
  });
  it("focus ids cover tested senses, not reference", () => {
    const ids = mixFocusIds(buildMixRequest(all, src()));
    expect(ids.has("v0")).toBe(true);
    expect(ids.has("t1/a")).toBe(true);
    expect(ids.has("get.arrive")).toBe(true);
    expect(ids.has("get.obtain")).toBe(false);
    expect(mixFocusIds(null).size).toBe(0);
  });
});

describe("tally", () => {
  it("splits by tag prefix; hinted right is not clean", () => {
    const t = emptyTally();
    recordAnswer(t, "單字 · reluctant", true, false);
    recordAnswer(t, "單字 · apron", false, false);
    recordAnswer(t, "文法 · 現在完成式", true, true);
    recordAnswer(t, "常用字 · get", true, false);
    recordAnswer(t, "其他", true, false);
    expect(tallyText(t)).toBe("單字 1/2 · 文法 0/1 · 常用字 1/1");
    expect(categoryOfTag("文法")).toBe("grammar");
    expect(categoryOfTag(undefined)).toBeNull();
    expect(tallyText(emptyTally())).toBe("");
  });
});
