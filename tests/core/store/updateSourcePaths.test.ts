import { describe, expect, it } from "vitest";
import { updateSourcePaths } from "../../../src/core/store/updateSourcePaths";
import type { VocabEntry } from "../../../src/core/model/entry";

function makeEntry(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: "1",
    word: "word",
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: null,
    added: "",
    lastReviewed: "",
    reviews: 0,
    ...overrides,
  };
}

describe("updateSourcePaths", () => {
  it("updates the path on entries whose source matches exactly", () => {
    const entry = makeEntry({ source: { path: "old/note.md", line: 3 } });

    const changed = updateSourcePaths([entry], "old/note.md", "new/note.md");

    expect(entry.source).toEqual({ path: "new/note.md", line: 3 });
    expect(changed).toEqual([entry]);
  });

  it("leaves entries with a different source path untouched", () => {
    const entry = makeEntry({ source: { path: "other/note.md", line: 0 } });

    const changed = updateSourcePaths([entry], "old/note.md", "new/note.md");

    expect(entry.source).toEqual({ path: "other/note.md", line: 0 });
    expect(changed).toEqual([]);
  });

  it("leaves entries with no source untouched", () => {
    const entry = makeEntry({ source: null });
    const changed = updateSourcePaths([entry], "old/note.md", "new/note.md");
    expect(changed).toEqual([]);
  });
});
