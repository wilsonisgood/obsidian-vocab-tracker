import { describe, expect, it } from "vitest";
import type { Thread, Turn } from "../../../src/core/model/thread";
import {
  discussedPoints,
  filterKey,
  nextParagraph,
  paragraphRef,
  paragraphSentences,
  paragraphsInFilter,
  paraScopeOptions,
  parseParaFilter,
} from "../../../src/core/practice/paraphrase";

const PARA =
  "The committee hardly ever approves a budget increase. Because costs rose sharply last year, it made an exception. Ok. 這是中文註解，不是英文句子喔喔喔喔喔喔喔喔喔喔。";

const turn = (id: string, at: string, extra: Partial<Turn> = {}): Turn => ({
  id,
  role: "user",
  content: "q",
  at,
  status: "done",
  ...extra,
});

function thread(id: string, path: string, snapshot: string, turns: Turn[] = [], extra: Partial<Thread> = {}): Thread {
  return { id, anchor: { kind: "paragraph", path, hash: "h", snapshot }, turns, ...extra };
}

describe("paragraphSentences", () => {
  it("keeps the English sentences long enough to paraphrase", () => {
    expect(paragraphSentences(PARA)).toEqual([
      "The committee hardly ever approves a budget increase.",
      "Because costs rose sharply last year, it made an exception.",
    ]);
  });
});

describe("discussedPoints", () => {
  it("takes highlighted text and questions, newest first, without repeats or deleted turns", () => {
    const th = thread("t1", "a.md", PARA, [
      turn("u1", "2026-10-01T00:00:00Z", { selection: "hardly ever", question: "是什麼意思？" }),
      { ...turn("a1", "2026-10-01T00:00:01Z"), role: "assistant" },
      turn("u2", "2026-10-02T00:00:00Z", { question: "made an exception 怎麼用" }),
      turn("u3", "2026-10-03T00:00:00Z", { selection: "gone", deletedAt: "2026-10-03T00:00:01Z" }),
      turn("u4", "2026-10-04T00:00:00Z", { selection: "hardly ever", question: "是什麼意思？" }),
      turn("u5", "2026-10-05T00:00:00Z"),
    ]);
    expect(discussedPoints(th)).toEqual(["「hardly ever」｜是什麼意思？", "made an exception 怎麼用"]);
  });
});

describe("paragraphRef", () => {
  it("needs a live paragraph thread with a usable sentence", () => {
    expect(paragraphRef(thread("t1", "eng/News.md", PARA))).toMatchObject({ threadId: "t1", title: "News" });
    expect(paragraphRef(thread("t2", "a.md", "Too short."))).toBeNull();
    expect(paragraphRef(thread("t3", "a.md", PARA, [], { deletedAt: "x" }))).toBeNull();
    expect(paragraphRef({ id: "w", anchor: { kind: "word", entryId: "e" }, turns: [] })).toBeNull();
  });
});

describe("filters", () => {
  const threads = [
    thread("t1", "a.md", PARA, [turn("u1", "2026-10-01T00:00:00Z")]),
    thread("t2", "b.md", PARA, [turn("u2", "2026-10-03T00:00:00Z")]),
    thread("t3", "b.md", PARA, [turn("u3", "2026-10-02T00:00:00Z")]),
  ];

  it("parses only well-formed filters", () => {
    expect(parseParaFilter(undefined)).toEqual({ scope: "all" });
    expect(parseParaFilter({ scope: "note", path: "" })).toEqual({ scope: "all" });
    expect(parseParaFilter({ scope: "thread", threadId: "t1" })).toEqual({ scope: "thread", threadId: "t1" });
  });

  it("covers all, one note or one paragraph, most recently discussed first", () => {
    expect(paragraphsInFilter(threads, { scope: "all" }).map((r) => r.threadId)).toEqual(["t2", "t3", "t1"]);
    expect(paragraphsInFilter(threads, { scope: "note", path: "b.md" }).map((r) => r.threadId)).toEqual(["t2", "t3"]);
    expect(paragraphsInFilter(threads, { scope: "thread", threadId: "t1" }).map((r) => r.threadId)).toEqual(["t1"]);
    expect(paragraphsInFilter(threads, { scope: "thread", threadId: "gone" })).toEqual([]);
  });

  it("lists the notes with most paragraphs first", () => {
    const o = paraScopeOptions(threads);
    expect(o.all).toBe(3);
    expect(o.notes.map((n) => [n.title, n.count])).toEqual([
      ["b", 2],
      ["a", 1],
    ]);
    expect(filterKey(o.notes[0].filter)).toBe("note:b.md");
  });
});

describe("nextParagraph", () => {
  it("picks the paragraph asked about least, the first one on ties", () => {
    const refs = paragraphsInFilter(
      [thread("t1", "a.md", PARA), thread("t2", "a.md", PARA)],
      { scope: "all" }
    );
    const order = refs.map((r) => r.threadId);
    expect(nextParagraph(refs, () => 0)?.threadId).toBe(order[0]);
    expect(nextParagraph(refs, (id) => (id === order[0] ? 3 : 1))?.threadId).toBe(order[1]);
    expect(nextParagraph([], () => 0)).toBeUndefined();
  });
});
