import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../../src/core/i18n";
import type { PracticeQuestion } from "../../../../src/core/model/practice";
import {
  groupPracticeMistakes,
  mistakeKey,
  mistakeLabel,
  mistakeLine,
  practiceMistakeCount,
} from "../../../../src/ui/blocks/practice/mistakesPanelModel";

beforeEach(() => setLocale("zh-TW"));

const q = (id: string, errorTag?: string, kind: PracticeQuestion["kind"] = "which-sense"): PracticeQuestion => ({
  id,
  track: "poly",
  scenario: { id: "s", scene: "", seq: 1 },
  kind,
  text: "",
  options: [],
  answerId: "",
  explanation: "",
  focus: { kind: "sense", id: "get.arrive" },
  ...(errorTag ? { errorTag } : {}),
  createdAt: "",
  updatedAt: "",
});

describe("mistakes panel model", () => {
  it("groups by errorTag, biggest first, ties by first appearance", () => {
    const g = groupPracticeMistakes([q("1", "collocation"), q("2", "tense-choice"), q("3", "tense-choice"), q("4", "sense-confusion")]);
    expect(g.map((x) => [x.key, x.questions.length])).toEqual([
      ["tense-choice", 2],
      ["collocation", 1],
      ["sense-confusion", 1],
    ]);
    expect(practiceMistakeCount(g)).toBe(4);
  });
  it("labels are Chinese: grammar tag, poly tag, kind fallback, raw", () => {
    expect(mistakeLabel("tense-choice")).toBe("時態選擇");
    expect(mistakeLabel("sense-confusion")).toBe("意思混淆");
    expect(mistakeLabel(mistakeKey(q("1", undefined, "pick-word")))).toBe("選用字");
    expect(mistakeLabel("weird")).toBe("weird");
  });
});

describe("mistakeLine and full lists (1013-3)", () => {
  it("a group lists every question, no cap", () => {
    const qs = ["a", "b", "c", "d", "e"].map((id) => q(id, "sense-confusion"));
    const groups = groupPracticeMistakes(qs);
    expect(groups).toHaveLength(1);
    expect(groups[0].questions.map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(practiceMistakeCount(groups)).toBe(5);
  });
  it("one line: marks removed, cut to 60", () => {
    expect(mistakeLine("She sat by the [[bank]] today.")).toBe("She sat by the bank today.");
    const long = "word ".repeat(30);
    const out = mistakeLine(long);
    expect(out.length).toBe(60);
    expect(out.endsWith("…")).toBe(true);
  });
});
