import { describe, expect, it } from "vitest";
import type { PolySense } from "../../../src/core/model/poly";
import type { PracticeQuestion } from "../../../src/core/model/practice";
import { POOL_SIZE } from "../../../src/core/practice/pool";
import { LearnerStore } from "../../../src/services/learner/LearnerStore";
import { practiceLine, refillThreadId, ScenarioService } from "../../../src/services/practice/ScenarioService";
import type { ScenarioRequest } from "../../../src/services/practice/scenarioApi";
import { MemoryStorage } from "../ai/fakes";
import { FakePreparingAi, result } from "../learn/fakes";

const sense = (id: string, zh: string): PolySense => {
  const [word, slug] = id.split(".");
  return { id, word, zh, example: `${word} ${slug}`, cue: `線索 ${slug}`, level: 1 };
};
const ARRIVE = sense("get.arrive", "到達");
const OBTAIN = sense("get.obtain", "得到");
const BECOME = sense("get.become", "變得");
const POLY: ScenarioRequest = { track: "poly", tested: [ARRIVE, OBTAIN], reference: [BECOME] };
const VOCAB: ScenarioRequest = { track: "vocab", words: [{ id: "e1", word: "reluctant", zh: "不情願的", pos: "adj." }] };

const polyAsk = (k: number) => ({
  focusId: k % 2 ? "get.arrive" : "get.obtain",
  kind: "which-sense",
  text: `Sentence number ${k}: please [[get]] it done today.`,
  options: [ARRIVE, OBTAIN, BECOME].map((s) => ({ id: s.id, text: s.zh })),
  answerId: k % 2 ? "get.arrive" : "get.obtain",
  explanation: `解釋 ${k}`,
  optionNotes: [{ id: "get.become", note: "不對" }],
  sentenceZh: `第 ${k} 句`,
  errorTag: "sense-confusion",
});
const vocabAsk = (k: number) => ({
  focusId: "e1",
  kind: "which-sense",
  text: `He was [[reluctant]] to leave the party number ${k}.`,
  options: ["a", "b", "c"].map((id, i) => ({ id, text: ["不情願的", "熱心的", "生氣的"][i] })),
  answerId: "a",
  explanation: "解釋",
  optionNotes: [],
  sentenceZh: "他",
  errorTag: "meaning",
});

function scenario(n: number, ask: (k: number) => unknown, lead = false) {
  const turns: unknown[] = [];
  if (lead) turns.push({ speaker: "Ben", text: "Hi Amy.", ask: [] });
  for (let k = 1; k <= n; k++) turns.push({ speaker: k % 2 ? "Amy" : "Ben", text: "", ask: [ask(k)] });
  return { scene: "回家路上", form: "dialogue", speakers: ["Amy", "Ben"], turns };
}

class StatusAi extends FakePreparingAi {
  state = "ready";
  status() {
    return this.state;
  }
}

function setup(reply: unknown = scenario(6, polyAsk, true)) {
  const storage = new MemoryStorage();
  let tick = Date.parse("2026-10-13T08:00:00Z");
  const clock = () => new Date((tick += 1000));
  const learner = new LearnerStore({ storage, clock });
  const ai = new StatusAi(() => result(JSON.stringify(typeof reply === "function" ? (reply as () => unknown)() : reply)));
  let seq = 0;
  const rated: string[] = [];
  const service = new ScenarioService({ ai, learner, clock, newId: () => `id${++seq}`, recentWords: () => ["apron"], rateVocabAgain: (id) => rated.push(id) });
  const ev: string[] = [];
  service.events.on("pool:change", (t) => ev.push(`pool:${t}`));
  service.events.on("refill:start", (t) => ev.push(`start:${t}`));
  service.events.on("refill:end", (e) => ev.push(e.error ? `end:${e.track}:error` : `end:${e.track}`));
  return { storage, learner, ai, service, rated, ev, clock };
}

async function filled(req: ScenarioRequest = POLY, reply?: unknown) {
  const ctx = reply === undefined ? setup() : setup(reply);
  await ctx.learner.ensureLoaded();
  await ctx.service.refill(req);
  return ctx;
}

describe("ScenarioService.refill", () => {
  it("makes 6 questions, stores them and fills the pool in order", async () => {
    const { learner, ai, service, ev } = await filled();
    expect(ai.threadIds).toEqual([refillThreadId("poly")]);
    expect(ai.requests[0].messages.at(-1)!.content).toContain("出 6 題");
    const pool = service.poolQuestions("poly");
    expect(pool).toHaveLength(6);
    expect(pool[0]).toMatchObject({
      track: "poly",
      kind: "which-sense",
      focus: { kind: "sense", id: "get.arrive" },
      optionNotes: { "get.become": "不對" },
      scenario: { scene: "回家路上", seq: 1, speaker: "Amy", lead: [{ speaker: "Ben", text: "Hi Amy." }] },
    });
    expect(pool.map((q) => q.scenario.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(pool.map((q) => q.scenario.id)).size).toBe(1);
    expect(learner.practiceQuestions("poly")).toHaveLength(6);
    expect(learner.practiceQuestions("vocab")).toHaveLength(0);
    expect(ev).toEqual(["start:poly", "end:poly", "pool:poly"]);
  });

  it("does nothing while the pool has more than REFILL_AT", async () => {
    const ctx = await filled();
    await ctx.service.refill(POLY);
    expect(ctx.ai.requests).toHaveLength(1);
    expect(ctx.service.poolQuestions("poly")).toHaveLength(6);
  });

  it("refills again once the pool drops to 4, capped by pool room", async () => {
    const ctx = await filled();
    const pool = ctx.service.poolQuestions("poly");
    ctx.service.skip(pool[0]);
    ctx.service.skip(pool[1]);
    // a second scenario, distinct sentences
    ctx.ai.script = () => result(JSON.stringify(scenario(6, (k) => polyAsk(k + 10))));
    await ctx.service.refill(POLY);
    expect(ctx.ai.requests).toHaveLength(2);
    expect(ctx.service.poolQuestions("poly")).toHaveLength(Math.min(POOL_SIZE, 4 + 6));
    // 〔上一段〕 carried the end of the first scenario
    const sys = ctx.ai.requests[1].system.slice(1).map((b) => b.text).join("\n");
    expect(sys).toContain("〔上一段〕\n場景：回家路上");
    expect(sys).toContain("- Amy: Sentence number 5: please get it done today.");
    expect(sys).toContain("〔已出過的句子〕");
    expect(sys).toContain("〔已學單字〕apron");
  });

  it("skips when AI is off or a refill is already running", async () => {
    const ctx = setup();
    await ctx.learner.ensureLoaded();
    ctx.ai.state = "off";
    await ctx.service.refill(POLY);
    expect(ctx.ai.requests).toHaveLength(0);
    expect(ctx.ev).toEqual([]);
    ctx.ai.state = "ready";
    const a = ctx.service.refill(POLY);
    expect(ctx.service.isRefilling("poly")).toBe(true);
    expect(ctx.service.isRefilling("vocab")).toBe(false);
    await ctx.service.refill(POLY); // returns at once
    await a;
    expect(ctx.ai.requests).toHaveLength(1);
    expect(ctx.service.isRefilling("poly")).toBe(false);
  });

  it("keeps pools per track", async () => {
    const ctx = await filled();
    ctx.ai.script = () => result(JSON.stringify(scenario(6, vocabAsk)));
    await ctx.service.refill(VOCAB);
    expect(ctx.service.poolQuestions("poly")).toHaveLength(6);
    expect(ctx.service.poolQuestions("vocab")).toHaveLength(6);
  });

  it("a failed answer ends with refill:end { error } and stores nothing", async () => {
    const ctx = setup({ nonsense: true });
    await ctx.learner.ensureLoaded();
    await ctx.service.refill(POLY);
    expect(ctx.ev).toEqual(["start:poly", "end:poly:error"]);
    expect(ctx.service.poolQuestions("poly")).toEqual([]);
    expect(ctx.service.isRefilling("poly")).toBe(false);
  });

  it("drops pooled questions that were retired elsewhere before deciding", async () => {
    const ctx = await filled();
    const q = ctx.service.poolQuestions("poly")[0];
    ctx.learner.upsertPracticeQuestions([{ ...q, retiredAt: "2026-10-13T09:00:00Z" }]);
    expect(ctx.service.poolQuestions("poly")).toHaveLength(5);
    await ctx.service.refill(POLY);
    expect(ctx.learner.pool("poly")).toHaveLength(5);
  });
});

describe("ScenarioService scope guard (第十八波 T)", () => {
  it("scope changed while the AI was writing: out-of-scope questions never enter the pool", async () => {
    let apply: (() => void) | null = null;
    const ctx = setup(() => {
      apply?.();
      return scenario(6, polyAsk, true);
    });
    await ctx.learner.ensureLoaded();
    ctx.service.applyScope("poly", new Set(["get.arrive", "get.obtain"]));
    const v0 = ctx.service.scopeVersion("poly");
    apply = () => ctx.service.applyScope("poly", new Set(["get.arrive"]));
    await ctx.service.refill(POLY);
    expect(ctx.service.scopeVersion("poly")).toBe(v0 + 1);
    const pool = ctx.service.poolQuestions("poly");
    expect(pool).toHaveLength(3);
    expect(pool.every((q) => q.focus.id === "get.arrive")).toBe(true);
  });

  it("everything out of scope: ends quietly without an error", async () => {
    let apply: (() => void) | null = null;
    const ctx = setup(() => {
      apply?.();
      return scenario(6, polyAsk, true);
    });
    await ctx.learner.ensureLoaded();
    apply = () => ctx.service.applyScope("poly", new Set(["other.sense"]));
    await ctx.service.refill(POLY);
    expect(ctx.service.poolQuestions("poly")).toHaveLength(0);
    expect(ctx.ev).toContain("end:poly");
    expect(ctx.ev).not.toContain("end:poly:error");
  });

  it("scope unchanged: nothing is filtered", async () => {
    const ctx = setup();
    await ctx.learner.ensureLoaded();
    ctx.service.applyScope("poly", new Set(["get.arrive"]));
    await ctx.service.refill(POLY);
    expect(ctx.service.poolQuestions("poly")).toHaveLength(6);
  });
});

describe("ScenarioService answers", () => {
  it("correct: event, leaves the pool, no mistake", async () => {
    const { learner, service, rated } = await filled();
    const q = service.poolQuestions("poly")[0];
    service.answer(q, "get.arrive", true, { hinted: false, fromMistakes: false });
    expect(learner.learnEvents({ track: "poly" })).toMatchObject([
      { track: "poly", focus: q.focus, result: "correct", questionId: q.id },
    ]);
    expect(service.poolQuestions("poly")).toHaveLength(5);
    expect(learner.pool("poly").find((i) => i.questionId === q.id)).toBeUndefined();
    expect(service.mistakeQuestions("poly")).toEqual([]);
    expect(rated).toEqual([]);
  });

  it("wrong: given text, errorTag, opens a mistake; hinted correct is 'hinted'", async () => {
    const { learner, service } = await filled();
    const [q1, q2] = service.poolQuestions("poly");
    service.answer(q1, "get.obtain", false, { hinted: true, fromMistakes: false });
    const e = learner.learnEvents()[0];
    expect(e).toMatchObject({ result: "wrong", given: "得到", errorTag: "sense-confusion" });
    expect(service.mistakeQuestions("poly").map((q) => q.id)).toEqual([q1.id]);
    service.answer(q2, "get.obtain", true, { hinted: true, fromMistakes: false });
    expect(learner.learnEvents().at(-1)!.result).toBe("hinted");
    expect(learner.learnEvents().at(-1)!.errorTag).toBeUndefined();
  });

  it("錯題區 redo: stays in the pool logic untouched, correct resolves, hinted does not", async () => {
    const { learner, service } = await filled();
    const q = service.poolQuestions("poly")[0];
    service.answer(q, "get.become", false, { hinted: false, fromMistakes: false });
    expect(service.poolQuestions("poly")).toHaveLength(5);
    service.answer(q, "get.arrive", true, { hinted: true, fromMistakes: true });
    expect(service.mistakeQuestions("poly")).toHaveLength(1);
    service.answer(q, "get.arrive", true, { hinted: false, fromMistakes: true });
    expect(service.mistakeQuestions("poly")).toHaveLength(0);
    expect(learner.learnEvents()).toHaveLength(3);
    expect(service.poolQuestions("poly")).toHaveLength(5);
    // wrong again reopens
    service.answer(q, "get.become", false, { hinted: false, fromMistakes: true });
    expect(service.mistakeQuestions("poly")).toHaveLength(1);
  });

  it("vocab wrong → rateVocabAgain once; not on 錯題區 redo, correct or poly", async () => {
    const ctx = await filled(VOCAB, scenario(6, vocabAsk));
    const [a, b, c, d] = ctx.service.poolQuestions("vocab");
    ctx.service.answer(a, "b", false, { hinted: false, fromMistakes: false });
    expect(ctx.rated).toEqual(["e1"]);
    ctx.service.answer(a, "b", false, { hinted: false, fromMistakes: true });
    ctx.service.answer(b, "a", true, { hinted: false, fromMistakes: false });
    expect(ctx.rated).toEqual(["e1"]);
    ctx.service.answer(c, "c", false, { hinted: false, fromMistakes: false });
    expect(ctx.rated).toEqual(["e1", "e1"]);
    expect(d).toBeDefined();
    const poly = await filled();
    poly.service.answer(poly.service.poolQuestions("poly")[0], "get.become", false, { hinted: false, fromMistakes: false });
    expect(poly.rated).toEqual([]);
  });

  it("mix: events carry track mix and the question's own focus kind", async () => {
    const mix: ScenarioRequest = { track: "mix", vocab: [{ id: "e1", word: "reluctant", zh: "不情願的", pos: "adj." }], poly: { tested: [ARRIVE], reference: [OBTAIN, BECOME] } };
    const ctx = await filled(mix, scenario(6, (k) => (k % 2 ? polyAsk(k * 2 + 1) : vocabAsk(k))));
    const qs = ctx.service.poolQuestions("mix");
    expect(qs).toHaveLength(6);
    const v = qs.find((q) => q.focus.kind === "word")!;
    ctx.service.answer(v, "b", false, { hinted: false, fromMistakes: false });
    expect(ctx.learner.learnEvents({ track: "mix" })[0].focus).toEqual({ kind: "word", id: "e1" });
    expect(ctx.rated).toEqual(["e1"]);
  });

  it("skip leaves the pool with an event; retire removes it for good and resolves the mistake", async () => {
    const { learner, service } = await filled();
    const [q1, q2] = service.poolQuestions("poly");
    service.skip(q1);
    expect(learner.learnEvents()[0].result).toBe("skipped");
    service.answer(q2, "get.become", false, { hinted: false, fromMistakes: false });
    service.retire(q2);
    expect(service.mistakeQuestions("poly")).toEqual([]);
    expect(learner.practiceQuestion(q2.id)!.retiredAt).toBeDefined();
    expect(learner.learnEvents().map((e) => e.result)).toEqual(["skipped", "wrong", "retired"]);
    expect(service.poolQuestions("poly")).toHaveLength(4);
    // retiring a pooled one removes it from the pool too
    const q3 = service.poolQuestions("poly")[0];
    service.retire(q3);
    expect(service.poolQuestions("poly").map((q) => q.id)).not.toContain(q3.id);
  });

  it("1030 #2: skipping a question in 錯題本 takes it out of 錯題本, without retiring or rating it", async () => {
    const { learner, service } = await filled();
    const [q1] = service.poolQuestions("poly");
    service.answer(q1, "get.become", false, { hinted: false, fromMistakes: false });
    expect(service.mistakeQuestions("poly")).toHaveLength(1);
    service.skip(q1);
    expect(service.mistakeQuestions("poly")).toEqual([]);
    expect(learner.practiceQuestion(q1.id)!.retiredAt).toBeUndefined();
    expect(learner.learnEvents().map((e) => e.result)).toEqual(["wrong", "skipped"]);
  });

  it("applyScope removes pool questions outside the focus ids", async () => {
    const { service, ev } = await filled();
    ev.length = 0;
    service.applyScope("poly", new Set(["get.arrive"]));
    expect(service.poolQuestions("poly").map((q) => q.focus.id)).toEqual(["get.arrive", "get.arrive", "get.arrive"]);
    expect(ev).toEqual(["pool:poly"]);
    service.applyScope("poly", new Set(["get.arrive"]));
    expect(ev).toEqual(["pool:poly"]);
  });

  it("the weakness block lists weak focus ids in scope", async () => {
    const ctx = await filled();
    const q = ctx.service.poolQuestions("poly")[0];
    ctx.service.answer(q, "get.obtain", false, { hinted: false, fromMistakes: false });
    for (const p of ctx.service.poolQuestions("poly")) ctx.service.skip(p);
    ctx.ai.script = () => result(JSON.stringify(scenario(6, (k) => polyAsk(k + 20))));
    await ctx.service.refill(POLY);
    const sys = ctx.ai.requests[1].system.slice(1).map((b) => b.text).join("\n");
    expect(sys).toContain("〔學習弱點〕\nget.arrive（到達）｜錯 1 次");
    // out-of-scope request: no weakness
    ctx.ai.script = () => result(JSON.stringify(scenario(6, (k) => polyAsk(k + 30))));
    for (const p of ctx.service.poolQuestions("poly")) ctx.service.skip(p);
    await ctx.service.refill({ track: "poly", tested: [OBTAIN], reference: [ARRIVE, BECOME] });
    const sys2 = ctx.ai.requests[2].system.slice(1).map((b) => b.text).join("\n");
    expect(sys2).not.toContain("〔學習弱點〕");
  });
});

describe("practiceLine", () => {
  const base = { id: "q", track: "mix", scenario: { id: "s", scene: "x", seq: 1 }, answerId: "b", explanation: "e", focus: { kind: "word", id: "w" }, createdAt: "", updatedAt: "" } as const;
  it("unmarks, fills gaps and prefixes the speaker", () => {
    const opts = [{ id: "a", text: "go" }, { id: "b", text: "went" }];
    expect(practiceLine({ ...base, kind: "pick-word", text: "I ____ home.", options: opts, scenario: { ...base.scenario, speaker: "Amy" } } as PracticeQuestion)).toBe("Amy: I went home.");
    expect(practiceLine({ ...base, kind: "which-sense", text: "A [[run]] B.", options: opts } as PracticeQuestion)).toBe("A run B.");
  });
});

describe("ScenarioService 換句話說 (para)", () => {
  const sentences = [
    "The committee hardly ever approves a budget increase.",
    "Because costs rose sharply last year, it made an exception.",
    "Members said the decision would be reviewed in spring.",
  ];
  const para = (threadId: string, title: string) => ({ threadId, path: `${title}.md`, title, sentences, discussed: [] });
  const PARA: ScenarioRequest = { track: "para", paragraphs: [para("t1", "One"), para("t2", "Two")] };
  const paraAsk = (n: number, variant = "") => ({
    sourceIndex: n,
    options: ["seldom", "often", "never", "always"].map((w, i) => ({ id: "abcd"[i], text: `They ${w} agree to spend more ${variant}${n}.` })),
    answerId: "a",
    explanation: "解釋",
    optionNotes: [],
    sentenceZh: "中文",
    errorTag: "para-negation",
  });
  const reply = (variant = "") => ({ questions: [1, 2, 3].map((n) => paraAsk(n, variant)) });
  const systemOf = (r: { system: { text: string }[] }) => r.system.map((b) => b.text).join("\n");

  it("asks about one paragraph, stores paraphrase questions on its thread and pools them", async () => {
    const { learner, service, ai } = await filled(PARA, reply());
    const pool = service.poolQuestions("para");
    expect(pool.map((q) => q.text)).toEqual(sentences);
    expect(pool[0]).toMatchObject({ track: "para", kind: "paraphrase", focus: { kind: "paragraph", id: "t1" } });
    expect(pool[0].scenario.scene).toBe("〈One〉");
    expect(learner.pool("para")).toHaveLength(3);
    expect(ai.threadIds).toEqual([refillThreadId("para")]);
    expect(systemOf(ai.requests[0])).not.toContain("〔已出過的句子〕第");
  });

  it("next refill takes the paragraph asked least; the same sentence with new options is a new question", async () => {
    let n = 0;
    const ctx = await filled(PARA, () => reply(`v${++n} `));
    for (const q of ctx.service.poolQuestions("para")) ctx.service.answer(q, "a", true, { hinted: false, fromMistakes: false });
    await ctx.service.refill(PARA);
    expect(ctx.service.poolQuestions("para").map((q) => q.focus.id)).toEqual(["t2", "t2", "t2"]);
    const third = { track: "para" as const, paragraphs: [para("t1", "One")] };
    for (const q of ctx.service.poolQuestions("para")) ctx.service.skip(q);
    ctx.service.applyScope("para", new Set(["t1"]));
    await ctx.service.refill(third);
    expect(systemOf(ctx.ai.requests[2])).toContain("〔已出過的句子〕第 1、2、3 句已經出過題");
    expect(ctx.service.poolQuestions("para")).toHaveLength(3);
  });

  it("a wrong answer's error type comes back as 〔學習弱點〕", async () => {
    const ctx = await filled(PARA, reply());
    const [q] = ctx.service.poolQuestions("para");
    ctx.service.answer(q, "b", false, { hinted: false, fromMistakes: false });
    for (const x of ctx.service.poolQuestions("para")) ctx.service.skip(x);
    expect(ctx.learner.mistakes("para")).toHaveLength(1);
    ctx.ai.script = () => result(JSON.stringify(reply("again ")));
    await ctx.service.refill(PARA);
    expect(systemOf(ctx.ai.requests[1])).toContain("〔學習弱點〕\npara-negation｜最近 30 天錯 1 次");
  });

  it("no paragraph: nothing is sent", async () => {
    const { ai, service } = await filled({ track: "para", paragraphs: [] }, reply());
    expect(ai.requests).toHaveLength(0);
    expect(service.poolQuestions("para")).toEqual([]);
  });
});

describe("pool lanes (1030 #4 複習這篇筆記)", () => {
  it("a note's lane has its own pool: neither side's scope or refill empties the other", async () => {
    const ctx = await filled(VOCAB, scenario(6, vocabAsk));
    let seq = 100;
    let round = 0;
    const noteAi = new StatusAi(() => {
      round++;
      return result(JSON.stringify(scenario(6, (k) => ({ ...vocabAsk(k), text: `Round ${round}: he was [[reluctant]] to go, number ${k}.` }))));
    });
    const note = new ScenarioService({ ai: noteAi, learner: ctx.learner, clock: ctx.clock, newId: () => `n${++seq}`, lane: "note:a.md" });
    await note.refill(VOCAB);
    expect(noteAi.threadIds).toEqual([refillThreadId("vocab", "note:a.md")]);
    expect(note.poolQuestions("vocab")).toHaveLength(6);
    expect(ctx.service.poolQuestions("vocab")).toHaveLength(6);
    expect(new Set(note.poolQuestions("vocab").map((q) => q.id)).size).toBe(6);
    expect(note.poolQuestions("vocab").some((q) => ctx.service.poolQuestions("vocab").includes(q))).toBe(false);

    // the hub narrowing its scope leaves the note's lane alone, and vice versa
    ctx.service.applyScope("vocab", new Set(["other"]));
    expect(ctx.service.poolQuestions("vocab")).toHaveLength(0);
    expect(note.poolQuestions("vocab")).toHaveLength(6);
    note.applyScope("vocab", new Set(["nope"]));
    expect(note.poolQuestions("vocab")).toHaveLength(0);

    // answers / mistakes are shared: a wrong answer in the note lands in the hub's 錯題本
    await note.refill(VOCAB);
    const q = note.poolQuestions("vocab")[0];
    note.answer(q, "b", false, { hinted: false, fromMistakes: false });
    expect(ctx.service.mistakeQuestions("vocab").map((m) => m.id)).toContain(q.id);
    expect(note.poolQuestions("vocab").map((x) => x.id)).not.toContain(q.id);
  });
});
