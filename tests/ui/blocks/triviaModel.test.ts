import { describe, expect, it } from "vitest";
import type { Turn } from "../../../src/core/model/thread";
import type { TriviaItem } from "../../../src/core/model/trivia";
import {
  favoriteViews,
  nextFeedback,
  parseTriviaParams,
  splitAround,
  triviaCall,
  triviaKindOf,
  triviaTurnActions,
  triviaTurnHeader,
} from "../../../src/ui/blocks/triviaModel";

function turn(id: string, role: Turn["role"], extra: Partial<Turn> = {}): Turn {
  return { id, role, content: role === "assistant" ? "**標題**\n\n內容" : "再來一則", at: "2026-10-05T00:00:00Z", status: "done", ...extra };
}

describe("parseTriviaParams", () => {
  it("shows favorites unless turned off", () => {
    expect(parseTriviaParams("")).toEqual({ favorites: true });
    expect(parseTriviaParams("favorites: off\nword: apron")).toEqual({ favorites: false, word: "apron" });
    expect(parseTriviaParams("favorites: no")).toEqual({ favorites: false });
    expect(parseTriviaParams("favorites: yes")).toEqual({ favorites: true });
  });
});

describe("triviaCall", () => {
  it("maps quick actions to TriviaService.ask(kind)", () => {
    expect(triviaKindOf("trivia.quiz")).toBe("quiz");
    expect(triviaKindOf("trivia.followup")).toBeUndefined();
    expect(triviaCall({ taskId: "trivia.etymology" })).toEqual({ type: "ask", kind: "etymology" });
    expect(triviaCall({ taskId: "trivia.joke" })).toEqual({ type: "ask", kind: "joke" });
  });

  it("leaves 再來一則's word to the service, so its no-repeat rules apply", () => {
    // TriviaService.pick() excludes the last 30 subjects (§7.4); passing
    // an entryId here would bypass that.
    expect(triviaCall({ taskId: "trivia.next" })).toEqual({ type: "ask", kind: "next" });
  });

  it("keeps every round on the pinned word in word mode", () => {
    expect(triviaCall({ taskId: "trivia.next" }, "e1")).toEqual({ type: "ask", kind: "next", entryId: "e1" });
  });

  it("sends composer text as a follow-up, with the selection if any", () => {
    expect(triviaCall({ taskId: "trivia.followup", question: " 還有類似的例子嗎？ " })).toEqual({
      type: "followup",
      question: "還有類似的例子嗎？",
    });
    expect(triviaCall({ taskId: "trivia.followup", question: "why", selection: "an apron" })).toEqual({
      type: "followup",
      question: "why",
      selection: "an apron",
    });
    expect(triviaCall({ taskId: "trivia.followup", question: "  " })).toBeNull();
    expect(triviaCall({ taskId: "word.custom", question: "hi" })).toBeNull();
  });
});

describe("triviaTurnActions", () => {
  const answer = turn("a1", "assistant", { taskId: "trivia.next", subjectEntryId: "e1" });

  it("offers 👍 👎 and 收藏到 <word> on a finished round", () => {
    const specs = triviaTurnActions(answer, { subjectWord: "apron", feedback: true });
    expect(specs.map((s) => [s.kind, s.icon, s.active, s.iconOnly])).toEqual([
      ["up", "thumbs-up", false, true],
      ["down", "thumbs-down", false, true],
      ["favorite", "bookmark", false, false],
    ]);
    expect(specs[2]).toMatchObject({ label: "learn.trivia.favoriteTo", params: { word: "apron" } });
  });

  it("marks the chosen thumb and a saved favorite", () => {
    const specs = triviaTurnActions({ ...answer, feedback: "down" }, { subjectWord: "apron", favorite: { id: "t1" }, feedback: true });
    expect(specs.find((s) => s.kind === "down")?.active).toBe(true);
    expect(specs.find((s) => s.kind === "up")?.active).toBe(false);
    expect(specs[2]).toMatchObject({ kind: "unfavorite", label: "learn.trivia.favorited", active: true });
  });

  it("says just 收藏 on a follow-up answer", () => {
    const f = turn("a2", "assistant", { taskId: "trivia.followup", subjectEntryId: "e1" });
    expect(triviaTurnActions(f, { subjectWord: "apron", feedback: false })).toEqual([
      { kind: "favorite", label: "learn.trivia.favorite", icon: "bookmark", active: false, iconOnly: false },
    ]);
  });

  it("hides feedback until it can be stored, and 收藏 without a subject word", () => {
    expect(triviaTurnActions(answer, { feedback: false })).toEqual([]);
  });

  it("gives nothing for unfinished, empty or user turns", () => {
    expect(triviaTurnActions({ ...answer, status: "streaming" }, { subjectWord: "a", feedback: true })).toEqual([]);
    expect(triviaTurnActions({ ...answer, status: "error" }, { subjectWord: "a", feedback: true })).toEqual([]);
    expect(triviaTurnActions({ ...answer, content: " " }, { subjectWord: "a", feedback: true })).toEqual([]);
    expect(triviaTurnActions(turn("q", "user"), { subjectWord: "a", feedback: true })).toEqual([]);
  });

  it("toggles a thumb off when clicked again", () => {
    expect(nextFeedback(undefined, "up")).toBe("up");
    expect(nextFeedback("up", "up")).toBeUndefined();
    expect(nextFeedback("up", "down")).toBe("down");
  });
});

describe("triviaTurnHeader", () => {
  const label = (k: string) => (k === "next" ? "冷知識" : k);

  it("labels a round with its kind and word", () => {
    expect(triviaTurnHeader(turn("a", "assistant", { taskId: "trivia.next" }), "apron", label)).toBe("冷知識 · apron");
    expect(triviaTurnHeader(turn("a", "assistant", { taskId: "trivia.quiz" }), "apron", label)).toBe("quiz · apron");
  });

  it("has no header for follow-ups, user turns or unknown words", () => {
    expect(triviaTurnHeader(turn("a", "assistant", { taskId: "trivia.followup" }), "apron", label)).toBeUndefined();
    expect(triviaTurnHeader(turn("q", "user", { taskId: "trivia.next" }), "apron", label)).toBeUndefined();
    expect(triviaTurnHeader(turn("a", "assistant", { taskId: "trivia.next" }), undefined, label)).toBeUndefined();
  });
});

describe("splitAround", () => {
  it("splits a template where the mentioned words go", () => {
    expect(splitAround("也提到 \u0000", "\u0000")).toEqual(["也提到 ", ""]);
    expect(splitAround("Also mentions \u0000.", "\u0000")).toEqual(["Also mentions ", "."]);
    expect(splitAround("no marker", "\u0000")).toEqual(["no marker", ""]);
  });
});

describe("favoriteViews", () => {
  it("heads each favorite with its word and lists the other words it mentions", () => {
    const items: TriviaItem[] = [
      { id: "t1", entryId: "e1", mentions: ["e2", "gone"], title: "a napron → an apron", body: "napron 和 napkin 同源。", createdAt: "2026-10-03T00:00:00Z" },
      { id: "t2", entryId: "deleted", mentions: [], title: "孤兒", body: "…" },
    ];
    const words: Record<string, string> = { e1: "apron", e2: "napkin" };
    const views = favoriteViews(items, (id) => words[id], (iso) => (iso ? "10/03" : undefined));
    expect(views).toEqual([
      { id: "t1", heading: "apron · a napron → an apron", body: "napron 和 napkin 同源。", date: "10/03", mentions: [{ entryId: "e2", word: "napkin" }] },
      { id: "t2", heading: "孤兒", body: "…", date: undefined, mentions: [] },
    ]);
  });
});
