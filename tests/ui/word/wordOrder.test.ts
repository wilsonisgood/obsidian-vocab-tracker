import { afterEach, describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { setLocale } from "../../../src/core/i18n";
import {
  displayDate,
  displayStamp,
  entryDates,
  entryRecency,
  groupEntries,
  groupOf,
  noteTitle,
  sortByRecent,
  stampMs,
} from "../../../src/ui/word/wordOrder";
import { lt, PENDING_STRINGS } from "../../../src/ui/word/pendingStrings";

function entry(id: string, over: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id,
    word: id,
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
    ...over,
  };
}

const ids = (list: VocabEntry[]) => list.map((e) => e.id);

describe("stampMs", () => {
  it("reads ISO and the local nowStamp format", () => {
    expect(stampMs("2026-10-05T09:00:00.000Z")).toBe(Date.UTC(2026, 9, 5, 9));
    expect(stampMs("2026-07-25 14:03:11")).toBe(new Date(2026, 6, 25, 14, 3, 11).getTime());
    expect(stampMs("2026-07-25")).toBe(new Date(2026, 6, 25).getTime());
  });

  it("is NaN for missing or unreadable values", () => {
    expect(stampMs(undefined)).toBeNaN();
    expect(stampMs("")).toBeNaN();
    expect(stampMs("someday")).toBeNaN();
  });
});

describe("entryRecency / sortByRecent (1005 回饋 1)", () => {
  it("uses updatedAt, then createdAt, then added", () => {
    expect(entryRecency(entry("a", { updatedAt: "2026-10-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" }))).toBe(
      Date.UTC(2026, 9, 1)
    );
    expect(entryRecency(entry("b", { createdAt: "2026-01-01T00:00:00Z", added: "2025-01-01 00:00:00" }))).toBe(
      Date.UTC(2026, 0, 1)
    );
    expect(entryRecency(entry("c", { added: "2025-01-01 00:00:00" }))).toBe(new Date(2025, 0, 1).getTime());
    expect(entryRecency(entry("d"))).toBe(0);
  });

  it("puts the most recently changed word first", () => {
    const list = [
      entry("old", { added: "2025-01-01 10:00:00" }),
      entry("edited", { createdAt: "2025-02-01T00:00:00Z", updatedAt: "2026-10-05T08:00:00Z" }),
      entry("new", { createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(ids(sortByRecent(list))).toEqual(["edited", "new", "old"]);
  });

  it("breaks ties by the newer word, then keeps list order", () => {
    const same = "2026-03-01T00:00:00Z"; // e.g. every word stamped by a migration
    const list = [
      entry("a", { updatedAt: same, added: "2025-01-01 00:00:00" }),
      entry("b", { updatedAt: same, added: "2025-06-01 00:00:00" }),
      entry("c", { updatedAt: same, added: "2025-06-01 00:00:00" }),
    ];
    expect(ids(sortByRecent(list))).toEqual(["b", "c", "a"]);
  });

  it("does not mutate its input", () => {
    const list = [entry("a", { updatedAt: "2026-01-01T00:00:00Z" }), entry("b", { updatedAt: "2026-02-01T00:00:00Z" })];
    sortByRecent(list);
    expect(ids(list)).toEqual(["a", "b"]);
  });
});

describe("groupOf (1005 回饋 13)", () => {
  it("groups by the source note first", () => {
    expect(groupOf(entry("a", { source: { path: "eng/Talk.md", line: 3 }, origin: "wordlist" }))).toEqual({
      key: "note:eng/Talk.md",
      kind: "note",
      path: "eng/Talk.md",
    });
  });

  it("words from no note go by origin", () => {
    expect(groupOf(entry("a", { origin: "family:fam-1" }))).toEqual({ key: "family:fam-1", kind: "family", familyId: "fam-1" });
    expect(groupOf(entry("b", { origin: "wordlist" }))).toEqual({ key: "wordlist", kind: "wordlist" });
    expect(groupOf(entry("c"))).toEqual({ key: "none", kind: "none" });
  });

  it("noteTitle is the file name without .md", () => {
    expect(noteTitle("eng/sub/Taylor_Swift.md")).toBe("Taylor_Swift");
  });
});

describe("groupEntries", () => {
  const list = [
    entry("a1", { source: { path: "A.md", line: 0 }, updatedAt: "2026-01-01T00:00:00Z" }),
    entry("b1", { source: { path: "B.md", line: 0 }, updatedAt: "2026-03-01T00:00:00Z" }),
    entry("a2", { source: { path: "A.md", line: 1 }, updatedAt: "2026-05-01T00:00:00Z" }),
    entry("f1", { origin: "family:x", updatedAt: "2026-02-01T00:00:00Z" }),
    entry("f2", { origin: "family:y", updatedAt: "2026-04-01T00:00:00Z" }),
  ];

  it("recent: groups by their latest change, words inside most recent first", () => {
    const groups = groupEntries(list, "recent");
    expect(groups.map((g) => g.key)).toEqual(["note:A.md", "family:y", "note:B.md", "family:x"]);
    expect(ids(groups[0].entries)).toEqual(["a2", "a1"]);
    expect(groups[0].latest).toBe(Date.UTC(2026, 4, 1));
  });

  it("title: groups A→Z by title, words in list order (the dashboard)", () => {
    const title = (g: { key: string }) => g.key.replace(/^note:/, "");
    const groups = groupEntries(list, "title", title);
    expect(groups.map((g) => g.key)).toEqual(["note:A.md", "note:B.md", "family:x", "family:y"]);
    expect(ids(groups[0].entries)).toEqual(["a1", "a2"]);
  });
});

describe("card dates (1005 回饋 14)", () => {
  it("formats like the card's existing 加入時間", () => {
    const iso = new Date(2026, 9, 5, 9, 7, 3).toISOString();
    expect(displayStamp(iso)).toBe("2026-10-05 09:07:03");
    expect(displayStamp("2026-07-25 14:03:11")).toBe("2026-07-25 14:03:11");
    expect(displayDate(iso)).toBe("2026-10-05");
    // Unreadable legacy values are shown as they are.
    expect(displayStamp("July 25")).toBe("July 25");
  });

  it("added falls back to createdAt; updated is empty when unknown", () => {
    expect(entryDates(entry("a", { added: "2026-07-25 14:03:11", updatedAt: "2026-10-05T01:00:00Z" }))).toEqual({
      added: "2026-07-25 14:03:11",
      updated: "2026-10-05T01:00:00Z",
    });
    expect(entryDates(entry("b", { createdAt: "2026-07-25T00:00:00Z" }))).toEqual({ added: "2026-07-25T00:00:00Z", updated: "" });
  });
});

describe("pending strings", () => {
  afterEach(() => setLocale("en"));

  it("has both languages for every key, with the same placeholders", () => {
    for (const [key, v] of Object.entries(PENDING_STRINGS)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(v.en, key).toBeTruthy();
      expect(v["zh-TW"], key).toBeTruthy();
      expect(ph(v.en), key).toEqual(ph(v["zh-TW"]));
    }
  });

  it("follows the active locale", () => {
    setLocale("zh-TW");
    expect(lt("sidebar.group.family", { name: "服裝" })).toBe("字族樹：服裝");
    setLocale("en");
    expect(lt("sidebar.group.wordlist")).toBe("Exam word lists");
  });
});
