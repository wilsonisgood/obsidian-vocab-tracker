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
