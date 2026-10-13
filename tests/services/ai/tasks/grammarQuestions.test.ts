import { describe, expect, it } from "vitest";
import { topicById } from "../../../../src/core/grammar/catalog";
import { defaultLearnerProfile, type LearnerProfile } from "../../../../src/core/model/settings";
import type { AiRequest, AiResult } from "../../../../src/services/ai/providers/types";
import {
  grammarQuestions,
  grammarQuestionsFor,
  GRAMMAR_QUESTIONS_SCHEMA,
  parseGrammarQuestion,
  parseGrammarQuestions,
  type GrammarQuestionsInput,
} from "../../../../src/services/ai/tasks/grammarQuestions";

const B1: LearnerProfile = { level: "B1", goal: "general", answerLanguage: "zh-TW", maxAnswerChars: 300, extra: "" };
const TOPIC = topicById("present-perfect-vs-past")!;
const ctx = (profile: LearnerProfile = defaultLearnerProfile()) => ({ profile, history: [] });

function render(req: AiRequest): string {
  const sys = req.system.map((b, i) => `── system[${i}]${b.cache ? " (cache)" : ""} ──\n${b.text}`);
  const msgs = req.messages.map((m) => `── ${m.role} ──\n${m.content}`);
  const out = req.output ? [`output=${req.output.name}`] : [];
  return [`tier=${req.tier} maxTokens=${req.maxTokens}`, ...out, ...sys, ...msgs].join("\n\n");
}

function aiResult(text: string, extra: Partial<AiResult> = {}): AiResult {
  return { text, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: "m", stop: "end", transport: "fetch", ...extra };
}

const INPUT: GrammarQuestionsInput = {
  topic: TOPIC,
  objectiveIds: ["present-link", "just-already-yet"],
  count: 6,
  knownTopicTitles: ["be 動詞", "一般過去式"],
  words: ["glittery", "apron"],
  avoidStems: ["I ___ my keys. I can't get in now."],
};

const CHOICE = {
  objectiveId: "present-link",
  type: "choice",
  stem: "I ___ my keys. I can't get in now.",
  options: ["lost", "have lost", "had lost", "was losing"],
  answer: "have lost",
  accepted: [],
  explanation: "現在進不去，是過去動作的結果。",
  distractors: [
    { option: "lost", why: "只說過去，沒連到現在" },
    { option: "had lost", why: "過去完成式要有更晚的過去時間" },
  ],
  errorTag: "tense-choice",
};
const BLANK = {
  objectiveId: "just-already-yet",
  type: "blank",
  stem: "She ____ already finished her homework.",
  options: [],
  answer: "has",
  accepted: ["'s"],
  explanation: "already 搭配完成式。",
  distractors: [{ option: "did", why: "already 在這裡連到現在" }],
  errorTag: "aspect",
};
const FIND = {
  objectiveId: "finished-time",
  type: "find-error",
  stem: "We have visited Kyoto last year.",
  options: ["have visited", "Kyoto", "last year"],
  answer: "have visited",
  accepted: ["visited"],
  explanation: "last year 是明確的過去時間。",
  distractors: [{ option: "Kyoto", why: "地名沒有錯" }],
  errorTag: "tense-choice",
};

describe("grammar.questions request", () => {
  it("builds the full request (snapshot)", () => {
    expect(render(grammarQuestions.build(INPUT, ctx(B1)))).toMatchSnapshot();
  });

  it("leaves out empty context blocks and defaults the count to 8", () => {
    const req = grammarQuestions.build(
      { topic: TOPIC, objectiveIds: [], knownTopicTitles: [], words: [], avoidStems: [] },
      ctx()
    );
    const text = render(req);
    expect(text).toMatchSnapshot();
    // base prompt, topic block and learner profile only
    expect(req.system).toHaveLength(3);
    expect(text).toContain("出 8 題");
    // every objective of the topic when none is named
    for (const o of TOPIC.objectives) expect(text).toContain(o.id);
  });

  it("caps words at 30 and avoid-stems at 40", () => {
    const words = Array.from({ length: 50 }, (_, i) => `w${i}`);
    const avoid = Array.from({ length: 60 }, (_, i) => `Stem number ${i}.`);
    const text = render(grammarQuestions.build({ ...INPUT, words, avoidStems: avoid }, ctx()));
    expect(text).toContain("w29");
    expect(text).not.toContain("w30");
    expect(text).toContain("Stem number 39.");
    expect(text).not.toContain("Stem number 40.");
  });

  it("is a smart structured task on the grammar surface", () => {
    const req = grammarQuestions.build(INPUT, ctx());
    expect(grammarQuestions).toMatchObject({ id: "grammar.questions", surface: "grammar", tier: "smart", maxTokens: 8192 });
    expect(req.output).toEqual({ name: "grammar_questions", schema: GRAMMAR_QUESTIONS_SCHEMA });
    expect(req.tier).toBe("smart");
  });
});

describe("parseGrammarQuestions", () => {
  it("accepts the three question types", () => {
    const out = parseGrammarQuestions({ questions: [CHOICE, BLANK, FIND] });
    expect(out.map((q) => q.type)).toEqual(["choice", "blank", "find-error"]);
    expect(out[0].distractors).toEqual({ lost: "只說過去，沒連到現在", "had lost": "過去完成式要有更晚的過去時間" });
    expect(out[1]).toMatchObject({ stem: "She ___ already finished her homework.", accepted: ["'s"] });
    expect(out[1].options).toBeUndefined();
    expect(out[2]).toMatchObject({ answer: "have visited", accepted: ["visited"] });
  });

  it("works through the task's parse (plain JSON text, fenced JSON, json field)", () => {
    const body = JSON.stringify({ questions: [CHOICE] });
    expect(grammarQuestions.parse!(aiResult(body))).toHaveLength(1);
    expect(grammarQuestions.parse!(aiResult("```json\n" + body + "\n```"))).toHaveLength(1);
    expect(grammarQuestions.parse!(aiResult("", { json: { questions: [CHOICE] } }))).toHaveLength(1);
  });

  it("drops bad questions one by one", () => {
    const bad = [
      { ...CHOICE, options: ["lost", "have lost"] }, // too few options
      { ...CHOICE, options: ["a", "b", "c", "d", "e"], answer: "a" }, // too many
      { ...CHOICE, answer: "has lost" }, // answer not among the options
      { ...BLANK, stem: "She has already finished." }, // no gap
      { ...BLANK, stem: "She ___ already ___ it." }, // two gaps
      { ...FIND, options: ["have visited", "Osaka", "last year"] }, // option not in the stem
      { ...FIND, answer: "yesterday" }, // answer not an option
      { ...CHOICE, type: "match" }, // not a generated type
      { ...CHOICE, type: "essay" },
      { ...CHOICE, stem: "" },
      { ...CHOICE, explanation: "" },
      "not an object",
      null,
    ];
    const good = { ...CHOICE, stem: "He ___ here since 2020.", answer: "has lived", options: ["lived", "has lived", "is living"] };
    const out = parseGrammarQuestions({ questions: [...bad, good] });
    expect(out).toHaveLength(1);
    expect(out[0].stem).toBe("He ___ here since 2020.");
  });

  it("throws bad_output when nothing is usable", () => {
    expect(() => parseGrammarQuestions({ questions: [{ ...CHOICE, options: [] }] })).toThrowError(/no usable/);
    expect(() => parseGrammarQuestions({ questions: [] })).toThrowError(/no usable/);
    expect(() => parseGrammarQuestions({ nope: 1 })).toThrowError(/expected/);
    expect(() => parseGrammarQuestions("text")).toThrowError(/expected/);
    try {
      parseGrammarQuestions({});
    } catch (e) {
      expect((e as { code?: string }).code).toBe("bad_output");
    }
  });

  it("drops questions whose objective isn't in the topic", () => {
    const stray = { ...CHOICE, objectiveId: "made-up", stem: "Another ___ one." };
    const ids = TOPIC.objectives.map((o) => o.id);
    expect(parseGrammarQuestions({ questions: [CHOICE, stray] }, { objectiveIds: ids }).map((q) => q.objectiveId)).toEqual(["present-link"]);
    expect(() => parseGrammarQuestions({ questions: [stray] }, { objectiveIds: ids })).toThrowError(/no usable/);
    // the per-topic task applies the same filter
    const task = grammarQuestionsFor(TOPIC);
    expect(task.id).toBe("grammar.questions");
    expect(task.parse!(aiResult(JSON.stringify({ questions: [stray, CHOICE] })))).toHaveLength(1);
  });

  it("maps unknown error tags to other", () => {
    expect(parseGrammarQuestion({ ...CHOICE, errorTag: "wrong-tense" })!.errorTag).toBe("other");
    expect(parseGrammarQuestion({ ...CHOICE, errorTag: "Tense-Choice" })!.errorTag).toBe("tense-choice");
    expect(parseGrammarQuestion({ ...CHOICE, errorTag: undefined })!.errorTag).toBe("other");
  });

  it("tidies what it keeps", () => {
    const q = parseGrammarQuestion({
      ...CHOICE,
      stem: "  I _____ my keys.  ",
      answer: "Have lost",
      options: ["lost", "have lost", "have lost", "had lost"],
      accepted: ["have lost"],
      distractors: { "have lost": "the right one", lost: "too early", "not an option": "x" },
    })!;
    expect(q.stem).toBe("I ___ my keys.");
    expect(q.options).toEqual(["lost", "have lost", "had lost"]); // duplicate removed
    expect(q.answer).toBe("have lost"); // snapped to the option's own spelling
    expect(q.accepted).toBeUndefined(); // a choice has exactly one answer
    expect(q.distractors).toEqual({ lost: "too early" }); // answer and strangers removed
  });

  it("keeps blank alternatives apart from the answer and drops repeated stems", () => {
    const q = parseGrammarQuestion({ ...BLANK, accepted: ["has", "'s", "'s", " "] })!;
    expect(q.accepted).toEqual(["'s"]);
    const out = parseGrammarQuestions({ questions: [CHOICE, { ...CHOICE, stem: "I ___ MY keys. I can't get in now." }] });
    expect(out).toHaveLength(1);
  });
});

// ── R2: rewrite / translate, reading sentences ────────────────────

const REWRITE = {
  objectiveId: "present-link",
  type: "rewrite",
  stem: "用 Not until 開頭改寫：He didn't leave until she arrived.",
  options: [],
  answer: "Not until she arrived did he leave.",
  accepted: ["Not until she had arrived did he leave.", "Not until she arrived did he leave."],
  explanation: "Not until 放句首時，主要子句倒裝。",
  distractors: [],
  errorTag: "inversion",
};
const TRANSLATE = {
  objectiveId: "finished-time",
  type: "translate",
  stem: "我昨天才第一次見到她。",
  options: ["ignored"],
  answer: "I met her for the first time yesterday.",
  accepted: [],
  explanation: "yesterday 是明確的過去時間。",
  distractors: [{ option: "x", why: "y" }],
  errorTag: "tense-choice",
};
const LOW = topicById("past-simple")!;

describe("grammar.questions — open types (R2)", () => {
  it("is at version 2", () => {
    expect(grammarQuestions.version).toBe(2);
  });

  it("allows rewrite / translate in the request only at difficulty >= 4", () => {
    expect(TOPIC.difficulty).toBeGreaterThanOrEqual(4);
    expect(LOW.difficulty).toBeLessThan(4);
    const high = grammarQuestions.build(INPUT, ctx());
    const low = grammarQuestions.build({ ...INPUT, topic: LOW, objectiveIds: [] }, ctx());
    expect(render(high)).toContain("可以另外出 1 到 2 題開放題型");
    expect(render(low)).toContain("這次不要出 rewrite、translate");
    const types = (r: AiRequest) =>
      (r.output!.schema as { properties: { questions: { items: { properties: { type: { enum: string[] } } } } } }).properties.questions.items.properties.type.enum;
    expect(types(high)).toEqual(["choice", "blank", "find-error", "rewrite", "translate"]);
    expect(types(low)).toEqual(["choice", "blank", "find-error"]);
  });

  it("parses a rewrite and a translate: stem + sample answer, nothing else", () => {
    const out = parseGrammarQuestions({ questions: [REWRITE, TRANSLATE] });
    expect(out[0]).toEqual({
      objectiveId: "present-link",
      type: "rewrite",
      stem: REWRITE.stem,
      answer: REWRITE.answer,
      accepted: ["Not until she had arrived did he leave."],
      explanation: REWRITE.explanation,
      errorTag: "inversion",
    });
    expect(out[1]).toMatchObject({ type: "translate", answer: "I met her for the first time yesterday." });
    expect(out[1].options).toBeUndefined();
    expect(out[1].distractors).toBeUndefined();
  });

  it("drops open questions with an empty stem or sample answer", () => {
    expect(() => parseGrammarQuestions({ questions: [{ ...REWRITE, stem: " " }] })).toThrowError(/no usable/);
    expect(() => parseGrammarQuestions({ questions: [{ ...TRANSLATE, answer: "" }] })).toThrowError(/no usable/);
  });

  it("keeps at most two open questions", () => {
    const three = [REWRITE, TRANSLATE, { ...REWRITE, stem: "用 Hardly 開頭改寫：He had hardly sat down when it rang." }];
    expect(parseGrammarQuestions({ questions: [CHOICE, ...three] }).map((q) => q.type)).toEqual(["choice", "rewrite", "translate"]);
  });

  it("grammarQuestionsFor drops open questions below difficulty 4", () => {
    const low = (id: string) => ({ ...REWRITE, objectiveId: id });
    const r = aiResult(JSON.stringify({ questions: [low(LOW.objectives[0].id), { ...CHOICE, objectiveId: LOW.objectives[0].id }] }), {
      json: { questions: [low(LOW.objectives[0].id), { ...CHOICE, objectiveId: LOW.objectives[0].id }] },
    });
    expect(grammarQuestionsFor(LOW).parse!(r).map((q) => q.type)).toEqual(["choice"]);
    const high = aiResult("", { json: { questions: [REWRITE, CHOICE] } });
    expect(grammarQuestionsFor(TOPIC).parse!(high).map((q) => q.type)).toEqual(["rewrite", "choice"]);
  });
});

describe("grammar.questions — reading sentences (R2)", () => {
  const SENTENCES = [
    { path: "Books/Dune.md", sentence: "He has never seen the desert at night before." },
    { path: "News/Sea.md", sentence: "They lived by the sea when they were children." },
  ];

  it("adds a numbered 〔讀者讀過的句子〕 block, without the note paths (snapshot)", () => {
    const text = render(grammarQuestions.build({ ...INPUT, sentences: SENTENCES }, ctx(B1)));
    expect(text).toMatchSnapshot();
    expect(text).toContain("1. He has never seen the desert at night before.");
    expect(text).toContain("2. They lived by the sea");
    expect(text).not.toContain("Dune");
    expect(text).not.toContain("News/");
  });

  it("sends at most 3 distinct sentences, trimmed", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ path: `p${i}.md`, sentence: `  Sentence   number ${i}.  ` }));
    const text = render(grammarQuestions.build({ ...INPUT, sentences: [many[0], many[0], ...many] }, ctx()));
    expect(text).toContain("1. Sentence number 0.");
    expect(text).toContain("3. Sentence number 2.");
    expect(text).not.toContain("number 3");
  });

  it("has no sentences block when there are none", () => {
    expect(render(grammarQuestions.build({ ...INPUT, sentences: [] }, ctx()))).not.toContain("〔讀者讀過的句子〕\n");
  });

  it("turns sourceIndex into source", () => {
    const out = parseGrammarQuestions(
      { questions: [{ ...CHOICE, sourceIndex: 2 }, { ...BLANK, sourceIndex: 0 }, { ...FIND, sourceIndex: 9 }] },
      { sentences: SENTENCES }
    );
    expect(out[0].source).toEqual(SENTENCES[1]);
    expect(out[1].source).toBeUndefined();
    expect(out[2].source).toBeUndefined();
  });

  it("grammarQuestionsFor maps sourceIndex onto the sentences it was given", () => {
    const r = aiResult("", { json: { questions: [{ ...CHOICE, sourceIndex: 1 }] } });
    expect(grammarQuestionsFor(TOPIC, SENTENCES).parse!(r)[0].source).toEqual(SENTENCES[0]);
    expect(grammarQuestionsFor(TOPIC).parse!(r)[0].source).toBeUndefined();
  });
});
