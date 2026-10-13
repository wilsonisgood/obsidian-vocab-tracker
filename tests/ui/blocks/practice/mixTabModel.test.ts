import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../../src/core/i18n";
import type { PolySense } from "../../../../src/core/model/poly";
import {
  buildMixRequest,
  categoryOfTag,
  emptyTally,
  mixFocusIds,
  parseMixFilter,
  recordAnswer,
  tallyText,
  mixTags,
  toggleMixCategory,
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
    expect(parseMixFilter({ include: ["poly", "junk"] }).include).toEqual(["poly"]);
  });
});

describe("mixTags", () => {
  it("counts each category and marks included ones", () => {
    const tags = mixTags(all, src());
    expect(tags.map((x) => x.label)).toEqual(["單字 12", "文法 3", "常用字 2"]);
    expect(tags.every((x) => x.on && !x.disabled)).toBe(true);
  });
  it("empty category is disabled and never on; unticked is off", () => {
    const tags = mixTags({ include: ["vocab", "grammar", "poly"] }, src({ vocab: [] }));
    expect(tags[0]).toMatchObject({ label: "單字 0", disabled: true, on: false });
    expect(mixTags({ include: ["poly"] }, src())[0].on).toBe(false);
  });
  it("toggle flips inclusion, keeps order", () => {
    expect(toggleMixCategory(all, "grammar").include).toEqual(["vocab", "poly"]);
    expect(toggleMixCategory({ include: ["poly"] }, "vocab").include).toEqual(["vocab", "poly"]);
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

describe("mixFocusIds vocabScope (第十八波 T)", () => {
  it("uses the whole matching set for vocab instead of the words sent", () => {
    const req = { track: "mix", vocab: [{ id: "a", word: "a", zh: "甲", pos: "n." }] } as const;
    expect([...mixFocusIds(req as never, new Set(["a", "b", "c"]))].sort()).toEqual(["a", "b", "c"]);
    expect([...mixFocusIds(req as never)]).toEqual(["a"]);
  });
});
