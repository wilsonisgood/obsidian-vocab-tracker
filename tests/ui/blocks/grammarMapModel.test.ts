import { beforeEach, describe, expect, it } from "vitest";
import { GRAMMAR_TOPICS, topicById } from "../../../src/core/grammar/catalog";
import { topicStatuses } from "../../../src/core/grammar/progress";
import { setLocale } from "../../../src/core/i18n";
import type { GrammarAttempt, GrammarQuestion, GrammarTopicStatus } from "../../../src/core/model/grammar";
import {
  defaultStage,
  errorTagLabel,
  gl,
  lockedTooltip,
  mapRows,
  mistakeEntries,
  mistakeTotal,
  parseMapParams,
  stageLabel,
  stageOfDifficulty,
  topicOfGroup,
} from "../../../src/ui/blocks/grammarMapModel";
import { ERROR_TAGS } from "../../../src/core/model/grammar";

beforeEach(() => setLocale("zh-TW"));

let n = 0;
const attempt = (topicId: string, objectiveId: string, correct: boolean, at = "2026-10-01T00:00:00Z", questionId = `q${++n}`): GrammarAttempt => ({
  id: `a${++n}`,
  questionId,
  topicId,
  objectiveId,
  at,
  correct,
  given: "x",
});

const question = (id: string, topicId: string, errorTag: GrammarQuestion["errorTag"]): GrammarQuestion => ({
  id,
  topicId,
  objectiveId: topicById(topicId)!.objectives[0].id,
  type: "choice",
  stem: "s",
  answer: "a",
  explanation: "e",
  errorTag,
  updatedAt: "2026-10-01T00:00:00Z",
  rev: 1,
} as GrammarQuestion);

describe("stages", () => {
  it("maps difficulty and CEFR level to a stage (rule 3)", () => {
    expect([1, 3, 4, 6, 7, 9].map(stageOfDifficulty)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(["", "A1", "A2", "B1", "B2", "C1", "C2"].map((l) => defaultStage(l as never))).toEqual([1, 1, 1, 2, 2, 3, 3]);
    expect([1, 2, 3].map((s) => stageLabel(s as 1 | 2 | 3))).toEqual(["基礎", "中級", "進階"]);
  });

  it("reads the optional stage parameter", () => {
    expect(parseMapParams("stage: 2")).toEqual({ stage: 2 });
    expect(parseMapParams("stage: 進階")).toEqual({ stage: 3 });
    expect(parseMapParams("stage: 7")).toEqual({});
    expect(parseMapParams("")).toEqual({});
  });
});

describe("mapRows", () => {
  const stage2 = GRAMMAR_TOPICS.filter((t) => t.stage === 2);
  const withPrereq = stage2.find((t) => t.prerequisites.some((p) => topicById(p)))!;

  it("lists one stage in order with status text", () => {
    const rows = mapRows(2, GRAMMAR_TOPICS, () => "new", []);
    expect(rows.map((r) => r.topic.id)).toEqual([...stage2].sort((a, b) => a.order - b.order).map((t) => t.id));
    expect(rows.every((r) => r.statusText === "尚未開始")).toBe(true);
  });

  it("shows how many objectives are reached while learning", () => {
    const t = stage2[0];
    // First objective mastered (3 answers, all right), the rest untouched.
    const attempts = Array.from({ length: 4 }, () => attempt(t.id, t.objectives[0].id, true));
    const statusOf = () => "learning" as GrammarTopicStatus;
    const row = mapRows(2, [t], statusOf, attempts)[0];
    expect(row.statusText).toBe(`學習中 1/${t.objectives.length}`);
  });

  it("states mastered and due without counts", () => {
    const [a, b] = stage2;
    const rows = mapRows(2, [a, b], (id) => (id === a.id ? "mastered" : "due"), []);
    expect(rows.map((r) => r.statusText)).toEqual(["已掌握", "待複習"]);
  });

  it("flags unstarted prerequisites on a new topic, and only then", () => {
    const prereqIds = withPrereq.prerequisites.filter((p) => topicById(p));
    const allNew = mapRows(withPrereq.stage, [withPrereq], () => "new", [])[0];
    expect(allNew.lockedBy.map((p) => p.id)).toEqual(prereqIds);
    expect(lockedTooltip(allNew.lockedBy)).toContain(topicById(prereqIds[0])!.title);
    // Prerequisites touched: no lock.
    const touched = mapRows(withPrereq.stage, [withPrereq], (id) => (id === withPrereq.id ? "new" : "learning"), [])[0];
    expect(touched.lockedBy).toEqual([]);
    // The topic itself in progress: no lock either.
    const started = mapRows(withPrereq.stage, [withPrereq], () => "learning", [])[0];
    expect(started.lockedBy).toEqual([]);
  });

  it("works with the real status pass", () => {
    const statuses = topicStatuses(GRAMMAR_TOPICS, [], () => undefined, new Date());
    expect(mapRows(1, GRAMMAR_TOPICS, (id) => statuses.get(id)!, []).every((r) => r.status === "new")).toBe(true);
  });
});

describe("mistakes", () => {
  const [t1, t2] = GRAMMAR_TOPICS.filter((t) => t.stage === 1);
  const qs = [
    question("q1", t1.id, "article"),
    question("q2", t2.id, "article"),
    question("q3", t2.id, "article"),
    question("q4", t1.id, "plural"),
    question("q5", t1.id, "plural"),
    question("q6", t1.id, "agreement"), // answered right: not a mistake
  ];
  const attempts = [
    attempt(t1.id, "x", false, "2026-10-01T00:00:00Z", "q1"),
    attempt(t2.id, "x", false, "2026-10-02T00:00:00Z", "q2"),
    attempt(t2.id, "x", false, "2026-10-03T00:00:00Z", "q3"),
    attempt(t1.id, "x", false, "2026-10-04T00:00:00Z", "q4"),
    attempt(t1.id, "x", false, "2026-10-05T00:00:00Z", "q5"),
    attempt(t1.id, "x", true, "2026-10-06T00:00:00Z", "q6"),
  ];

  it("groups by error tag, biggest first, with the topic that has most of its questions", () => {
    const entries = mistakeEntries(qs, attempts);
    expect(entries.map((e) => [e.errorTag, e.count, e.topicId])).toEqual([
      ["article", 3, t2.id],
      ["plural", 2, t1.id],
    ]);
    expect(entries[0].label).toBe("冠詞");
    expect(mistakeTotal(entries)).toBe(5);
  });

  it("breaks a tie with the newest mistake's topic", () => {
    const group = {
      errorTag: "article" as const,
      items: [
        { question: question("a", t2.id, "article"), attempt: attempts[0] },
        { question: question("b", t1.id, "article"), attempt: attempts[0] },
      ],
    };
    expect(topicOfGroup(group)).toBe(t2.id);
  });

  it("has a label for every error tag in both languages", () => {
    for (const tag of ERROR_TAGS) {
      setLocale("zh-TW");
      expect(errorTagLabel(tag)).toBeTruthy();
      setLocale("en");
      expect(errorTagLabel(tag)).toMatch(/^[A-Z]/);
    }
  });
});

describe("strings", () => {
  it("fills params in both languages", () => {
    expect(gl("map.due", { n: 3 })).toBe("今天待複習 3 個主題");
    setLocale("en");
    expect(gl("map.due", { n: 3 })).toBe("3 topics to review today");
    expect(gl("map.mistakes", { n: 12 })).toBe("Mistakes (12)");
  });
});
