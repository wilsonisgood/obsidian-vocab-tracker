import { describe, expect, it } from "vitest";
import { topicById } from "../../../../src/core/grammar/catalog";
import { defaultLearnerProfile } from "../../../../src/core/model/settings";
import type { AiRequest, AiResult } from "../../../../src/services/ai/providers/types";
import {
  GRAMMAR_QUESTIONS_SCHEMA,
  grammarQuestions,
  grammarQuestionsFor,
  parseGrammarScenario,
  parseScenarioQuestion,
  type GrammarQuestionsInput,
} from "../../../../src/services/ai/tasks/grammarQuestions";

const PP = topicById("present-perfect-vs-past")!;
const PS = topicById("past-simple")!;
const ctx = () => ({ profile: defaultLearnerProfile(), history: [] });

function render(req: AiRequest): string {
  const sys = req.system.map((b, i) => `── system[${i}]${b.cache ? " (cache)" : ""} ──\n${b.text}`);
  const msgs = req.messages.map((m) => `── ${m.role} ──\n${m.content}`);
  return [...sys, ...msgs].join("\n\n");
}

function aiResult(text: string, extra: Partial<AiResult> = {}): AiResult {
  return { text, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: "m", stop: "end", transport: "fetch", ...extra };
}

const INPUT: GrammarQuestionsInput = {
  targets: [
    { topic: PP, objectiveIds: ["present-link", "just-already-yet"] },
    { topic: PS, objectiveIds: [] },
  ],
  knownTopicTitles: ["be 動詞"],
  words: ["apron"],
  avoidStems: ["I ____ my keys."],
};

const ask = (extra: Record<string, unknown> = {}) => ({
  objectiveId: "present-link",
  topicId: PP.id,
  type: "choice",
  stem: "I ____ my keys. I can't get in now.",
  options: ["lost", "have lost", "had lost"],
  answer: "have lost",
  accepted: [],
  explanation: "現在進不去。",
  distractors: [{ option: "lost", why: "只說過去" }],
  sentenceZh: "我弄丟鑰匙了，現在進不去。",
  errorTag: "tense-choice",
  sourceIndex: 0,
  ...extra,
});
const FIND = ask({
  objectiveId: "finished-time",
  type: "find-error",
  stem: "We have visited Kyoto last year.",
  options: ["have visited", "Kyoto", "last year"],
  answer: "have visited",
  accepted: ["visited"],
  distractors: [{ option: "Kyoto", why: "地名沒錯" }],
});
const turn = (a?: unknown, text = "", speaker = "") => ({ speaker, text, ask: a === undefined ? [] : [a] });

describe("grammar.questions request", () => {
  it("lists the objectives with their ids, one per line", () => {
    const text = render(grammarQuestions.build(INPUT, ctx()));
    expect(text).toContain("〔出題參考〕");
    expect(text).toContain(`${PP.id}/present-link｜${PP.objectives.find((o) => o.id === "present-link")!.text}｜${PP.title}（${PP.pattern}）`);
    // only the objectives named; none named = all of the topic
    expect(text).not.toContain(`${PP.id}/finished-time`);
    for (const o of PS.objectives) expect(text).toContain(`${PS.id}/${o.id}`);
    expect(text).toContain(`任務：文法情境練習（${PP.title}、${PS.title}）`);
    expect(text).toContain("出 6 題");
    expect(text).toContain("errorTag 清單：tense-choice");
  });

  it("puts 〔學習弱點〕 and 〔上一段〕 in only when there is something to say", () => {
    const plain = grammarQuestions.build(INPUT, ctx());
    const t0 = render(plain);
    expect(t0).not.toContain("〔學習弱點〕\n");
    expect(t0).not.toContain("〔上一段〕\n");
    const full = render(
      grammarQuestions.build(
        { ...INPUT, weakness: `${PP.id}/present-link（連到現在）｜錯 2 次`, previous: { scene: "在咖啡店點餐", lastLines: ["A: Hi.", "B: Hello.", "A: Order?"] } },
        ctx()
      )
    );
    expect(full).toContain(`〔學習弱點〕\n${PP.id}/present-link（連到現在）｜錯 2 次`);
    expect(full).toContain("〔上一段〕\n場景：在咖啡店點餐\n最後兩句：\n- B: Hello.\n- A: Order?");
    expect(full).not.toContain("- A: Hi.");
  });

  it("is a click-only prompt (no blank / rewrite / translate) and schema", () => {
    const text = render(grammarQuestions.build(INPUT, ctx()));
    expect(text).toContain("只出點選的題型（choice、find-error）");
    const types = JSON.stringify(GRAMMAR_QUESTIONS_SCHEMA);
    expect(types).toContain('"enum":["choice","find-error"]');
    expect(types).not.toContain("translate");
    const req = grammarQuestions.build(INPUT, ctx());
    expect(grammarQuestions).toMatchObject({ id: "grammar.questions", surface: "grammar", tier: "smart", maxTokens: 8192 });
    expect(req.output).toEqual({ name: "grammar_questions", schema: GRAMMAR_QUESTIONS_SCHEMA });
  });

  it("caps words at 30 and avoid-stems at 40", () => {
    const words = Array.from({ length: 50 }, (_, i) => `w${i}`);
    const avoid = Array.from({ length: 60 }, (_, i) => `Stem number ${i}.`);
    const text = render(grammarQuestions.build({ ...INPUT, words, avoidStems: avoid }, ctx()));
    expect(text).toContain("〔已學單字〕");
    expect(text).toContain("w29");
    expect(text).not.toContain("w30");
    expect(text).toContain("Stem number 39.");
    expect(text).not.toContain("Stem number 40.");
  });

  it("numbers the reading sentences", () => {
    const text = render(grammarQuestions.build({ ...INPUT, sentences: [{ path: "a.md", sentence: "I have lost my keys." }] }, ctx()));
    expect(text).toContain("〔讀者讀過的句子〕\n1. I have lost my keys.");
    expect(text).not.toContain("a.md");
  });
});

describe("parseScenarioQuestion", () => {
  it("accepts choice and find-error, keeping distractors, sentenceZh and accepted[0]", () => {
    const c = parseScenarioQuestion(ask())!;
    expect(c).toMatchObject({ topicId: PP.id, objectiveId: "present-link", type: "choice", answer: "have lost", sentenceZh: "我弄丟鑰匙了，現在進不去。" });
    expect(c.distractors).toEqual({ lost: "只說過去" });
    expect(c.accepted).toBeUndefined();
    const f = parseScenarioQuestion(FIND)!;
    expect(f).toMatchObject({ type: "find-error", answer: "have visited", accepted: ["visited"] });
  });

  it("refuses blank, rewrite, translate and unknown types", () => {
    for (const type of ["blank", "rewrite", "translate", "match"]) expect(parseScenarioQuestion(ask({ type }))).toBeNull();
  });

  it("refuses broken questions", () => {
    const bad = [
      ask({ options: ["lost", "have lost"] }), // too few
      ask({ options: ["a", "b", "c", "d", "e"], answer: "a" }),
      ask({ answer: "zzz" }), // answer not among them
      ask({ stem: "I lost my keys." }), // no gap
      ask({ stem: "I ____ my ____ keys." }), // two gaps
      { ...FIND, options: ["have visited", "Osaka", "last year"] },
      { ...FIND, stem: "We have ____ Kyoto last year.", options: ["have", "Kyoto", "last year"], answer: "have" }, // gap in find-error
      ask({ explanation: "" }),
    ];
    for (const b of bad) expect(parseScenarioQuestion(b)).toBeNull();
    expect(parseScenarioQuestion(null)).toBeNull();
  });

  it("de-duplicates options and normalises the gap", () => {
    const q = parseScenarioQuestion(ask({ stem: "I _____ my keys.", options: ["lost", "lost", "have lost", "had lost"] }))!;
    expect(q.stem).toBe("I ____ my keys.");
    expect(q.options).toEqual(["lost", "have lost", "had lost"]);
  });

  it("checks the objective against the offered list", () => {
    const refs = new Set([`${PP.id}/present-link`]);
    expect(parseScenarioQuestion(ask(), { refs })).not.toBeNull();
    expect(parseScenarioQuestion(ask({ objectiveId: "nope" }), { refs })).toBeNull();
    expect(parseScenarioQuestion(ask({ topicId: "other" }), { refs })).toBeNull();
    // a combined "topic/objective" id, or no topicId when only one topic has it
    expect(parseScenarioQuestion(ask({ objectiveId: `${PP.id}/present-link`, topicId: "" }), { refs })).not.toBeNull();
    expect(parseScenarioQuestion(ask({ topicId: "" }), { refs })?.topicId).toBe(PP.id);
  });

  it("maps sourceIndex back to the sentences sent", () => {
    const q = parseScenarioQuestion(ask({ sourceIndex: 1 }), { sentences: [{ path: "a.md", sentence: "S." }] })!;
    expect(q.source).toEqual({ path: "a.md", sentence: "S." });
    expect(parseScenarioQuestion(ask({ sourceIndex: 2 }), { sentences: [{ path: "a.md", sentence: "S." }] })!.source).toBeUndefined();
  });
});

describe("parseGrammarScenario", () => {
  const body = (turns: unknown[], extra: Record<string, unknown> = {}) => ({
    scene: "在咖啡店",
    form: "dialogue",
    speakers: ["Amy", "Ben"],
    turns,
    ...extra,
  });

  it("hangs lead-in lines on the next question and keeps the speaker", () => {
    const s = parseGrammarScenario(
      body([
        turn(undefined, "Hi, Amy!", "Ben"),
        turn(undefined, "Hello.", "Amy"),
        turn(ask(), "", "Amy"),
        turn(FIND, "", "Ben"),
        turn(undefined, "See you.", "Amy"),
      ])
    );
    expect(s).toMatchObject({ scene: "在咖啡店", form: "dialogue", speakers: ["Amy", "Ben"] });
    expect(s.questions).toHaveLength(2);
    expect(s.questions[0]).toMatchObject({ speaker: "Amy", lead: [{ speaker: "Ben", text: "Hi, Amy!" }, { speaker: "Amy", text: "Hello." }] });
    expect(s.questions[1].lead).toBeUndefined();
  });

  it("drops bad questions one by one but keeps the order", () => {
    const s = parseGrammarScenario(body([turn(ask()), turn(ask({ type: "blank" })), turn(FIND)]));
    expect(s.questions.map((q) => q.type)).toEqual(["choice", "find-error"]);
  });

  it("is bad_output when fewer than half survive, when none do, or the shape is wrong", () => {
    const bad = (t: unknown) => () => parseGrammarScenario(t);
    expect(bad(body([turn(ask()), turn(ask({ type: "blank" })), turn(ask({ type: "rewrite" }))]))).toThrow(/usable/);
    expect(bad(body([turn(ask({ type: "blank" }))]))).toThrowError(expect.objectContaining({ code: "bad_output" }));
    expect(bad(body([]))).toThrowError(expect.objectContaining({ code: "bad_output" }));
    expect(bad({ turns: [turn(ask())] })).toThrowError(expect.objectContaining({ code: "bad_output" })); // no scene
    expect(bad("nope")).toThrowError(expect.objectContaining({ code: "bad_output" }));
    // exactly half is fine
    expect(parseGrammarScenario(body([turn(ask()), turn(ask({ type: "blank" }))])).questions).toHaveLength(1);
  });

  it("skips a repeated stem, and accepts ask as a plain object", () => {
    const s = parseGrammarScenario(body([{ speaker: "", text: "", ask: ask() }, turn(ask()), turn(FIND)]));
    expect(s.questions).toHaveLength(2);
  });

  it("defaults form from the speakers", () => {
    expect(parseGrammarScenario(body([turn(ask())], { form: "x" })).form).toBe("dialogue");
    expect(parseGrammarScenario(body([turn(ask())], { form: "x", speakers: [] })).form).toBe("story");
  });

  it("works through the task's parse and the per-request variant", () => {
    const text = JSON.stringify(body([turn(ask())]));
    expect(grammarQuestions.parse!(aiResult(text)).questions).toHaveLength(1);
    expect(grammarQuestions.parse!(aiResult("```json\n" + text + "\n```")).questions).toHaveLength(1);
    expect(grammarQuestions.parse!(aiResult("", { json: body([turn(ask())]) })).questions).toHaveLength(1);
    const task = grammarQuestionsFor([{ topic: PP, objectiveIds: [] }], [{ path: "a.md", sentence: "I lost my keys." }]);
    const mixed = JSON.stringify(body([turn(ask({ sourceIndex: 1 })), turn(ask({ objectiveId: "nope", stem: "x ____ y." })), turn(FIND)]));
    expect(task.parse!(aiResult(mixed)).questions).toHaveLength(2);
    expect(task.parse!(aiResult(mixed)).questions[0].source).toEqual({ path: "a.md", sentence: "I lost my keys." });
    // an objective the request did not offer: PS objective not asked for PP-only targets
    const onlyPp = grammarQuestionsFor([{ topic: PP, objectiveIds: ["present-link"] }]);
    expect(() => onlyPp.parse!(aiResult(JSON.stringify(body([turn(FIND)]))))).toThrow(/usable/);
  });
});
