import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../src/core/i18n";
import type { PlayerQuestion } from "../../../src/ui/blocks/practice/playerTypes";
import {
  answerState, answeredText, canHint, historyEntries, initialState, keyAction, nextState, optionColumns,
  questionSegments, refreshState, retireState, segmentBlanks, segmentFragments, segmentTargets, showHint,
  skipState, speakerSides, statsLabel, trimHistory, entrySpeakers, feedbackNote,
} from "../../../src/ui/blocks/practice/scenarioPlayerModel";

beforeEach(() => setLocale("zh-TW"));

function q(id: string, over: Partial<PlayerQuestion> = {}): PlayerQuestion {
  return {
    id, kind: "choice", text: `I ____ it ${id}.`,
    options: [{ id: "a", text: "saw" }, { id: "b", text: "see" }],
    answerId: "a", explanation: "e", ...over,
  };
}

describe("segments", () => {
  it("splits blanks", () => {
    expect(segmentBlanks("I ____ it.")).toEqual([{ t: "text", text: "I " }, { t: "blank" }, { t: "text", text: " it." }]);
  });
  it("splits [[ ]]", () => {
    expect(segmentTargets("a [[run]] b")).toEqual([{ t: "text", text: "a " }, { t: "target", text: "run" }, { t: "text", text: " b" }]);
  });
  it("locates fragments, repeated words go to different spots", () => {
    const segs = segmentFragments("the cat saw the cat", [{ id: "a", text: "cat" }, { id: "b", text: "cat" }, { id: "c", text: "missing" }]);
    const frags = segs.filter((s) => s.t === "frag");
    expect(frags).toHaveLength(2);
    expect(segs.map((s) => (s.t === "text" || s.t === "frag" ? s.text : "")).join("")).toBe("the cat saw the cat");
    expect(frags[0]).toMatchObject({ optionId: "a" });
    expect(frags[1]).toMatchObject({ optionId: "b" });
  });
  it("picks by kind", () => {
    expect(questionSegments(q("1", { kind: "which-sense", text: "[[x]] y" }))[0]).toEqual({ t: "target", text: "x" });
  });
});

describe("answered text", () => {
  it("fills the blank", () => expect(answeredText(q("1"))).toBe("I saw it 1."));
  it("prefers answered", () => expect(answeredText(q("1", { answered: "Done." }))).toBe("Done."));
  it("find-error strikes the wrong piece and adds the fix", () => {
    const fe = q("2", { kind: "find-error", text: "He go home.", options: [{ id: "a", text: "go" }, { id: "b", text: "home" }], answered: "He goes home." });
    expect(answeredText(fe)).toBe("He go home. → He goes home.");
  });
});

describe("transitions", () => {
  const qs = [q("1"), q("2"), q("3")];
  const start = () => refreshState(initialState(), qs);

  it("starts empty then fills on refresh", () => {
    expect(initialState().phase).toBe("empty");
    expect(start().current?.id).toBe("1");
  });
  it("answer → feedback → next", () => {
    const r = answerState(start(), "b")!;
    expect(r.correct).toBe(false);
    expect(r.state.phase).toBe("feedback");
    expect(feedbackNote({ ...r.state, current: q("1", { optionNotes: { b: "no" } }) })).toBe("no");
    const n = nextState(r.state, qs);
    expect(n.current?.id).toBe("2");
    expect(n.history).toHaveLength(1);
    expect(n.answered).toBe(1);
    expect(n.correctCount).toBe(0);
  });
  it("cannot answer twice", () => {
    const r = answerState(start(), "a")!;
    expect(answerState(r.state, "a")).toBeNull();
  });
  it("skip and retire advance; skip in feedback is just next", () => {
    const sk = skipState(start(), qs);
    expect(sk.skipped).toBe(true);
    expect(sk.state.history[0].skipped).toBe(true);
    const fb = answerState(start(), "a")!.state;
    expect(skipState(fb, qs).skipped).toBe(false);
    const rt = retireState(start(), qs);
    expect(rt.current?.id).toBe("2");
    expect(rt.history[0].parts).toBeUndefined();
    expect(retireState(fb, qs).history[0].parts).toBeDefined();
  });
  it("does not re-pick done questions that are still listed", () => {
    const n = nextState(answerState(start(), "a")!.state, qs);
    expect(n.current?.id).toBe("2");
  });
  it("ends empty and resumes on refresh", () => {
    let s = refreshState(initialState(), [q("1")]);
    s = nextState(answerState(s, "a")!.state, [q("1")]);
    expect(s.phase).toBe("empty");
    expect(refreshState(s, [q("1"), q("9")]).current?.id).toBe("9");
  });
  it("refresh keeps current, but replaces an unanswered one that left", () => {
    const s = start();
    expect(refreshState(s, [q("1"), q("5")]).current?.id).toBe("1");
    expect(refreshState(s, [q("2")]).current?.id).toBe("2");
    expect(refreshState(s, []).phase).toBe("empty");
    const fb = answerState(s, "a")!.state;
    expect(refreshState(fb, [q("2")]).current?.id).toBe("1");
  });
  it("hints only before answering", () => {
    const h = refreshState(initialState(), [q("1", { hints: { a: "x" } })]);
    expect(canHint(h)).toBe(true);
    const hs = showHint(h);
    expect(hs.hinted).toBe(true);
    const fb = answerState(hs, "a")!.state;
    expect(canHint(fb)).toBe(false);
    expect(showHint(fb)).toBe(fb);
    expect(canHint(refreshState(initialState(), [q("1")]))).toBe(false);
  });
});

describe("history", () => {
  const item = (id: string, sc: string, speaker?: string) =>
    ({ qid: id, scenarioId: sc, scene: `S${sc}`, lead: [], speaker, parts: [{ t: "text" as const, text: id }], skipped: false });
  it("inserts a scene heading when the scenario changes", () => {
    const e = historyEntries([item("1", "a"), item("2", "a"), item("3", "b")]);
    expect(e.map((x) => x.type)).toEqual(["scene", "line", "line", "scene", "line"]);
  });
  it("includes leads in order", () => {
    const e = historyEntries([{ ...item("1", "a"), lead: [{ speaker: "A", text: "hi" }] }]);
    expect(e.map((x) => x.type)).toEqual(["scene", "line", "line"]);
    expect((e[1] as { lead: boolean }).lead).toBe(true);
  });
  it("trims to the last n lines and keeps the scene heading", () => {
    const e = historyEntries([item("1", "a"), item("2", "a"), item("3", "b"), item("4", "b")]);
    const t = trimHistory(e, 3);
    expect(t.hidden).toBe(1);
    expect(t.shown[0].type).toBe("line");
    const t2 = trimHistory(e, 2);
    expect(t2.shown[0]).toEqual({ type: "scene", text: "Sb" });
    expect(trimHistory(e, 10).hidden).toBe(0);
  });
  it("assigns speaker sides", () => {
    const side = speakerSides(["Amy", undefined, "Bo", "Cy"]);
    expect([side("Amy"), side("Bo"), side("Cy"), side(undefined)]).toEqual(["left", "right", "left", "left"]);
    expect(entrySpeakers([], q("1", { speaker: "Z", lead: [{ speaker: "Y", text: "t" }] }))).toEqual(["Y", "Z"]);
  });
});

describe("misc", () => {
  it("keys", () => {
    const s = refreshState(initialState(), [q("1", { hints: { a: "x" } })]);
    expect(keyAction("2", s)).toEqual({ type: "pick", index: 1 });
    expect(keyAction("3", s)).toBeNull();
    expect(keyAction("Enter", s)).toBeNull();
    expect(keyAction("S", s)).toEqual({ type: "skip" });
    expect(keyAction("h", s)).toEqual({ type: "hint" });
    const fb = answerState(s, "a")!.state;
    expect(keyAction("Enter", fb)).toEqual({ type: "next" });
    expect(keyAction("1", fb)).toBeNull();
    expect(keyAction("h", fb)).toBeNull();
    expect(keyAction("s", initialState())).toBeNull();
  });
  it("columns and stats", () => {
    expect(optionColumns("choice", false)).toBe(2);
    expect(optionColumns("choice", true)).toBe(1);
    expect(optionColumns("same-sense", false)).toBe(1);
    expect(statsLabel({ answered: 3, correctCount: 2 })).toBe("今天這裡答了 3 題 · 對 2");
  });
});
