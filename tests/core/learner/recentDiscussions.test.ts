import { describe, expect, it } from "vitest";
import { buddyContext } from "../../../src/core/learner/buddyContext";
import { recentDiscussions } from "../../../src/core/learner/recentDiscussions";
import type { Anchor, Thread, Turn } from "../../../src/core/model/thread";

const NOW = new Date("2026-10-26T12:00:00");
const user = (id: string, at: string, o: Partial<Turn> = {}): Turn => ({ id, role: "user", content: "", at, status: "done", ...o });
const answer = (id: string, at: string): Turn => ({ id, role: "assistant", content: "很長的回答", at, status: "done" });
const thread = (id: string, anchor: Anchor, turns: Turn[], o: Partial<Thread> = {}): Thread => ({ id, anchor, turns, ...o });
const words: Record<string, string> = { e1: "analyze", e2: "apron" };
const wordOf = (id: string) => words[id];

describe("recentDiscussions", () => {
  it("lists questions newest first with type, subject, selection and question — never the answer", () => {
    const threads = [
      thread("word:e1", { kind: "word", entryId: "e1" }, [
        user("u1", "2026-10-20T09:00:00", { taskId: "word.compare", question: "跟 analyse 差在哪？" }),
        answer("a1", "2026-10-20T09:00:05"),
      ]),
      thread("paragraph:x", { kind: "paragraph", path: "TED/How to learn.md", hash: "h", snapshot: "…" }, [
        user("u2", "2026-10-25T09:00:00", { taskId: "paragraph.grammar", selection: "Having been told   twice, she left." }),
        answer("a2", "2026-10-25T09:00:05"),
      ]),
    ];
    const lines = recentDiscussions(threads, wordOf, NOW);
    expect(lines).toEqual([
      "- 10/25 文法解析｜「How to learn」的段落｜選了「Having been told twice, she left.」\n  段落原文：…",
      "- 10/20 比較｜analyze｜問：跟 analyse 差在哪？",
    ]);
    expect(lines.join("\n")).not.toContain("很長的回答");
  });

  it("leaves out buddy chats, deleted rounds and threads, and anything older than the window", () => {
    const threads = [
      thread("buddy:1", { kind: "buddy" }, [user("b", "2026-10-25T09:00:00", { taskId: "buddy.custom", question: "hi" })]),
      thread("word:e1", { kind: "word", entryId: "e1" }, [
        user("old", "2026-10-01T09:00:00", { taskId: "word.usage" }),
        user("gone", "2026-10-24T09:00:00", { taskId: "word.usage", deletedAt: "2026-10-24T10:00:00" }),
      ]),
      thread("word:e2", { kind: "word", entryId: "e2" }, [user("t", "2026-10-24T09:00:00", { taskId: "word.usage" })], { deletedAt: "2026-10-25T00:00:00" }),
    ];
    expect(recentDiscussions(threads, wordOf, NOW)).toEqual([]);
  });

  it("caps the list and clips long text", () => {
    const turns = Array.from({ length: 30 }, (_, i) =>
      user(`u${i}`, `2026-10-2${i % 6}T0${i % 9}:00:00`, { taskId: "word.custom", question: "x".repeat(200) })
    );
    const lines = recentDiscussions([thread("word:e1", { kind: "word", entryId: "e1" }, turns)], wordOf, NOW, { max: 5 });
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain(`${"x".repeat(120)}…`);
  });
});

describe("recentDiscussions paragraph text", () => {
  it("sends the paragraph itself once per thread, so a bare 文法解析 still says which paragraph", () => {
    const snapshot = "* [[00:01:29](https://youtu.be/x?t=89s)] Today I will explain why **school** matters. ^vt-abc123";
    const threads = [
      thread("paragraph:p", { kind: "paragraph", path: "eng/Cadence_Gao_School_Speech_Transcript 2.md", hash: "h", snapshot }, [
        user("u1", "2026-10-27T09:00:00", { taskId: "paragraph.grammar" }),
        answer("a1", "2026-10-27T09:00:05"),
        user("u2", "2026-10-27T10:00:00", { taskId: "paragraph.translate" }),
        answer("a2", "2026-10-27T10:00:05"),
      ]),
    ];
    const lines = recentDiscussions(threads, wordOf, NOW);
    expect(lines).toEqual([
      "- 10/27 翻譯｜「Cadence_Gao_School_Speech_Transcript 2」的段落\n  段落原文：Today I will explain why school matters.",
      "- 10/27 文法解析｜「Cadence_Gao_School_Speech_Transcript 2」的段落",
    ]);
  });
});

describe("buddyContext with recent discussions", () => {
  const snap = { level: "B1", vocab: { total: 0, learning: 0, mature: 0, due: 0 }, grammar: { started: 0, mastered: 0, due: 0 }, poly: { practisedSenses: 0, weakSenses: 0 }, weak: [] };

  it("adds the block only when there is something", () => {
    expect(buddyContext(snap, undefined, ["- 10/25 文法解析"])).toContain("【最近跟 AI 討論過的內容");
    expect(buddyContext(snap)).not.toContain("最近跟 AI 討論過的內容");
  });
});
