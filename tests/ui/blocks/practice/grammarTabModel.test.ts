import { beforeEach, describe, expect, it } from "vitest";
import { GRAMMAR_TOPICS } from "../../../../src/core/grammar/catalog";
import { setLocale } from "../../../../src/core/i18n";
import {
  filterForTopics,
  filterToValue,
  grammarGroups,
  grammarQuickPicks,
  grammarSummary,
  groupMistakes,
  mistakeCount,
  recentSightingTopics,
  routeToPractice,
  toPlayerQuestion,
  topicFilter,
  valueToFilter,
} from "../../../../src/ui/blocks/practice/grammarTabModel";
import type { GrammarQuestionLike } from "../../../../src/ui/grammar/practiceTypes";

beforeEach(() => setLocale("zh-TW"));

const s1 = GRAMMAR_TOPICS.filter((t) => t.stage === 1);
const s2 = GRAMMAR_TOPICS.filter((t) => t.stage === 2);

const q = (over: Partial<GrammarQuestionLike>): GrammarQuestionLike => ({
  id: "q1",
  topicId: s1[0].id,
  objectiveId: "o",
  type: "choice",
  stem: "She ____ to school every day.",
  options: ["go", "goes"],
  answer: "goes",
  explanation: "第三人稱單數加 -es。",
  errorTag: "agreement",
  ...over,
} as GrammarQuestionLike);

describe("toPlayerQuestion", () => {
  it("turns a choice question into a PlayerQuestion", () => {
    const pq = toPlayerQuestion(
      q({
        distractors: { go: "主詞是 she。" },
        sentenceZh: "她每天上學。",
        scenario: { id: "sc1", scene: "在教室", seq: 1, speaker: "Amy", lead: [{ speaker: "Ben", text: "Hi!" }, { text: "Morning." }] },
      })
    );
    expect(pq).toMatchObject({
      id: "q1",
      kind: "choice",
      text: "She ____ to school every day.",
      answerId: "goes",
      options: [{ id: "go", text: "go" }, { id: "goes", text: "goes" }],
      optionNotes: { go: "主詞是 she。" },
      sentenceZh: "她每天上學。",
      scenarioId: "sc1",
      scene: "在教室",
      speaker: "Amy",
      lead: [{ speaker: "Ben", text: "Hi!" }, { text: "Morning." }],
    });
    expect(pq?.tag).toBe(`文法 · ${s1[0].title}`);
  });

  it("normalises a longer blank to ____ and rejects stems without exactly one", () => {
    expect(toPlayerQuestion(q({ stem: "She ______ home." }))?.text).toBe("She ____ home.");
    expect(toPlayerQuestion(q({ stem: "She goes home." }))).toBeNull();
    expect(toPlayerQuestion(q({ stem: "A ____ b ____ c." }))).toBeNull();
  });

  it("find-error: options are fragments and `answered` is the corrected sentence", () => {
    const pq = toPlayerQuestion(
      q({
        type: "find-error",
        stem: "He have a dog.",
        options: ["He", "have", "a dog"],
        answer: "have",
        accepted: ["has"],
      })
    );
    expect(pq).toMatchObject({ kind: "find-error", text: "He have a dog.", answerId: "have", answered: "He has a dog." });
    expect(toPlayerQuestion(q({ type: "find-error", stem: "He have a dog.", options: ["He", "have"], answer: "have" }))?.answered).toBeUndefined();
  });

  it("leaves blank, rewrite and translate out, and malformed choices", () => {
    expect(toPlayerQuestion(q({ type: "blank" }))).toBeNull();
    expect(toPlayerQuestion(q({ type: "rewrite" }))).toBeNull();
    expect(toPlayerQuestion(q({ type: "translate" }))).toBeNull();
    expect(toPlayerQuestion(q({ options: ["go"] }))).toBeNull();
    expect(toPlayerQuestion(q({ answer: "went" }))).toBeNull();
  });
});

describe("filter chips", () => {
  it("round-trips a filter and drops topics outside the chosen stages", () => {
    const f = { stages: [1 as const], topics: [s1[0].id, s2[0].id] };
    expect(valueToFilter(filterToValue(f), "")).toEqual({ stages: [1], topics: [s1[0].id] });
    expect(filterToValue({ stages: [], topics: [] })).toEqual({});
  });

  it("lists only the chosen stage's topics (the starting stage when none)", () => {
    const g = grammarGroups({ stages: [2], topics: [] }, "");
    expect(g[0].options.map((o) => o.id)).toEqual(["1", "2", "3"]);
    expect(g[1].options.length).toBe(s2.length);
    expect(g[1].options.every((o) => s2.some((t) => t.id === o.id))).toBe(true);
    // No level: starting difficulty lands in the 基礎 stage.
    expect(grammarGroups({ stages: [], topics: [] }, "").map((x) => x.id)).toEqual(["stage", "topic"]);
  });

  it("summarises the filter", () => {
    expect(grammarSummary({ stages: [1], topics: [] }, "")).toBe("基礎 · 全部主題");
    expect(grammarSummary({ stages: [1], topics: [s1[0].id, s1[1].id] }, "")).toBe(`基礎 · ${s1[0].title}、${s1[1].title}`);
  });
});

describe("quick picks", () => {
  it("builds a filter from topic ids and offers only non-empty picks", () => {
    expect(filterForTopics([s1[0].id, s2[0].id, "nope", s1[0].id])).toEqual({ stages: [1, 2], topics: [s1[0].id, s2[0].id] });
    const picks = grammarQuickPicks({ weekTopics: [s1[0].id], dueTopics: [], weakTopics: [s2[0].id] }, "");
    expect(picks.map((p) => p.label)).toEqual(["本週讀到的", "上次錯的"]);
    expect(picks[1].apply({})).toEqual({ stage: ["2"], topic: [s2[0].id] });
  });

  it("keeps sightings from the last 7 days", () => {
    const now = new Date("2026-10-13T00:00:00Z");
    const list = [
      { topicId: "a", at: "2026-10-12T00:00:00Z" },
      { topicId: "b", at: "2026-10-01T00:00:00Z" },
      { topicId: "a", at: "2026-10-10T00:00:00Z" },
    ];
    expect(recentSightingTopics(list, now)).toEqual(["a"]);
  });
});

describe("reroute", () => {
  it("sets the filter to the topic and opens the grammar tab", () => {
    expect(topicFilter(s2[0].id)).toEqual({ stages: [2], topics: [s2[0].id] });
    expect(topicFilter("nope")).toBeNull();
    const calls: unknown[] = [];
    const ok = routeToPractice({ setGrammarFilter: (f) => calls.push(f), openPractice: (t) => calls.push(t) }, s2[0].id);
    expect(ok).toBe(true);
    expect(calls).toEqual([{ stages: [2], topics: [s2[0].id] }, "grammar"]);
    expect(routeToPractice({}, s2[0].id)).toBe(false);
  });
});

describe("mistake groups", () => {
  it("groups by error tag, biggest first, with each group's main topic; unshowable questions are left out", () => {
    const qs = [
      q({ id: "a", errorTag: "article", topicId: s1[0].id }),
      q({ id: "b", errorTag: "plural", topicId: s1[0].id }),
      q({ id: "c", errorTag: "article", topicId: s1[1].id }),
      q({ id: "d", errorTag: "article", topicId: s1[1].id }),
      q({ id: "e", errorTag: "voice", type: "blank" }),
    ];
    const groups = groupMistakes(qs);
    expect(groups.map((g) => [g.errorTag, g.questions.length, g.topicId])).toEqual([
      ["article", 3, s1[1].id],
      ["plural", 1, s1[0].id],
    ]);
    expect(groups[0].label).toBe("冠詞");
    expect(mistakeCount(groups)).toBe(4);
  });
});
