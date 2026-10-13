import { afterEach, describe, expect, it, vi } from "vitest";
import { topicById } from "../../../src/core/grammar/catalog";
import type { GrammarQuestion, GrammarSighting } from "../../../src/core/model/grammar";
import { GRAMMAR_SHARD, GrammarStore } from "../../../src/services/grammar/GrammarStore";
import { gradeThreadId, QuestionService, questionThreadId } from "../../../src/services/grammar/QuestionService";
import { MemoryStorage } from "../ai/fakes";
import { FakePreparingAi, result } from "../learn/fakes";

const TOPIC = "present-perfect-vs-past";

const CHOICE = {
  objectiveId: "present-link",
  type: "choice",
  stem: "I ___ my keys. I can't get in now.",
  options: ["lost", "have lost", "had lost"],
  answer: "have lost",
  accepted: [],
  explanation: "現在進不去。",
  distractors: [{ option: "lost", why: "沒連到現在" }],
  errorTag: "tense-choice",
};
const BLANK = {
  objectiveId: "just-already-yet",
  type: "blank",
  stem: "She ___ already left.",
  options: [],
  answer: "has",
  accepted: ["'s"],
  explanation: "already 搭配完成式。",
  distractors: [],
  errorTag: "aspect",
};
const STRAY = { ...CHOICE, objectiveId: "nope", stem: "Stray ___ one." };

function setup(reply: unknown = { questions: [CHOICE, BLANK] }, words: string[] = ["apron"]) {
  const storage = new MemoryStorage();
  let tick = Date.parse("2026-10-13T08:00:00Z");
  const clock = () => new Date((tick += 1000));
  const grammar = new GrammarStore({ storage, clock });
  const ai = new FakePreparingAi(() => result(JSON.stringify(reply)));
  let seq = 0;
  const service = new QuestionService({ grammar, ai, recentWords: () => words, clock, newId: () => `id${++seq}` });
  return { storage, grammar, ai, service };
}

describe("QuestionService.generate", () => {
  afterEach(() => vi.useRealTimers());

  it("asks the AI and stores the questions", async () => {
    const { grammar, ai, service } = setup();
    const out = await service.generate(TOPIC);
    expect(out.map((q) => q.id)).toEqual(["id1", "id2"]);
    expect(out[0]).toMatchObject({ topicId: TOPIC, objectiveId: "present-link", type: "choice", rev: 1 });
    expect(out[0].createdAt).toBeTruthy();
    expect(grammar.questions(TOPIC)).toHaveLength(2);
    expect(service.pool(TOPIC)).toHaveLength(2);
    // thread id + the request it built
    expect(ai.threadIds).toEqual([questionThreadId(TOPIC)]);
    const text = ai.requests[0].system.map((b) => b.text).join("\n");
    expect(text).toContain("現在完成式與過去式");
    expect(text).toContain("〔學習者的單字〕apron");
    expect(ai.requests[0].messages[0].content).toContain("出 8 題");
  });

  it("sends no words when the callback gives none", async () => {
    const { ai, service } = setup(undefined, []);
    await service.generate(TOPIC);
    expect(ai.requests[0].system.map((b) => b.text).join("\n")).not.toContain("〔學習者的單字〕apron");
    expect(ai.requests[0].system.some((b) => b.text.startsWith("〔學習者的單字〕"))).toBe(false);
  });

  it("caps the words at 30", async () => {
    const many = Array.from({ length: 45 }, (_, i) => `word${i}`);
    const { ai, service } = setup(undefined, many);
    await service.generate(TOPIC);
    const block = ai.requests[0].system.find((b) => b.text.startsWith("〔學習者的單字〕"))!.text;
    expect(block).toContain("word29");
    expect(block).not.toContain("word30");
  });

  it("passes the topic's earlier stems so they aren't repeated, and skips repeats in the answer", async () => {
    const { grammar, ai, service } = setup({ questions: [CHOICE, BLANK] });
    await grammar.ensureLoaded();
    grammar.upsertQuestion({ id: "old", topicId: TOPIC, objectiveId: "present-link", type: "choice", stem: "I ___ MY keys.   I can't get in now.", options: ["a", "b", "c"], answer: "a", explanation: "x", errorTag: "other", retiredAt: "2026-10-01T00:00:00Z" });
    const out = await service.generate(TOPIC);
    // CHOICE matches the retired one ignoring case and spacing -> only BLANK is new
    expect(out.map((q) => q.stem)).toEqual(["She ___ already left."]);
    expect(ai.requests[0].system.map((b) => b.text).join("\n")).toContain("- I ___ MY keys. I can't get in now.");
  });

  it("is bad_output when every question is a repeat", async () => {
    const { grammar, service } = setup({ questions: [CHOICE] });
    await grammar.ensureLoaded();
    grammar.upsertQuestion({ id: "old", topicId: TOPIC, objectiveId: "present-link", type: "choice", stem: CHOICE.stem, options: ["a", "b", "c"], answer: "a", explanation: "x", errorTag: "other" });
    await expect(service.generate(TOPIC)).rejects.toMatchObject({ code: "bad_output" });
  });

  it("drops questions for objectives outside the topic; none left is bad_output with the debug info", async () => {
    const mixed = setup({ questions: [STRAY, CHOICE] });
    expect((await mixed.service.generate(TOPIC)).map((q) => q.objectiveId)).toEqual(["present-link"]);
    const bad = setup({ questions: [STRAY] });
    await expect(bad.service.generate(TOPIC)).rejects.toMatchObject({ code: "bad_output" });
    expect(bad.grammar.questions()).toEqual([]);
  });

  it("restricts the objectives and count it asks for", async () => {
    const { ai, service } = setup();
    await service.generate(TOPIC, { objectiveIds: ["present-link"], count: 4 });
    const user = ai.requests[0].messages[0].content;
    expect(user).toContain("出 4 題");
    expect(user).toContain("學習目標 id 只能用：present-link。");
  });

  it("reports busy while it runs and rejects an unknown topic", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const storage = new MemoryStorage();
    const grammar = new GrammarStore({ storage });
    const ai = new FakePreparingAi(async () => {
      await gate;
      return result(JSON.stringify({ questions: [CHOICE] }));
    });
    const service = new QuestionService({ grammar, ai });
    const busy: boolean[] = [];
    service.events.on("questions:busy", (e) => busy.push(e.busy));
    const p = service.generate(TOPIC);
    await vi.waitFor(() => expect(service.isBusy(TOPIC)).toBe(true));
    await expect(service.generate(TOPIC)).rejects.toThrow(/Already generating/);
    service.stop(TOPIC);
    expect(ai.cancelled).toEqual([questionThreadId(TOPIC)]);
    release();
    await p;
    expect(service.isBusy(TOPIC)).toBe(false);
    expect(busy).toEqual([true, false]);
    await expect(service.generate("nope")).rejects.toThrow(/Unknown grammar topic/);
  });

  it("clears busy when the AI fails", async () => {
    const storage = new MemoryStorage();
    const service = new QuestionService({
      grammar: new GrammarStore({ storage }),
      ai: new FakePreparingAi(() => result("not json at all")),
    });
    await expect(service.generate(TOPIC)).rejects.toMatchObject({ code: "bad_output" });
    expect(service.isBusy(TOPIC)).toBe(false);
  });
});

describe("QuestionService bank", () => {
  async function withBank() {
    const ctx = setup();
    await ctx.service.generate(TOPIC);
    return ctx;
  }

  it("retire hides a question from the pool but keeps it stored", async () => {
    const { grammar, service } = await withBank();
    const retired = service.retire("id1")!;
    expect(retired.retiredAt).toBeTruthy();
    expect(service.pool(TOPIC).map((q) => q.id)).toEqual(["id2"]);
    expect(grammar.questions(TOPIC)).toHaveLength(2);
    // retiring twice or an unknown id changes nothing
    const again = service.retire("id1")!;
    expect(again.retiredAt).toBe(retired.retiredAt);
    expect(service.retire("missing")).toBeUndefined();
  });

  it("record stores the attempt and stamps the topic's progress", async () => {
    const { grammar, service } = await withBank();
    const q = grammar.question("id1") as GrammarQuestion;
    const a = service.record(q, "lost", false);
    expect(a).toMatchObject({ questionId: "id1", topicId: TOPIC, objectiveId: "present-link", correct: false, given: "lost" });
    expect(grammar.attempts(TOPIC)).toHaveLength(1);
    expect(grammar.progress(TOPIC)?.lastPracticedAt).toBe(a.at);
    // an srs card already on the progress row is kept
    grammar.upsertProgress({ id: TOPIC, srs: { due: "2026-11-01T00:00:00Z" } as never, lastPracticedAt: "2026-10-01T00:00:00Z" });
    const b = service.record(q, "have lost", true);
    expect(grammar.progress(TOPIC)).toMatchObject({ lastPracticedAt: b.at, srs: { due: "2026-11-01T00:00:00Z" } });
    expect(grammar.attempts(TOPIC).map((x) => x.correct)).toEqual([false, true]);
  });

  it("everything reaches grammar.json", async () => {
    vi.useFakeTimers();
    const { storage, grammar, service } = setup();
    await service.generate(TOPIC);
    service.record(grammar.question("id1")!, "lost", false);
    await vi.advanceTimersByTimeAsync(500);
    await grammar.flush();
    const saved = storage.shards.get(GRAMMAR_SHARD) as { questions: unknown[]; attempts: unknown[]; progress: unknown[] };
    expect([saved.questions.length, saved.attempts.length, saved.progress.length]).toEqual([2, 1, 1]);
    vi.useRealTimers();
  });

  it("the knownTopicTitles it sends come from what the learner has practised", async () => {
    const { grammar, ai, service } = setup();
    await service.generate(TOPIC);
    grammar.addAttempt({ id: "a1", questionId: "x", topicId: "be-verb", objectiveId: "subject-be", at: "2026-10-01T00:00:00Z", correct: true, given: "x" });
    ai.requests.length = 0;
    // second batch is all repeats -> rejected, but the request was still built from the bank
    await expect(service.generate(TOPIC)).rejects.toMatchObject({ code: "bad_output" });
    expect(ai.requests[0].system.map((b) => b.text).join("\n")).toContain("〔已學過的文法〕be 動詞");
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

// ── R2 ────────────────────────────────────────────────────────────

const READ = "I have lost my keys and I cannot get into the house tonight.";
const sighting = (extra: Partial<GrammarSighting> = {}): GrammarSighting => ({
  topicId: TOPIC,
  threadId: "t1",
  turnId: "a1",
  path: "Books/Dune.md",
  snapshot: READ,
  at: "2026-10-01T00:00:00Z",
  ...extra,
});

describe("QuestionService.generate — reading sentences", () => {
  function withSentences(reply: unknown, opts: { use?: () => boolean; sightings?: () => GrammarSighting[] } = {}) {
    const storage = new MemoryStorage();
    const grammar = new GrammarStore({ storage });
    const ai = new FakePreparingAi(() => result(JSON.stringify(reply)));
    let seq = 0;
    const service = new QuestionService({
      grammar,
      ai,
      newId: () => `id${++seq}`,
      sightings: opts.sightings ?? (() => [sighting()]),
      useMySentences: opts.use,
    });
    return { ai, grammar, service };
  }

  it("puts the sentences in the prompt and stores the source of a question that names one", async () => {
    const { ai, service } = withSentences({ questions: [{ ...CHOICE, sourceIndex: 1 }, BLANK] });
    const out = await service.generate(TOPIC);
    const text = ai.requests[0].system.map((b) => b.text).join("\n");
    expect(text).toContain(`〔讀者讀過的句子〕\n1. ${READ}`);
    expect(text).not.toContain("Dune");
    expect(out[0].source).toEqual({ path: "Books/Dune.md", sentence: READ });
    expect(out[1].source).toBeUndefined();
  });

  it("sends no sentence when the setting is off (and doesn't even read the sightings)", async () => {
    const sightings = vi.fn(() => [sighting()]);
    const { ai, service } = withSentences({ questions: [CHOICE] }, { use: () => false, sightings });
    await service.generate(TOPIC);
    expect(ai.requests[0].system.map((b) => b.text).join("\n")).not.toContain("〔讀者讀過的句子〕\n");
    expect(sightings).not.toHaveBeenCalled();
  });

  it("is on by default, and a sightings source that throws just means no sentences", async () => {
    const on = withSentences({ questions: [CHOICE] });
    await on.service.generate(TOPIC);
    expect(on.ai.requests[0].system.some((b) => b.text.startsWith("〔讀者讀過的句子〕"))).toBe(true);
    const broken = withSentences({ questions: [CHOICE] }, {
      sightings: () => {
        throw new Error("boom");
      },
    });
    await broken.service.generate(TOPIC);
    expect(broken.ai.requests[0].system.some((b) => b.text.startsWith("〔讀者讀過的句子〕"))).toBe(false);
  });

  it("ignores sightings of other topics", async () => {
    const { ai, service } = withSentences({ questions: [CHOICE] }, { sightings: () => [sighting({ topicId: "past-simple" })] });
    await service.generate(TOPIC);
    expect(ai.requests[0].system.some((b) => b.text.startsWith("〔讀者讀過的句子〕"))).toBe(false);
  });
});

describe("QuestionService.generate — open questions", () => {
  const REWRITE = {
    objectiveId: "present-link",
    type: "rewrite",
    stem: "改寫成現在完成式：I lost my keys.",
    options: [],
    answer: "I have lost my keys.",
    accepted: [],
    explanation: "結果連到現在。",
    distractors: [],
    errorTag: "tense-choice",
    sourceIndex: 0,
  };

  it("stores a rewrite question from a topic of difficulty >= 4", async () => {
    const { service, grammar } = setup({ questions: [CHOICE, REWRITE] });
    const out = await service.generate(TOPIC);
    expect(out.map((q) => q.type)).toEqual(["choice", "rewrite"]);
    expect(grammar.question(out[1].id)).toMatchObject({ type: "rewrite", answer: "I have lost my keys." });
  });

  it("drops it on a topic below difficulty 4", async () => {
    const low = topicById("past-simple")!;
    const objective = low.objectives[0].id;
    const { service } = setup({ questions: [{ ...REWRITE, objectiveId: objective }, { ...CHOICE, objectiveId: objective }] });
    const out = await service.generate(low.id);
    expect(out.map((q) => q.type)).toEqual(["choice"]);
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
