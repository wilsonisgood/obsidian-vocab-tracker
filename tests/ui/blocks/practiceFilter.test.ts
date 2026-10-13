import { describe, expect, it } from "vitest";
import { setLocale } from "../../../src/core/i18n";
import type { VocabEntry } from "../../../src/core/model/entry";
import {
  hasSelection,
  parseFilterValue,
  pruneValue,
  toggleOption,
  type FilterGroup,
} from "../../../src/ui/blocks/practice/filterBarModel";
import { pickTab, rememberedTab } from "../../../src/ui/blocks/practice/practiceModel";
import {
  collectVocabOptions,
  firstFolder,
  toQueueFilter,
  vocabGroups,
  vocabQuickPicks,
  vocabSummary,
} from "../../../src/ui/blocks/practice/vocabFilterModel";

const e = (o: Partial<VocabEntry>): VocabEntry =>
  ({ id: "x", word: "w", liked: true, level: "", partOfSpeech: "", source: null, ...o }) as VocabEntry;

describe("collectVocabOptions", () => {
  const entries = [
    e({ level: "多益中級, 托福高級", partOfSpeech: "noun", source: { path: "eng/a/x.md" } as never }),
    e({ level: "多益中級", partOfSpeech: "verb", source: { path: "eng/y.md" } as never }),
    e({ level: "雅思", partOfSpeech: "noun", source: { path: "news/z.md" } as never }),
    e({ level: "隱藏", liked: false }),
    e({ level: "刪除", deletedAt: "2026-01-01" } as never),
    e({ source: { path: "root.md" } as never }),
  ];
  const o = collectVocabOptions(entries);
  it("ranks by use, skipping unliked and deleted", () => {
    expect(o.levels).toEqual(["多益中級", "托福高級", "雅思"]);
    expect(o.pos).toEqual(["noun", "verb"]);
  });
  it("uses the first folder only", () => {
    expect(o.folders).toEqual(["eng/", "news/"]);
    expect(firstFolder("root.md")).toBeUndefined();
  });
});

setLocale("zh-TW"); // groups below are built at collection time

describe("filter value", () => {
  const groups = vocabGroups({ levels: ["A", "B"], pos: ["noun"], folders: ["eng/", "news/"] });
  const g = (id: string): FilterGroup => groups.find((x) => x.id === id)!;
  it("toggles multi groups and single groups", () => {
    let v = toggleOption({}, g("level"), "A");
    v = toggleOption(v, g("level"), "B");
    expect(v.level).toEqual(["A", "B"]);
    expect(toggleOption(v, g("level"), "A").level).toEqual(["B"]);
    v = toggleOption(v, g("folder"), "eng/");
    v = toggleOption(v, g("folder"), "news/");
    expect(v.folder).toEqual(["news/"]);
    expect(toggleOption(v, g("folder"), "news/").folder).toBeUndefined();
  });
  it("parses junk and prunes vanished options", () => {
    expect(parseFilterValue(undefined)).toEqual({});
    expect(parseFilterValue({ level: ["A", 3, "A"], pos: "x" })).toEqual({ level: ["A"] });
    expect(pruneValue({ level: ["A", "Z"], pos: ["verb"] }, groups)).toEqual({ level: ["A"] });
    expect(hasSelection({})).toBe(false);
  });
  it("summarizes", () => {
    expect(vocabSummary({}, groups)).toBe("到期");
    expect(vocabSummary({ status: ["new"], level: ["A", "B"], folder: ["eng/"] }, groups)).toBe("新字 · A、B · eng/");
  });
  it("maps to a queue filter", () => {
    const now = new Date("2026-10-13T00:00:00Z");
    expect(toQueueFilter({}, now)).toEqual({ status: "due" });
    expect(toQueueFilter({ status: ["all"], pos: ["noun"], folder: ["eng/"], added: ["recent"] }, now)).toEqual({
      status: "all",
      pos: ["noun"],
      source: "eng/",
      addedSince: "2026-10-06T00:00:00.000Z",
    });
  });
  it("quick picks", () => {
    const [due, recent] = vocabQuickPicks();
    expect(due.apply({ level: ["A"] })).toEqual({ status: ["due"] });
    expect(recent.apply({})).toEqual({ status: ["all"], added: ["recent"] });
  });
});

describe("tabs", () => {
  const tabs = [{ id: "vocab", label: "單字" }, { id: "grammar", label: "文法" }];
  it("picks by id or label, only registered", () => {
    expect(pickTab(tabs, "vocab")?.id).toBe("vocab");
    expect(pickTab(tabs, "文法")?.id).toBe("grammar");
    expect(pickTab(tabs, "混合")).toBeUndefined();
    expect(rememberedTab(tabs, "grammar")?.id).toBe("grammar");
    expect(rememberedTab(tabs, "mix")).toBeUndefined();
  });
});
