import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../src/core/i18n";
import { chipsLabel, displayContent, grammarChips } from "../../../src/ui/chat/grammarChips";
import { stageLabel } from "../../../src/ui/grammar/labels";
import { GRAMMAR_TASK_ID } from "../../../src/core/grammar/sightings";
import { topicById } from "../../../src/core/grammar/catalog";
import type { Turn } from "../../../src/core/model/thread";

function answer(content: string, extra: Partial<Turn> = {}): Turn {
  return { id: "a", role: "assistant", content, at: "2026-10-13T00:00:00Z", status: "done", taskId: GRAMMAR_TASK_ID, ...extra };
}

beforeEach(() => setLocale("zh-TW"));

describe("displayContent (shown, copied)", () => {
  it("removes the trailer line and trailing whitespace", () => {
    expect(displayContent("說明。\n\n<!-- vt-grammar: past-simple -->\n")).toBe("說明。");
    expect(displayContent("說明。\n<!-- vt-grammar: -->")).toBe("說明。");
  });

  it("hides a half-streamed trailer", () => {
    expect(displayContent("說明。\n<!-- vt-gram")).toBe("說明。");
    expect(displayContent("說明。\n<!-- vt-grammar: past-simple, pas")).toBe("說明。");
    expect(displayContent("<!-- vt-grammar: a")).toBe("");
  });

  it("leaves other answers alone", () => {
    expect(displayContent("**bold**\n\n- a\n- b")).toBe("**bold**\n\n- a\n- b");
    expect(displayContent("keep <!-- a normal comment --> here")).toBe("keep <!-- a normal comment --> here");
  });
});

describe("grammarChips", () => {
  const ids = ["past-simple", "present-perfect-vs-past", "passive-basic"];

  it("one chip per known topic, in trailer order, labelled title · stage", () => {
    const chips = grammarChips(answer(`x\n<!-- vt-grammar: ${ids.join(", ")} -->`));
    expect(chips.map((c) => c.topicId)).toEqual(ids);
    const t = topicById("present-perfect-vs-past")!;
    expect(chips[1]).toEqual({ topicId: t.id, label: `${t.title} · ${stageLabel(t.stage)}`, stage: t.stage });
    expect(chips.every((c) => /· (基礎|中級|進階)$/.test(c.label))).toBe(true);
  });

  it("the chip row label", () => {
    expect(chipsLabel()).toBe("這句用到的文法");
    setLocale("en");
    expect(chipsLabel()).toBe("Grammar in this sentence");
  });

  it("drops unknown ids and an empty trailer gives no chips", () => {
    expect(grammarChips(answer("x\n<!-- vt-grammar: nope, past-simple -->")).map((c) => c.topicId)).toEqual(["past-simple"]);
    expect(grammarChips(answer("x\n<!-- vt-grammar: -->"))).toEqual([]);
    expect(grammarChips(answer("no trailer"))).toEqual([]);
  });

  it("only finished 文法解析 answers get chips", () => {
    const body = "x\n<!-- vt-grammar: past-simple -->";
    expect(grammarChips(answer(body, { taskId: "paragraph.translate" }))).toEqual([]);
    expect(grammarChips(answer(body, { taskId: undefined }))).toEqual([]);
    expect(grammarChips(answer(body, { status: "streaming" }))).toEqual([]);
    expect(grammarChips(answer(body, { status: "error" }))).toEqual([]);
    expect(grammarChips(answer(body, { status: "aborted" }))).toEqual([]);
    expect(grammarChips(answer(body, { role: "user" }))).toEqual([]);
  });
});
