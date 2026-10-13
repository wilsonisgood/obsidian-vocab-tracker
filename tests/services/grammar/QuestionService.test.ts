import { afterEach, describe, expect, it, vi } from "vitest";
import type { GrammarQuestion } from "../../../src/core/model/grammar";
import { GRAMMAR_SHARD, GrammarStore } from "../../../src/services/grammar/GrammarStore";
import { QuestionService, questionThreadId } from "../../../src/services/grammar/QuestionService";
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
