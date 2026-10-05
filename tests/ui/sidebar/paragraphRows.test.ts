import { describe, expect, it } from "vitest";
import type { Thread, Turn } from "../../../src/core/model/thread";
import { paragraphHash } from "../../../src/core/text/hash";
import {
  compareRows,
  paragraphNumberAt,
  paragraphRows,
  shortDate,
  taskLabelKeys,
  threadsWithMissingNote,
} from "../../../src/ui/sidebar/paragraphRows";
import { splitParagraphSpans } from "../../../src/core/text/paragraphs";

const NOTE = [
  "---",
  "tags: [speech]",
  "---",
  "# Opening",
  "",
  "Last time I was in a stadium this size, I was wearing a ==glittery== leotard. ^vt-aaaaaa",
  "",
  "- all the trustees",
  "- and members of the board",
  "",
  "To the honorees and everyone who came today — I am elated to be here.",
].join("\n");

const P1 = "Last time I was in a stadium this size, I was wearing a glittery leotard.";
const LIST = "- all the trustees\n- and members of the board";
const P3 = "To the honorees and everyone who came today — I am elated to be here.";

const LABELS: Record<string, string> = {
  "paragraph.grammar": "ai.task.paragraph.grammar",
  "paragraph.translate": "ai.task.paragraph.translate",
};
const labelOf = (id: string) => LABELS[id];

let n = 0;
function q(taskId: string, at: string, deleted = false): Turn[] {
  n++;
  const user: Turn = { id: `u${n}`, role: "user", content: "?", at, taskId, status: "done" };
  const answer: Turn = { id: `a${n}`, role: "assistant", content: "!", at, taskId, status: "done" };
  if (deleted) user.deletedAt = answer.deletedAt = at;
  return [user, answer];
}

function thread(id: string, text: string, opts: { blockId?: string; path?: string; turns?: Turn[]; createdAt?: string } = {}): Thread {
  return {
    id,
    anchor: { kind: "paragraph", path: opts.path ?? "a.md", blockId: opts.blockId, hash: paragraphHash(text), snapshot: text },
    turns: opts.turns ?? q("paragraph.grammar", "2026-10-01T10:00:00Z"),
    createdAt: opts.createdAt ?? "2026-10-01T09:00:00Z",
    rev: 0,
  };
}

describe("paragraphRows", () => {
  it("lists discussions in the note's order with ¶ numbers", () => {
    const rows = paragraphRows(
      [thread("t3", P3), thread("t1", P1, { blockId: "vt-aaaaaa" }), thread("t2", LIST)],
      NOTE,
      labelOf
    );
    expect(rows.map((r) => r.threadId)).toEqual(["t1", "t2", "t3"]);
    // The heading is ¶1 (paragraph numbering counts it, like prompts do).
    expect(rows.map((r) => r.number)).toEqual([2, 3, 4]);
    expect(rows[0].preview).toBe(P1);
    expect(rows[1].preview).toBe(LIST);
    expect(rows.every((r) => !r.orphan && !r.edited)).toBe(true);
    expect(rows.map((r) => r.hashOnly)).toEqual([false, true, true]);
  });

  it("puts orphans last, keeping the text saved when they started", () => {
    const gone = "This paragraph was deleted.";
    const rows = paragraphRows([thread("o", gone), thread("t3", P3)], NOTE, labelOf);
    expect(rows.map((r) => r.threadId)).toEqual(["t3", "o"]);
    expect(rows[1]).toMatchObject({ orphan: true, number: null, preview: gone, line: -1 });
  });

  it("marks a block-anchored paragraph whose text changed", () => {
    const before = "Last time I was in a stadium this size, I wore a leotard.";
    const rows = paragraphRows([thread("t1", before, { blockId: "vt-aaaaaa" })], NOTE, labelOf);
    expect(rows[0]).toMatchObject({ orphan: false, edited: true, preview: P1 });
  });

  it("treats every discussion as orphaned when the note is gone", () => {
    const rows = paragraphRows([thread("t1", P1, { blockId: "vt-aaaaaa" })], null, labelOf);
    expect(rows[0]).toMatchObject({ orphan: true, preview: P1 });
  });

  it("summarises labels, question count and the last activity", () => {
    const turns = [
      ...q("paragraph.grammar", "2026-10-01T10:00:00Z"),
      ...q("paragraph.translate", "2026-10-02T10:00:00Z", true),
      ...q("paragraph.custom", "2026-10-03T10:00:00Z"),
      ...q("paragraph.grammar", "2026-10-03T11:00:00Z"),
    ];
    const [row] = paragraphRows([thread("t3", P3, { turns })], NOTE, labelOf);
    // The deleted round counts for nothing; custom questions have no label.
    expect(row.labels).toEqual(["ai.task.paragraph.grammar"]);
    expect(row.count).toBe(3);
    expect(row.lastAt).toBe("2026-10-03T11:00:00Z");
  });

  it("skips deleted and non-paragraph threads", () => {
    const deleted = { ...thread("d", P3), deletedAt: "2026-10-04T00:00:00Z" };
    const word: Thread = { id: "w", anchor: { kind: "word", entryId: "e" }, turns: [], rev: 0 };
    expect(paragraphRows([deleted, word], NOTE, labelOf)).toEqual([]);
  });

  it("orders two discussions of one paragraph oldest first", () => {
    const rows = paragraphRows(
      [thread("late", P3, { createdAt: "2026-10-03T00:00:00Z" }), thread("early", P3, { createdAt: "2026-10-01T00:00:00Z" })],
      NOTE,
      labelOf
    );
    expect(rows.map((r) => r.threadId)).toEqual(["early", "late"]);
  });

  it("orders orphans by latest activity", () => {
    const a = paragraphRows([thread("a", "gone a", { turns: q("paragraph.grammar", "2026-10-01T00:00:00Z") })], NOTE, labelOf)[0];
    const b = paragraphRows([thread("b", "gone b", { turns: q("paragraph.grammar", "2026-10-05T00:00:00Z") })], NOTE, labelOf)[0];
    expect([a, b].sort(compareRows).map((r) => r.threadId)).toEqual(["b", "a"]);
  });
});

describe("helpers", () => {
  it("numbers paragraphs the way prompts do", () => {
    const spans = splitParagraphSpans(NOTE);
    expect(paragraphNumberAt(spans, 3)).toBe(1);
    expect(paragraphNumberAt(spans, 5)).toBe(2);
    expect(paragraphNumberAt(spans, 10)).toBe(4);
  });

  it("collects distinct labels in first-use order", () => {
    const turns = [...q("paragraph.translate", "x"), ...q("paragraph.grammar", "x"), ...q("paragraph.translate", "x")];
    expect(taskLabelKeys(thread("t", P1, { turns }), labelOf)).toEqual(["ai.task.paragraph.translate", "ai.task.paragraph.grammar"]);
  });

  it("finds discussions whose note no longer exists, newest first", () => {
    const threads = [
      thread("here", P1, { path: "a.md" }),
      thread("old", P1, { path: "gone.md", turns: q("paragraph.grammar", "2026-09-01T00:00:00Z") }),
      thread("new", P1, { path: "moved.md", turns: q("paragraph.grammar", "2026-10-01T00:00:00Z") }),
    ];
    const out = threadsWithMissingNote(threads, (p) => p === "a.md");
    expect(out.map((t) => t.id)).toEqual(["new", "old"]);
  });

  it("formats short dates and ignores bad ones", () => {
    expect(shortDate(new Date(2026, 9, 3, 12).toISOString())).toBe("10/03");
    expect(shortDate(undefined)).toBe("");
    expect(shortDate("nope")).toBe("");
  });
});
