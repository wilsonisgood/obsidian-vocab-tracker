import { describe, expect, it } from "vitest";
import { latestSuggestions, parseSuggestions, pickTwo, stripSuggestions } from "../../../src/core/learner/buddySuggestions";
import { mergeThreads } from "../../../src/core/store/threads";
import type { Thread, Turn } from "../../../src/core/model/thread";

describe("parse / strip", () => {
  const text = "正文第一段\n\n正文第二段\n〔接著聊〕貓的英文｜點餐用語 | 夢想旅行｜第四個";
  it("parses up to three topics", () => {
    expect(parseSuggestions(text)).toEqual(["貓的英文", "點餐用語", "夢想旅行"]);
  });
  it("no line means no suggestions; empty and duplicate items are dropped", () => {
    expect(parseSuggestions("只是回答")).toEqual([]);
    expect(parseSuggestions("x\n〔接著聊〕a｜｜a｜b")).toEqual(["a", "b"]);
  });
  it("strips the line, and leaves other text alone", () => {
    expect(stripSuggestions(text)).toBe("正文第一段\n\n正文第二段");
    expect(stripSuggestions("沒有這行 〔註〕 ok")).toBe("沒有這行 〔註〕 ok");
  });
  it("hides a half-written marker while streaming", () => {
    expect(stripSuggestions("答案\n〔")).toBe("答案");
    expect(stripSuggestions("答案\n〔接著")).toBe("答案");
    expect(stripSuggestions("答案\n〔接著聊〕貓的")).toBe("答案");
  });
});

const turn = (o: Partial<Turn>): Turn => ({ id: "t", role: "assistant", content: "", at: "", status: "done", ...o });
const th = (turns: Turn[], o: Partial<Thread> = {}): Thread => ({ id: "buddy:x", anchor: { kind: "buddy" }, turns, ...o });

describe("latestSuggestions", () => {
  it("takes the newest live answer's topics, none while it streams or after a failure", () => {
    expect(latestSuggestions(th([turn({ id: "a", suggestions: ["old"] }), turn({ id: "b", suggestions: ["new1", "new2"] })]))).toEqual(["new1", "new2"]);
    expect(latestSuggestions(th([turn({ id: "a", suggestions: ["old"] }), turn({ id: "b", status: "streaming" })]))).toEqual([]);
    expect(latestSuggestions(th([turn({ id: "a" })]))).toEqual([]);
    expect(latestSuggestions(undefined)).toEqual([]);
  });
});

describe("pickTwo", () => {
  const pool = ["a", "b", "c"];
  it("picks two distinct, and never the same pair twice in a row", () => {
    for (const r of [0, 0.4, 0.99]) {
      const p = pickTwo(pool, ["a", "b"], () => r);
      expect(new Set(p).size).toBe(2);
      expect([...p].sort()).not.toEqual(["a", "b"]);
    }
  });
  it("small pools are returned whole", () => {
    expect(pickTwo(["a", "b"], ["a", "b"], () => 0)).toEqual(["a", "b"]);
    expect(pickTwo(["a"], [], () => 0)).toEqual(["a"]);
  });
});

describe("merging archivedCount", () => {
  it("keeps the larger count", () => {
    const a = th([], { archivedCount: 8, updatedAt: "2026-10-01T00:00:00Z" });
    const b = th([], { archivedCount: 16, updatedAt: "2026-09-01T00:00:00Z" });
    expect(mergeThreads([a], [b])[0].archivedCount).toBe(16);
    expect(mergeThreads([b], [a])[0].archivedCount).toBe(16);
  });
});
