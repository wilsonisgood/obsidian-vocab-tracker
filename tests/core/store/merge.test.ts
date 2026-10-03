import { describe, expect, it } from "vitest";
import { merge } from "../../../src/core/store/merge";
import type { VocabData, VocabEntry } from "../../../src/core/model/entry";

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
    updatedAt: "2026-01-01T00:00:00.000Z",
    rev: 0,
    ...overrides,
  };
}

function data(entries: VocabEntry[]): VocabData {
  return { schemaVersion: 2, settings: { schemaVersion: 2 }, entries };
}

describe("merge", () => {
  it("unions entries added independently on each device", () => {
    const local = data([makeEntry({ id: "mac-word" })]);
    const remote = data([makeEntry({ id: "iphone-word" })]);

    const result = merge(local, remote);

    expect(result.entries.map((e) => e.id).sort()).toEqual(["iphone-word", "mac-word"]);
  });

  it("picks the entry with the newer updatedAt when both sides edited the same id", () => {
    const older = makeEntry({ id: "1", word: "old-edit", updatedAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeEntry({ id: "1", word: "new-edit", updatedAt: "2026-01-02T00:00:00.000Z" });

    expect(merge(data([older]), data([newer])).entries).toEqual([newer]);
    // Order of local/remote shouldn't matter.
    expect(merge(data([newer]), data([older])).entries).toEqual([newer]);
  });

  it("breaks a tie on identical updatedAt using the higher rev", () => {
    const sameTime = "2026-01-01T00:00:00.000Z";
    const lowRev = makeEntry({ id: "1", word: "low-rev", updatedAt: sameTime, rev: 1 });
    const highRev = makeEntry({ id: "1", word: "high-rev", updatedAt: sameTime, rev: 2 });

    expect(merge(data([lowRev]), data([highRev])).entries).toEqual([highRev]);
  });

  it("resolves a delete racing an edit by recency, not by delete always winning", () => {
    const edited = makeEntry({ id: "1", word: "edited", updatedAt: "2026-01-02T00:00:00.000Z" });
    const deleted = makeEntry({
      id: "1",
      word: "edited",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: "2026-01-01T00:00:00.000Z",
    });

    // The edit happened after the delete → edit should win (resurrected).
    expect(merge(data([edited]), data([deleted])).entries[0].deletedAt).toBeUndefined();

    // The delete happened after the edit → delete should win.
    const laterDelete = {
      ...deleted,
      updatedAt: "2026-01-03T00:00:00.000Z",
      deletedAt: "2026-01-03T00:00:00.000Z",
    };
    expect(merge(data([edited]), data([laterDelete])).entries[0].deletedAt).toBe(
      "2026-01-03T00:00:00.000Z"
    );
  });

  it("treats a missing updatedAt as older than any stamped entry", () => {
    const unstamped = makeEntry({ id: "1", word: "unstamped", updatedAt: undefined });
    const stamped = makeEntry({ id: "1", word: "stamped", updatedAt: "2026-01-01T00:00:00.000Z" });

    expect(merge(data([unstamped]), data([stamped])).entries).toEqual([stamped]);
    expect(merge(data([stamped]), data([unstamped])).entries).toEqual([stamped]);
  });

  it("preserves local's ordering and appends remote-only entries after", () => {
    const a = makeEntry({ id: "a" });
    const b = makeEntry({ id: "b" });
    const c = makeEntry({ id: "c" });

    const result = merge(data([a, b]), data([c]));

    expect(result.entries.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});
