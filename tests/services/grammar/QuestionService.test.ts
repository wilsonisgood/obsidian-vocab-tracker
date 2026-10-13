import { describe, expect, it, vi } from "vitest";
import { topicById } from "../../../src/core/grammar/catalog";
import { migrateGrammar } from "../../../src/core/learner/migrateGrammar";
import type { GrammarQuestion, GrammarSighting } from "../../../src/core/model/grammar";
import { GRAMMAR_SHARD, GrammarStore } from "../../../src/services/grammar/GrammarStore";
import { gradeThreadId, questionLine, QuestionService, REFILL_THREAD_ID, questionThreadId } from "../../../src/services/grammar/QuestionService";
import { LearnerStore } from "../../../src/services/learner/LearnerStore";
import { MemoryStorage } from "../ai/fakes";
import { FakePreparingAi, result } from "../learn/fakes";

const TOPIC = "present-perfect-vs-past";
const FILTER = { stages: [2 as const], topics: [TOPIC] };
const OBJECTIVES = ["present-link", "just-already-yet", "finished-time"];

// A scenario reply with n choice questions "Sentence k ____ here."
function scenario(n = 6, extra: { lead?: boolean; blank?: number } = {}) {
  const turns: unknown[] = [];
  if (extra.lead) turns.push({ speaker: "Ben", text: "Hi Amy, how are you?", ask: [] });
  for (let k = 1; k <= n; k++) {
    turns.push({
      speaker: k % 2 ? "Amy" : "Ben",
      text: "",
      ask: [
        {
          objectiveId: OBJECTIVES[(k - 1) % 3],
          topicId: TOPIC,
          type: extra.blank === k ? "blank" : "choice",
          stem: `Sentence ${k} ____ here.`,
          options: ["a", "b", "c"],
          answer: "a",
          accepted: [],
          explanation: `解釋 ${k}`,
          distractors: [{ option: "b", why: "不對" }],
          sentenceZh: `第 ${k} 句`,
          errorTag: "tense-choice",
          sourceIndex: 0,
        },
      ],
    });
  }
  return { scene: "在咖啡店", form: "dialogue", speakers: ["Amy", "Ben"], turns };
}

class StatusAi extends FakePreparingAi {
  state = "ready";
  status() {
    return this.state;
  }
}

function setup(reply: unknown = scenario(), opts: { sightings?: () => GrammarSighting[]; useMySentences?: () => boolean } = {}) {
  const storage = new MemoryStorage();
  let tick = Date.parse("2026-10-13T08:00:00Z");
  const clock = () => new Date((tick += 1000));
  const grammar = new GrammarStore({ storage, clock });
  const learner = new LearnerStore({ storage, clock });
  const ai = new StatusAi(() => result(JSON.stringify(typeof reply === "function" ? (reply as () => unknown)() : reply)));
  let seq = 0;
  const events: string[] = [];
  const service = new QuestionService({ grammar, learner, ai, level: () => "B1", clock, newId: () => `id${++seq}`, recentWords: () => ["apron"], ...opts });
  service.events.on("pool:change", () => events.push("pool"));
  service.events.on("refill:start", () => events.push("start"));
  service.events.on("refill:end", (e) => events.push(e.error ? "end:error" : "end"));
  return { storage, grammar, learner, ai, service, events };
}

async function filled(reply?: unknown) {
  const ctx = setup(reply);
  await ctx.learner.ensureLoaded();
  await ctx.service.refill(FILTER);
  return ctx;
}

const events = (l: LearnerStore) => l.learnEvents({ track: "grammar" });

describe("QuestionService.refill", () => {
  it("asks for one scenario, stores it and puts it in the pool", async () => {
    const { grammar, learner, ai, service, events: ev } = await filled(scenario(6, { lead: true }));
    expect(ai.threadIds).toEqual([REFILL_THREAD_ID]);
    const pool = service.poolQuestions();
    expect(pool.map((q) => q.id)).toEqual(["id2", "id3", "id4", "id5", "id6", "id7"]);
    expect(pool[0]).toMatchObject({
      topicId: TOPIC,
      type: "choice",
      sentenceZh: "第 1 句",
      scenario: { id: "id1".replace("id1", pool[0].scenario!.id), scene: "在咖啡店", seq: 1, speaker: "Amy", lead: [{ speaker: "Ben", text: "Hi Amy, how are you?" }] },
    });
    expect(pool[0].scenario!.id).toMatch(/^sc-/);
    expect(new Set(pool.map((q) => q.scenario!.id)).size).toBe(1);
    expect(pool.map((q) => q.scenario!.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(grammar.questions(TOPIC)).toHaveLength(6);
    expect(learner.pool("grammar").map((i) => i.questionId)).toEqual(pool.map((q) => q.id));
    expect(learner.pool("grammar")[0].scenarioId).toBe(pool[0].scenario!.id);
    expect(ev).toEqual(["start", "end", "pool"]);
    // prompt: the objectives and words reach the AI
    const text = ai.requests[0].system.map((b) => b.text).join("\n") + ai.requests[0].messages[0].content;
    expect(text).toContain(`${TOPIC}/present-link｜`);
    expect(text).toContain("〔已學單字〕apron");
    expect(ai.requests[0].messages[0].content).toContain("出 6 題");
  });

  it("does nothing while the pool holds more than 4, when AI is off, or without a learner", async () => {
    const ctx = await filled();
    await ctx.service.refill(FILTER);
    expect(ctx.ai.requests).toHaveLength(1);
    // down to 5: still no refill
    ctx.service.skip(ctx.service.poolQuestions()[0]);
    await ctx.service.refill(FILTER);
    expect(ctx.ai.requests).toHaveLength(1);

    const off = setup();
    await off.learner.ensureLoaded();
    off.ai.state = "off";
    await off.service.refill(FILTER);
    expect(off.ai.requests).toHaveLength(0);
    expect(off.events).toEqual([]);

    const bare = new QuestionService({ grammar: new GrammarStore({ storage: new MemoryStorage() }), ai: off.ai });
    await bare.refill(FILTER);
    expect(bare.poolQuestions()).toEqual([]);
  });

  it("refills again at 4 or fewer, only up to the room left (max 6 a time)", async () => {
    const ctx = await filled();
    for (const q of ctx.service.poolQuestions().slice(0, 2)) ctx.service.skip(q);
    expect(ctx.service.poolQuestions()).toHaveLength(4);
    ctx.ai.script = () => result(JSON.stringify(scenario(6)));
    // the new batch repeats the old stems -> every question is a repeat
    await ctx.service.refill(FILTER);
    expect(ctx.ai.requests).toHaveLength(2);
    expect(ctx.events.at(-1)).toBe("end:error");
  });

  it("never runs two refills at once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ctx = setup();
    await ctx.learner.ensureLoaded();
    ctx.ai.script = async () => {
      await gate;
      return result(JSON.stringify(scenario()));
    };
    const a = ctx.service.refill(FILTER);
    await vi.waitFor(() => expect(ctx.service.isRefilling()).toBe(true));
    await ctx.service.refill(FILTER);
    release();
    await a;
    expect(ctx.ai.requests).toHaveLength(1);
    expect(ctx.service.isRefilling()).toBe(false);
  });

  it("filter changed while the AI was writing: questions the new filter doesn't allow stay out of the pool (第十八波 T)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ctx = setup();
    await ctx.learner.ensureLoaded();
    ctx.ai.script = async () => {
      await gate;
      return result(JSON.stringify(scenario()));
    };
    ctx.service.applyFilter(FILTER);
    const v0 = ctx.service.scopeVersion();
    const run = ctx.service.refill(FILTER);
    await vi.waitFor(() => expect(ctx.service.isRefilling()).toBe(true));
    ctx.service.applyFilter({ stages: [1], topics: ["be-verb"] });
    expect(ctx.service.scopeVersion()).toBe(v0 + 1);
    release();
    await run;
    expect(ctx.service.poolQuestions()).toHaveLength(0);
    expect(ctx.events).toContain("end");
  });

  it("reports a failure through refill:end instead of throwing", async () => {
    const ctx = setup("not json");
    await ctx.learner.ensureLoaded();
    await expect(ctx.service.refill(FILTER)).resolves.toBeUndefined();
    expect(ctx.events).toEqual(["start", "end:error"]);
    expect(ctx.service.isRefilling()).toBe(false);
    expect(ctx.service.poolQuestions()).toEqual([]);
  });

  it("drops blank questions the AI still writes", async () => {
    const ctx = await filled(scenario(6, { blank: 3 }));
    expect(ctx.service.poolQuestions().map((q) => q.stem)).not.toContain("Sentence 3 ____ here.");
    expect(ctx.service.poolQuestions()).toHaveLength(5);
  });

  it("carries on from the pool's last scenario and sends the learner's weak spots", async () => {
    const ctx = await filled();
    const [first, second, ...rest] = ctx.service.poolQuestions();
    ctx.service.answer(first, "b", false, { hinted: false, fromMistakes: false });
    ctx.service.answer(second, "a", true, { hinted: false, fromMistakes: false });
    expect(rest).toHaveLength(4);
    ctx.ai.script = () => result(JSON.stringify({ ...scenario(6), turns: scenario(6).turns.map((t, i) => ({ ...(t as object), ask: [{ ...(t as { ask: object[] }).ask[0], stem: `Next ${i} ____ now.` }] })) }));
    await ctx.service.refill(FILTER);
    const sys = ctx.ai.requests[1].system.map((b) => b.text).join("\n");
    expect(sys).toContain("〔上一段〕\n場景：在咖啡店\n最後兩句：\n- Amy: Sentence 5 a here.\n- Ben: Sentence 6 a here.");
    expect(sys).toContain(`〔學習弱點〕\n${TOPIC}/present-link（`);
    expect(sys).toContain("錯 1 次");
    expect(ctx.service.poolQuestions()).toHaveLength(10);
  });

  it("only sends reading sentences when the setting allows", async () => {
    const sighting: GrammarSighting = { topicId: TOPIC, threadId: "t", turnId: "a", path: "Books/Dune.md", snapshot: "I have lost my keys and I cannot get into the house tonight.", at: "2026-10-01T00:00:00Z" };
    const on = setup(scenario(), { sightings: () => [sighting] });
    await on.learner.ensureLoaded();
    await on.service.refill(FILTER);
    const sys = on.ai.requests[0].system.map((b) => b.text).join("\n");
    expect(sys).toContain("〔讀者讀過的句子〕\n1. I have lost my keys");
    expect(sys).not.toContain("Dune");
    const off = setup(scenario(), { sightings: () => [sighting], useMySentences: () => false });
    await off.learner.ensureLoaded();
    await off.service.refill(FILTER);
    expect(off.ai.requests[0].system.map((b) => b.text).join("\n")).not.toContain("〔讀者讀過的句子〕\n");
  });

  it("migrated blank / retired questions leave the pool so they don't block a refill", async () => {
    const ctx = setup();
    await ctx.learner.ensureLoaded();
    await ctx.grammar.ensureLoaded();
    for (let i = 0; i < 5; i++) {
      ctx.grammar.upsertQuestion({ id: `old${i}`, topicId: TOPIC, objectiveId: "present-link", type: "blank", stem: `Old ${i} ___.`, answer: "x", explanation: "", errorTag: "other" });
    }
    ctx.learner.migrateFromGrammar(ctx.grammar.questions(), []);
    expect(ctx.learner.pool("grammar")).toHaveLength(5);
    expect(ctx.service.poolQuestions()).toEqual([]);
    await ctx.service.refill(FILTER);
    expect(ctx.ai.requests).toHaveLength(1);
    expect(ctx.learner.pool("grammar")).toHaveLength(6);
  });
});

describe("QuestionService.answer", () => {
  it("a wrong answer: attempt + event + out of the pool + into the 錯題區", async () => {
    const { grammar, learner, service } = await filled();
    const q = service.poolQuestions()[0];
    service.answer(q, "b", false, { hinted: false, fromMistakes: false });
    const [attempt] = grammar.attempts(TOPIC);
    expect(attempt).toMatchObject({ questionId: q.id, correct: false, given: "b" });
    expect(events(learner)).toEqual([
      { id: `g:${attempt.id}`, at: attempt.at, track: "grammar", focus: { kind: "grammar-objective", id: `${TOPIC}/present-link` }, result: "wrong", given: "b", errorTag: "tense-choice", questionId: q.id },
    ]);
    expect(service.poolQuestions().map((x) => x.id)).not.toContain(q.id);
    expect(service.mistakeQuestions().map((x) => x.id)).toEqual([q.id]);
    expect(learner.pool("grammar")).toHaveLength(5);
  });

  it("a right answer leaves the pool and makes no mistake; hinted records 'hinted'", async () => {
    const { learner, service } = await filled();
    const [a, b] = service.poolQuestions();
    service.answer(a, "a", true, { hinted: false, fromMistakes: false });
    service.answer(b, "a", true, { hinted: true, fromMistakes: false });
    expect(events(learner).map((e) => e.result)).toEqual(["correct", "hinted"]);
    expect(events(learner)[0].errorTag).toBeUndefined();
    expect(service.mistakeQuestions()).toEqual([]);
    expect(service.poolQuestions()).toHaveLength(4);
  });

  it("a wrong answer after using the hint records 'wrong', not 'hinted'", async () => {
    const { learner, service } = await filled();
    const [a] = service.poolQuestions();
    service.answer(a, "b", false, { hinted: true, fromMistakes: false });
    expect(events(learner).map((e) => e.result)).toEqual(["wrong"]);
  });

  it("a redo from the 錯題區 resolves on a right answer and never touches the pool", async () => {
    const { learner, service } = await filled();
    const q = service.poolQuestions()[0];
    service.answer(q, "b", false, { hinted: false, fromMistakes: false });
    const before = learner.pool("grammar").length;
    // wrong again: stays open
    service.answer(q, "c", false, { hinted: false, fromMistakes: true });
    expect(service.mistakeQuestions()).toHaveLength(1);
    // right but with a hint: stays open
    service.answer(q, "a", true, { hinted: true, fromMistakes: true });
    expect(service.mistakeQuestions()).toHaveLength(1);
    service.answer(q, "a", true, { hinted: false, fromMistakes: true });
    expect(service.mistakeQuestions()).toEqual([]);
    expect(learner.pool("grammar")).toHaveLength(before);
    // wrong later: the same mistake opens again
    service.answer(q, "b", false, { hinted: false, fromMistakes: true });
    expect(service.mistakeQuestions().map((x) => x.id)).toEqual([q.id]);
    expect(learner.mistake(`grammar:${q.id}`)?.resolvedAt).toBeUndefined();
  });

  it("event ids follow the migration's scheme (g:<attempt id>), so a migration run never duplicates them", async () => {
    const { grammar, learner, service } = await filled();
    const q = service.poolQuestions()[0];
    service.answer(q, "b", false, { hinted: false, fromMistakes: false });
    const m = migrateGrammar(grammar.questions(), grammar.attempts(), new Date());
    expect(m.events.map((e) => e.id)).toEqual(events(learner).map((e) => e.id));
    expect(m.events[0]).toMatchObject({ result: "wrong", given: "b", errorTag: "tense-choice", questionId: q.id });
  });

  it("works with the older QuestionService callers (no learner): only the attempt is written", () => {
    const grammar = new GrammarStore({ storage: new MemoryStorage() });
    const service = new QuestionService({ grammar, ai: new FakePreparingAi(() => result("{}")) });
    const q = grammar.upsertQuestion({ id: "q", topicId: TOPIC, objectiveId: "present-link", type: "choice", stem: "x ____", options: ["a", "b", "c"], answer: "a", explanation: "", errorTag: "other" });
    service.answer(q, "a", true, { hinted: false, fromMistakes: false });
    expect(grammar.attempts()).toHaveLength(1);
  });
});

describe("QuestionService skip / retire / applyFilter", () => {
  it("skip writes a skipped event and takes the question out of the pool, with no attempt", async () => {
    const { grammar, learner, service, events: ev } = await filled();
    const q = service.poolQuestions()[0];
    ev.length = 0;
    service.skip(q);
    expect(events(learner)).toMatchObject([{ result: "skipped", questionId: q.id, focus: { id: `${TOPIC}/present-link` } }]);
    expect(grammar.attempts()).toEqual([]);
    expect(learner.pool("grammar")).toHaveLength(5);
    expect(ev).toEqual(["pool"]);
    // skipping it again changes nothing in the pool
    service.skip(q);
    expect(learner.pool("grammar")).toHaveLength(5);
  });

  it("retire (a question or its id) keeps the old behaviour and also leaves pool and 錯題區", async () => {
    const { grammar, learner, service } = await filled();
    const [a, b] = service.poolQuestions();
    service.answer(a, "b", false, { hinted: false, fromMistakes: false });
    expect(service.mistakeQuestions()).toHaveLength(1);
    const retired = service.retire(a)!;
    expect(retired.retiredAt).toBeTruthy();
    expect(service.mistakeQuestions()).toEqual([]);
    service.retire(b.id);
    expect(grammar.question(b.id)!.retiredAt).toBeTruthy();
    expect(service.poolQuestions().map((q) => q.id)).not.toContain(b.id);
    expect(events(learner).map((e) => e.result)).toEqual(["wrong", "retired", "retired"]);
    // again / unknown: nothing more
    expect(service.retire(a)!.retiredAt).toBe(retired.retiredAt);
    expect(service.retire("missing")).toBeUndefined();
    expect(grammar.questions(TOPIC)).toHaveLength(6);
  });

  it("applyFilter moves pool questions outside the filter out as 'filtered', without events", async () => {
    const { learner, grammar, service, events: ev } = await filled();
    const q = service.poolQuestions()[0];
    grammar.upsertQuestion({ ...q, topicId: "past-simple", objectiveId: topicById("past-simple")!.objectives[0].id });
    ev.length = 0;
    service.applyFilter(FILTER);
    expect(service.poolQuestions()).toHaveLength(5);
    expect(learner.pool("grammar")).toHaveLength(5);
    expect(events(learner)).toEqual([]);
    expect(ev).toEqual(["pool"]);
    // nothing outside any more: no change event
    ev.length = 0;
    service.applyFilter(FILTER);
    expect(ev).toEqual([]);
    // the whole stage-2 list also keeps it out of stage 1
    service.applyFilter({ stages: [3], topics: [] });
    expect(service.poolQuestions()).toEqual([]);
  });
});

describe("QuestionService scenario end", () => {
  it("the last question leaving the pool schedules each topic of the scenario once", async () => {
    const { grammar, service } = await filled();
    const qs = service.poolQuestions();
    for (const q of qs.slice(0, 5)) service.answer(q, "a", true, { hinted: false, fromMistakes: false });
    expect(grammar.progress(TOPIC)?.srs).toBeUndefined();
    service.answer(qs[5], "a", true, { hinted: false, fromMistakes: false });
    const srs = grammar.progress(TOPIC)?.srs;
    expect(srs?.reps).toBe(1);
    // the pool is empty now, nothing more is scheduled by leaving again
    service.skip(qs[5]);
    expect(grammar.progress(TOPIC)?.srs?.reps).toBe(1);
  });

  it("a skipped or retired last question also closes the scenario; 👎 answers don't count", async () => {
    const { grammar, service } = await filled();
    const qs = service.poolQuestions();
    service.answer(qs[0], "b", false, { hinted: false, fromMistakes: false });
    service.retire(qs[0]);
    for (const q of qs.slice(1, 5)) service.answer(q, "a", true, { hinted: false, fromMistakes: false });
    service.skip(qs[5]);
    // 4 right answers, the wrong one was retired, one skipped
    expect(grammar.progress(TOPIC)?.srs?.reps).toBe(1);
  });

  it("a redo from the 錯題區 doesn't close anything", async () => {
    const { grammar, service } = await filled();
    const qs = service.poolQuestions();
    service.answer(qs[0], "b", false, { hinted: false, fromMistakes: false });
    service.answer(qs[0], "a", true, { hinted: false, fromMistakes: true });
    expect(grammar.progress(TOPIC)?.srs).toBeUndefined();
  });

  it("two scenarios in the pool close one after the other", async () => {
    const ctx = await filled();
    const first = ctx.service.poolQuestions();
    for (const q of first.slice(0, 3)) ctx.service.skip(q);
    ctx.ai.script = () => result(JSON.stringify({ ...scenario(6), turns: scenario(6).turns.map((t, i) => ({ ...(t as object), ask: [{ ...(t as { ask: object[] }).ask[0], stem: `Second ${i} ____ now.` }] })) }));
    await ctx.service.refill(FILTER);
    // the first scenario's 3 left are still there -> not closed
    for (const q of first.slice(3)) ctx.service.answer(q, "a", true, { hinted: false, fromMistakes: false });
    expect(ctx.grammar.progress(TOPIC)?.srs?.reps).toBe(1);
    for (const q of ctx.service.poolQuestions()) ctx.service.answer(q, "a", true, { hinted: false, fromMistakes: false });
    expect(ctx.grammar.progress(TOPIC)?.srs?.reps).toBe(2);
  });
});

describe("QuestionService.generate (older entry point)", () => {
  it("stores a scenario for one topic in the bank without touching the pool", async () => {
    const { grammar, learner, ai, service } = setup(scenario(4));
    const out = await service.generate(TOPIC, { count: 4 });
    expect(out).toHaveLength(4);
    expect(grammar.questions(TOPIC)).toHaveLength(4);
    expect(service.pool(TOPIC)).toHaveLength(4);
    expect(learner.pool("grammar")).toEqual([]);
    expect(ai.threadIds).toEqual([questionThreadId(TOPIC)]);
    expect(ai.requests[0].messages[0].content).toContain("出 4 題");
  });

  it("is bad_output when every question is a repeat; busy is reported and cleared", async () => {
    const { service } = setup(scenario(2));
    const busy: boolean[] = [];
    service.events.on("questions:busy", (e) => busy.push(e.busy));
    await service.generate(TOPIC);
    await expect(service.generate(TOPIC)).rejects.toMatchObject({ code: "bad_output" });
    expect(service.isBusy(TOPIC)).toBe(false);
    expect(busy).toEqual([true, false, true, false]);
    await expect(service.generate("nope")).rejects.toThrow(/Unknown grammar topic/);
  });
});

describe("questionLine / mapping", () => {
  it("puts the answer back and names the speaker", () => {
    const base = { id: "q", topicId: TOPIC, objectiveId: "x", explanation: "", errorTag: "other" as const };
    expect(questionLine({ ...base, type: "choice", stem: "I ____ it.", answer: "saw", scenario: { id: "s", scene: "x", seq: 1, speaker: "Amy" } })).toBe("Amy: I saw it.");
    expect(questionLine({ ...base, type: "find-error", stem: "He go home.", answer: "go", accepted: ["goes"] })).toBe("He goes home.");
  });
});

describe("QuestionService bank", () => {
  it("record stores the attempt and stamps the topic's progress", async () => {
    const { grammar, service } = await filled();
    const q = grammar.question(service.poolQuestions()[0].id) as GrammarQuestion;
    const a = service.record(q, "lost", false);
    expect(a).toMatchObject({ questionId: q.id, topicId: TOPIC, correct: false, given: "lost" });
    expect(grammar.progress(TOPIC)?.lastPracticedAt).toBe(a.at);
    grammar.upsertProgress({ id: TOPIC, srs: { due: "2026-11-01T00:00:00Z" } as never, lastPracticedAt: "2026-10-01T00:00:00Z" });
    const b = service.record(q, "have lost", true);
    expect(grammar.progress(TOPIC)).toMatchObject({ lastPracticedAt: b.at, srs: { due: "2026-11-01T00:00:00Z" } });
  });

  it("everything reaches grammar.json and learner.json", async () => {
    vi.useFakeTimers();
    const { storage, grammar, learner, service } = setup();
    await learner.ensureLoaded();
    await service.refill(FILTER);
    service.answer(service.poolQuestions()[0], "b", false, { hinted: false, fromMistakes: false });
    await vi.advanceTimersByTimeAsync(500);
    await grammar.flush();
    await learner.flush();
    const g = storage.shards.get(GRAMMAR_SHARD) as { questions: unknown[]; attempts: unknown[] };
    expect([g.questions.length, g.attempts.length]).toEqual([6, 1]);
    const l = storage.shards.get("learner") as { events: unknown[]; pool: unknown[]; mistakes: unknown[] };
    expect([l.events.length, l.pool.length, l.mistakes.length]).toEqual([1, 6, 1]);
    vi.useRealTimers();
  });
});

describe("QuestionService.finishSession", () => {
  const NOW = new Date("2026-10-13T08:00:00Z");
  const run = (correct: number, total: number) => Array.from({ length: total }, (_, i) => ({ correct: i < correct }));

  it("rates the round and writes progress.srs", () => {
    const { grammar, service } = setup();
    const srs = service.finishSession(TOPIC, run(6, 6), NOW)!;
    expect(grammar.progress(TOPIC)).toMatchObject({ srs, lastPracticedAt: NOW.toISOString() });
    expect(new Date(srs.due).getTime()).toBeGreaterThan(NOW.getTime() + 86_400_000);
    expect(srs.reps).toBe(1);
  });

  it("only counts answers that stayed in the round (👎 ones are left out)", () => {
    const { service } = setup();
    // 6 right + 3 wrong that were all retired = a perfect, Easy-sized round
    const withRetired = service.finishSession(TOPIC, [...run(6, 6), ...Array.from({ length: 3 }, () => ({ correct: false, retired: true }))], NOW)!;
    const clean = setup().service.finishSession(TOPIC, run(6, 6), NOW)!;
    expect(withRetired.due).toBe(clean.due);
    // nothing but retired answers = nothing to schedule
    const { grammar, service: s2 } = setup();
    expect(s2.finishSession(TOPIC, [{ correct: true, retired: true }], NOW)).toBeUndefined();
    expect(grammar.progress(TOPIC)).toBeUndefined();
  });

  it("does not schedule a mistakes round, an empty round or an unknown topic", () => {
    const { grammar, service } = setup();
    expect(service.finishSession(TOPIC, run(5, 5), NOW, "mistakes")).toBeUndefined();
    expect(service.finishSession(TOPIC, [], NOW)).toBeUndefined();
    expect(service.finishSession("nope", run(5, 5), NOW)).toBeUndefined();
    expect(grammar.progress(TOPIC)).toBeUndefined();
  });

  it("a review round builds on the stored card and uses the retention setting", () => {
    const first = setup().service.finishSession(TOPIC, run(5, 5), NOW)!;
    const later = new Date(first.due);
    const mk = (retention?: () => number) => {
      const storage = new MemoryStorage();
      const grammar = new GrammarStore({ storage });
      grammar.upsertProgress({ id: TOPIC, srs: first });
      return new QuestionService({ grammar, ai: new FakePreparingAi(() => result("{}")), retention });
    };
    const normal = mk().finishSession(TOPIC, run(5, 5), later, "review")!;
    expect(normal.reps).toBe(2);
    expect(new Date(normal.due).getTime() - later.getTime()).toBeGreaterThan(new Date(first.due).getTime() - NOW.getTime());
    const strict = mk(() => 0.97).finishSession(TOPIC, run(5, 5), later, "review")!;
    expect(new Date(strict.due).getTime()).toBeLessThan(new Date(normal.due).getTime());
    // a nonsense retention falls back to the default
    expect(mk(() => 5).finishSession(TOPIC, run(5, 5), later, "review")!.due).toBe(normal.due);
  });

  it("the topic reads as due once its card falls due", () => {
    const { grammar, service } = setup();
    const srs = service.finishSession(TOPIC, run(5, 5), NOW)!;
    expect(new Date(srs.due).getTime()).toBeGreaterThan(NOW.getTime());
    expect(grammar.progress(TOPIC)?.srs?.due).toBe(srs.due);
  });
});


describe("QuestionService.grade", () => {
  const OPEN: GrammarQuestion = {
    id: "q-open",
    topicId: TOPIC,
    objectiveId: "present-link",
    type: "rewrite",
    stem: "改寫成現在完成式：I lost my keys.",
    answer: "I have lost my keys.",
    explanation: "x",
    errorTag: "tense-choice",
  };

  it("runs grammar.grade on its own thread and returns the verdict", async () => {
    const { ai, service } = setup({ correct: false, feedback: "要用 have lost", corrected: "I have lost my keys." });
    const v = await service.grade(OPEN, "I lost my keys");
    expect(v).toEqual({ correct: false, feedback: "要用 have lost", corrected: "I have lost my keys." });
    expect(ai.threadIds).toEqual([gradeThreadId("q-open")]);
    expect(ai.requests[0].messages[0].content).toContain("I lost my keys");
    expect(ai.requests[0].tier).toBe("fast");
  });

  it("an unreadable verdict is bad_output with the debug info", async () => {
    const { service } = setup({ nope: 1 });
    await expect(service.grade(OPEN, "x")).rejects.toMatchObject({ code: "bad_output" });
  });

  it("stopGrade cancels that question's request", () => {
    const { ai, service } = setup();
    service.stopGrade("q-open");
    expect(ai.cancelled).toEqual([gradeThreadId("q-open")]);
  });
});
