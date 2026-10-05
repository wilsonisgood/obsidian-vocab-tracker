import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { wordThreadId, type Thread, type Turn } from "../../../src/core/model/thread";
import { discussionRows, type DiscussionSource } from "../../../src/ui/sidebar/discussionRows";

let n = 0;
function round(at: string, deleted = false): Turn[] {
  n++;
  const extra = deleted ? { deletedAt: at } : {};
  return [
    { id: `u${n}`, role: "user", content: "q", at, status: "done", ...extra },
    { id: `a${n}`, role: "assistant", content: "a", at, status: "done", ...extra },
  ];
}

function entry(id: string, word: string, over: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id,
    word,
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

function wordThread(entryId: string, turns: Turn[], over: Partial<Thread> = {}): Thread {
  return { id: wordThreadId(entryId), anchor: { kind: "word", entryId }, turns, createdAt: turns[0]?.at, ...over };
}

function paraThread(id: string, path: string, snapshot: string, turns: Turn[], over: Partial<Thread> = {}): Thread {
  return { id, anchor: { kind: "paragraph", path, hash: "h", snapshot }, turns, createdAt: turns[0]?.at, ...over };
}

function source(threads: Thread[]): DiscussionSource {
  return {
    paragraphThreads: () => threads.filter((t) => t.anchor.kind === "paragraph" && !t.deletedAt),
    wordThread: (id) => threads.find((t) => t.id === wordThreadId(id) && !t.deletedAt),
  };
}

describe("discussionRows (1005 回饋 2: AI 討論)", () => {
  const entries = [entry("e1", "glittery"), entry("e2", "leotard"), entry("e3", "elated"), entry("e4", "gone", { deletedAt: "2026-10-01T00:00:00Z" })];
  const threads = [
    wordThread("e1", [...round("2026-10-02T10:00:00Z"), ...round("2026-10-03T10:00:00Z")]),
    // Every round retried away: nothing to show.
    wordThread("e2", round("2026-10-04T10:00:00Z", true)),
    wordThread("e4", round("2026-10-05T10:00:00Z")),
    paraThread("p1", "eng/Talk.md", "Last time I was in a stadium…", round("2026-10-04T08:00:00Z")),
    paraThread("p2", "eng/Old.md", "To the honorees…", round("2026-09-01T08:00:00Z")),
    paraThread("p3", "eng/Talk.md", "deleted", round("2026-10-05T08:00:00Z"), { deletedAt: "2026-10-05T09:00:00Z" }),
  ];

  it("lists word and paragraph discussions, newest first", () => {
    const rows = discussionRows(source(threads), entries);
    expect(rows.map((r) => r.threadId)).toEqual(["p1", wordThreadId("e1"), "p2"]);
  });

  it("word rows carry the word and its entry; paragraph rows the note and text", () => {
    const rows = discussionRows(source(threads), entries);
    const word = rows.find((r) => r.kind === "word")!;
    expect(word).toMatchObject({ entryId: "e1", title: "glittery", count: 2, lastAt: "2026-10-03T10:00:00Z" });
    const para = rows.find((r) => r.threadId === "p1")!;
    expect(para).toMatchObject({ kind: "paragraph", path: "eng/Talk.md", title: "Last time I was in a stadium…", count: 1 });
  });

  it("skips deleted words, deleted threads and threads with no questions left", () => {
    const rows = discussionRows(source(threads), entries);
    expect(rows.some((r) => r.entryId === "e2" || r.entryId === "e4" || r.threadId === "p3")).toBe(false);
  });

  it("is empty with no threads", () => {
    expect(discussionRows(source([]), entries)).toEqual([]);
  });
});
