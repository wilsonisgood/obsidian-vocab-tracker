import { beforeEach, describe, expect, it } from "vitest";
import { GRAMMAR_TOPICS, topicById } from "../../../src/core/grammar/catalog";
import { topicStatuses } from "../../../src/core/grammar/progress";
import { setLocale, t } from "../../../src/core/i18n";
import type { GrammarAttempt, GrammarQuestion, GrammarTopicStatus } from "../../../src/core/model/grammar";
import {
  defaultStage,
  lockedTooltip,
  mapRows,
  parseMapParams,
  stageOfDifficulty,
} from "../../../src/ui/blocks/grammarMapModel";

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

describe("strings", () => {
  it("fills params in both languages", () => {
    expect(t("grammar.map.due", { n: 3 })).toBe("今天待複習 3 個主題");
    setLocale("en");
    expect(t("grammar.map.due", { n: 3 })).toBe("3 topics to review today");
    expect(t("grammar.map.mistakes", { n: 12 })).toBe("Mistakes (12)");
  });
});
