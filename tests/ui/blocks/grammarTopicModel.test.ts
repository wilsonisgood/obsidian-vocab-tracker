import { beforeEach, describe, expect, it } from "vitest";
import { topicById } from "../../../src/core/grammar/catalog";
import { setLocale } from "../../../src/core/i18n";
import type { GrammarAttempt, GrammarSighting } from "../../../src/core/model/grammar";
import { GrammarPageError } from "../../../src/services/grammar/topicPage";
import {
  clipSnapshot,
  noteName,
  objectiveRows,
  pageErrorText,
  parseTopicParams,
  sightingRows,
  topicChips,
  topicMeta,
} from "../../../src/ui/blocks/grammarTopicModel";

beforeEach(() => setLocale("zh-TW"));

describe("params", () => {
  it("reads id (or topic), quoted or not", () => {
    expect(parseTopicParams("id: be-verb")).toEqual({ id: "be-verb" });
    expect(parseTopicParams('topic: "be-verb"')).toEqual({ id: "be-verb" });
    expect(parseTopicParams("")).toEqual({});
  });
});

describe("header", () => {
  it("reads 「基礎 · 難度 n」 from the topic", () => {
    const t = topicById("be-verb")!;
    expect(topicMeta(t)).toEqual({ stage: "基礎", difficulty: `難度 ${t.difficulty}` });
  });
});

describe("objectiveRows", () => {
  const topic = topicById("present-perfect-vs-past")!;
  const [o1, o2] = topic.objectives;
  let n = 0;
  const at = (objectiveId: string, correct: boolean): GrammarAttempt => ({
    id: `a${++n}`, questionId: `q${n}`, topicId: topic.id, objectiveId, at: `2026-10-0${1 + (n % 9)}T00:00:00Z`, correct, given: "",
  });

  it("shows – before an answer, correct/answered after, and done once mastered", () => {
    const attempts = [at(o1.id, true), at(o1.id, false), at(o2.id, true), at(o2.id, true), at(o2.id, true), at(o2.id, true)];
    const rows = objectiveRows(topic, attempts);
    expect(rows.map((r) => [r.state, r.score])).toEqual([
      ["partial", "1/2"],
      ["done", "4/4"],
      ...topic.objectives.slice(2).map(() => ["none", "–"]),
    ]);
    expect(rows[0].text).toBe(o1.text);
  });
});

describe("sightings", () => {
  const s = (topicId: string, i: number, snapshot = "She has lived here for ten years."): GrammarSighting => ({
    topicId, threadId: `th${i}`, turnId: `t${i}`, path: `eng/Book ${i}.md`, snapshot, at: "2026-10-01T00:00:00Z",
  });

  it("keeps the topic's own, newest first, at most 5", () => {
    const list = [s("a", 1), s("b", 2), ...[3, 4, 5, 6, 7, 8].map((i) => s("a", i))];
    const rows = sightingRows(list, "a");
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.note)).toEqual(["Book 1", "Book 3", "Book 4", "Book 5", "Book 6"]);
  });

  it("cuts the snapshot to one line of at most 120 characters", () => {
    expect(clipSnapshot("a\n\n  b   c ^vt-a1b2c3")).toBe("a b c");
    const long = "x".repeat(200);
    expect(clipSnapshot(long)).toBe(`${"x".repeat(120)}…`);
    expect(clipSnapshot("x".repeat(120))).toBe("x".repeat(120));
    expect(clipSnapshot("我".repeat(130))).toBe(`${"我".repeat(120)}…`);
  });

  it("names the note without folder and extension", () => {
    expect(noteName("eng/sub/A Wrinkle in Time.md")).toBe("A Wrinkle in Time");
    expect(noteName("loose.md")).toBe("loose");
  });
});

describe("topicChips", () => {
  it("lists prerequisites then related, once each", () => {
    const topic = topicById("present-perfect-vs-past")!;
    const chips = topicChips(topic);
    const ids = chips.map((c) => c.topic.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(topic.id);
    const firstRelated = chips.findIndex((c) => c.kind === "related");
    if (firstRelated >= 0) expect(chips.slice(0, firstRelated).every((c) => c.kind === "prerequisite")).toBe(true);
    expect(chips.filter((c) => c.kind === "prerequisite").map((c) => c.topic.id)).toEqual(
      topic.prerequisites.filter((p) => topicById(p))
    );
  });
});

describe("pageErrorText", () => {
  it("words the page errors, and leaves other errors to the caller", () => {
    expect(pageErrorText(new GrammarPageError("not-empty"))).toBe("說明已經有內容，沒有覆蓋。");
    expect(pageErrorText(new GrammarPageError("no-section"))).toContain("## 說明");
    expect(pageErrorText(new Error("x"))).toBeNull();
  });
});
