import { describe, expect, it } from "vitest";
import { noteLearnerContext, wordStatus } from "../../../src/core/learner/noteLearnerContext";
import type { Thread } from "../../../src/core/model/thread";
import { paragraphHash } from "../../../src/core/text/hash";

const NOW = new Date("2026-10-31T12:00:00.000Z");
const NOTE = "# Batteries\n\nSodium cells trade density for cost. ^vt-a1\n\nGrid operators now buy them.\n";
const card = (state: number, due: string, stability = 1) => ({ state, due, stability }) as never;

const thread = (anchor: Thread["anchor"], turns: { taskId: string; question?: string }[]): Thread =>
  ({
    id: "t",
    anchor,
    createdAt: "",
    rev: 0,
    turns: turns.flatMap((t, i) => [
      { id: `u${i}`, role: "user", content: "", at: "", status: "done", ...t },
      { id: `a${i}`, role: "assistant", content: "ok", at: "", status: "done" },
    ]),
  }) as Thread;

describe("noteLearnerContext (1030 #4 quiz aimed at what the learner did)", () => {
  it("word status: new / due / learning / mature", () => {
    expect(wordStatus({}, NOW)).toBe("新");
    expect(wordStatus({ srs: card(2, "2026-10-30T00:00:00.000Z", 30) }, NOW)).toBe("到期");
    expect(wordStatus({ srs: card(1, "2026-11-02T00:00:00.000Z") }, NOW)).toBe("學習中");
    expect(wordStatus({ srs: card(2, "2026-12-01T00:00:00.000Z", 30) }, NOW)).toBe("熟");
  });

  it("lists the note's words and the paragraphs discussed, with what was asked, in ¶ order", () => {
    const threads = [
      thread({ kind: "paragraph", path: "a.md", hash: paragraphHash("Grid operators now buy them."), snapshot: "" }, [{ taskId: "paragraph.custom", question: "them 指的是誰？" }]),
      thread({ kind: "paragraph", path: "a.md", blockId: "vt-a1", hash: "x", snapshot: "" }, [
        { taskId: "paragraph.translate" },
        { taskId: "paragraph.grammar" },
        { taskId: "paragraph.translate" },
      ]),
    ];
    const wordThread = thread({ kind: "word", entryId: "e1" }, [{ taskId: "word.usage" }, { taskId: "word.custom", question: "跟 swap 差在哪？" }]);
    const text = noteLearnerContext(NOTE, [{ word: "trade", thread: wordThread }, { word: "gone", deletedAt: "x" }], threads, NOW);
    expect(text).toContain("問過 AI 的單字：trade 用法、提問「跟 swap 差在哪？」");
    expect(text).toContain("〔學習狀況〕");
    expect(text).toContain("這篇收錄的單字（1）：trade（新）");
    expect(text).toContain("討論過的段落：¶2 翻譯、文法；¶3 提問「them 指的是誰？」");
  });

  it("says so when there's nothing yet", () => {
    expect(noteLearnerContext(NOTE, [], [], NOW)).toContain("還沒有收錄單字，也還沒討論過段落");
  });
});
