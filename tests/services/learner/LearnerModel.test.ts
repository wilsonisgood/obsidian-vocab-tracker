import { afterEach, describe, expect, it } from "vitest";
import { GRAMMAR_TOPICS } from "../../../src/core/grammar/catalog";
import { setLocale } from "../../../src/core/i18n";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { GrammarAttempt, GrammarProgress } from "../../../src/core/model/grammar";
import type { LearnEvent } from "../../../src/core/model/learner";
import type { SrsCard } from "../../../src/core/model/srs";
import { defaultLearnerProfile } from "../../../src/core/model/settings";
import { renderProfile, setProfileDeps } from "../../../src/services/ai/context/profile";
import { LearnerModel } from "../../../src/services/learner/LearnerModel";

const NOW = new Date("2026-10-13T08:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function card(over: Partial<SrsCard>): SrsCard {
  return { due: day(5), stability: 3, difficulty: 5, elapsedDays: 0, scheduledDays: 3, reps: 1, lapses: 0, state: 2, ...over };
}
function word(id: string, over: Partial<VocabEntry> = {}): VocabEntry {
  return { id, word: id, liked: true, ...over } as VocabEntry;
}
const ev = (id: string, focusId: string, result: LearnEvent["result"], at: string, kind: LearnEvent["focus"]["kind"] = "sense"): LearnEvent => ({
  id,
  at,
  track: kind === "sense" ? "poly" : "vocab",
  focus: { kind, id: focusId },
  result,
});

function make(opts: { vocab?: VocabEntry[]; events?: LearnEvent[]; attempts?: GrammarAttempt[]; progress?: GrammarProgress[] } = {}) {
  const events = opts.events ?? [];
  return new LearnerModel({
    vocab: () => opts.vocab ?? [],
    grammar: {
      questions: () => [],
      attempts: (topicId?: string) => (opts.attempts ?? []).filter((a) => topicId === undefined || a.topicId === topicId),
      progress: (id: string) => opts.progress?.find((p) => p.id === id),
    },
    learner: { learnEvents: (o = {}) => events.filter((e) => o.focusId === undefined || e.focus.id === o.focusId) },
    level: () => "B1",
    now: () => NOW,
  });
}

describe("LearnerModel.snapshot", () => {
  it("counts vocab by srs state", () => {
    const m = make({
      vocab: [
        word("new"),
        word("learn", { srs: card({ state: 1, due: day(-1) }) }),
        word("young", { srs: card({ state: 2, stability: 20 }) }),
        word("mature", { srs: card({ state: 2, stability: 21, due: day(-2) }) }),
        word("unliked", { liked: false, srs: card({}) }),
        word("gone", { deletedAt: day(-1), srs: card({}) }),
      ],
    });
    expect(m.snapshot().vocab).toEqual({ total: 4, learning: 2, mature: 1, due: 2 });
    expect(m.snapshot().level).toBe("B1");
    expect(m.level()).toBe("B1");
  });

  it("derives grammar status", () => {
    const [a, b, c] = GRAMMAR_TOPICS;
    const attempt = (topic: typeof a, i: number, correct: boolean): GrammarAttempt =>
      ({ id: `${topic.id}${i}`, topicId: topic.id, objectiveId: topic.objectives[0].id, correct, at: day(-1) }) as GrammarAttempt;
    const mastered = a.objectives.flatMap((o) =>
      [1, 2, 3, 4].map((i) => ({ id: `${a.id}${o.id}${i}`, topicId: a.id, objectiveId: o.id, correct: true, at: day(-1) }) as GrammarAttempt)
    );
    const m = make({
      attempts: [...mastered, attempt(b, 1, false), attempt(c, 1, true)],
      progress: [{ id: c.id, srs: card({ due: day(-1) }) } as GrammarProgress],
    });
    expect(m.snapshot().grammar).toEqual({ started: 3, mastered: 1, due: 1 });
  });

  it("counts poly senses and weak list", () => {
    const m = make({
      events: [
        ev("1", "get.arrive", "correct", day(-1)),
        ev("2", "get.obtain", "wrong", day(-1)),
        ev("3", "get.obtain", "correct", day(-2)),
        ev("4", "run.go", "skipped", day(-1)),
        ev("5", "w1", "wrong", day(-1), "word"),
      ],
    });
    const s = m.snapshot();
    expect(s.poly).toEqual({ practisedSenses: 2, weakSenses: 1 });
    expect(s.weak.map((w) => w.focus.id).sort()).toEqual(["get.obtain", "w1"]);
  });

  it("limits weak to 8", () => {
    const events = Array.from({ length: 12 }, (_, i) => ev(`e${i}`, `s${i}`, "wrong", day(-1)));
    expect(make({ events }).snapshot().weak).toHaveLength(8);
  });
});

describe("LearnerModel.focusStats", () => {
  it("counts correct / wrong and the last time, ignoring skipped / retired", () => {
    const m = make({
      events: [
        ev("1", "f", "correct", "2026-10-10T00:00:00Z"),
        ev("2", "f", "wrong", "2026-10-12T00:00:00Z"),
        ev("3", "f", "skipped", "2026-10-13T00:00:00Z"),
        ev("4", "f", "retired", "2026-10-13T01:00:00Z"),
        ev("5", "g", "wrong", "2026-10-13T01:00:00Z"),
      ],
    });
    expect(m.focusStats("f")).toEqual({ correct: 1, wrong: 1, lastAt: "2026-10-12T00:00:00Z" });
    expect(m.focusStats("none")).toEqual({ correct: 0, wrong: 0 });
  });
});

describe("LearnerModel.senseStats", () => {
  it("keeps the last 3 outcomes newest last; hinted is not right; skipped / retired ignored", () => {
    const m = make({
      events: [
        ev("1", "s", "wrong", "2026-10-01T00:00:00Z"),
        ev("2", "s", "correct", "2026-10-04T00:00:00Z"),
        ev("3", "s", "skipped", "2026-10-05T00:00:00Z"),
        ev("4", "s", "hinted", "2026-10-03T00:00:00Z"),
        ev("5", "s", "correct", "2026-10-06T00:00:00Z"),
        ev("6", "s", "retired", "2026-10-07T00:00:00Z"),
        ev("7", "w", "correct", "2026-10-06T00:00:00Z", "word"),
      ],
    });
    expect(m.senseStats("s")).toEqual({ correct: 2, wrong: 2, recent: [false, true, true] });
    expect(m.senseStats("w")).toEqual({ correct: 0, wrong: 0, recent: [] });
    expect(m.senseStats("none")).toEqual({ correct: 0, wrong: 0, recent: [] });
  });
});

describe("renderProfile learner summary", () => {
  afterEach(() => setProfileDeps({}));
  setLocale("zh-TW");

  const profile = defaultLearnerProfile();
  const model = make({
    vocab: [word("a", { srs: card({ stability: 30 }) }), word("b", { srs: card({ state: 1 }) })],
    events: [ev("1", "get.arrive", "correct", day(-1))],
  });

  it("is unchanged without deps", () => {
    expect(renderProfile(profile)).not.toContain("學習概況");
  });

  it("appends one line with deps", () => {
    const out = renderProfile(profile, { learnerModel: model });
    expect(out.split("\n").pop()).toBe("目前學習概況：已學單字 2（熟練 1） · 常用字練過 1 個意思");
    expect(out.startsWith(renderProfile(profile))).toBe(true);
  });

  it("uses the registered default deps and skips an empty summary", () => {
    setProfileDeps({ learnerModel: model });
    expect(renderProfile(profile)).toContain("學習概況");
    expect(renderProfile(profile, { learnerModel: make() })).not.toContain("學習概況");
  });
});
