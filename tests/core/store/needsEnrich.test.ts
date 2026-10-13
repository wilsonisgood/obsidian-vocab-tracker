import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { entriesMissingDefinition } from "../../../src/core/store/needsEnrich";

const e = (word: string, fields: Partial<VocabEntry> = {}) =>
  ({ id: word, word, definition: "", definitionZh: "", ...fields }) as VocabEntry;

describe("entriesMissingDefinition", () => {
  it("picks live entries with neither definition filled in", () => {
    const list = [
      e("empty"),
      e("blank", { definition: "  " }),
      e("en", { definition: "a thing" }),
      e("zh", { definitionZh: "東西" }),
      e("deleted", { deletedAt: "2026-10-01" }),
    ];
    expect(entriesMissingDefinition(list).map((x) => x.word)).toEqual(["empty", "blank"]);
  });
});

import { entriesNeedingRefresh, isFormOfSentence } from "../../../src/core/store/needsEnrich";

describe("isFormOfSentence / entriesNeedingRefresh (1010-2 A3)", () => {
  it("recognizes Wiktionary inflection stubs only", () => {
    expect(isFormOfSentence("plural of stress")).toBe(true);
    expect(isFormOfSentence("simple past and past participle of scud")).toBe(true);
    expect(isFormOfSentence("third-person singular simple present indicative of run")).toBe(true);
    expect(isFormOfSentence("The pressure of a crowd")).toBe(false);
    expect(isFormOfSentence("")).toBe(false);
  });

  it("picks old, un-refreshed entries that are wordy or form-of; skips marked/deleted", () => {
    const long = "這是一段超過十五個字元的很長很長的中文翻譯內容";
    const list = [
      e("wordy", { definition: "x", definitionZh: long }),
      e("form", { definition: "plural of stress", definitionZh: "壓力" }),
      e("short", { definition: "x", definitionZh: "短" }),
      e("marked", { definition: "plural of a", definitionZh: long, sensesZh: "" }),
      e("deleted", { definition: "plural of a", deletedAt: "2026-10-01" }),
    ];
    expect(entriesNeedingRefresh(list).map((x) => x.word)).toEqual(["wordy", "form"]);
  });
});
