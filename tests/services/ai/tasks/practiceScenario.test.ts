import { describe, expect, it } from "vitest";
import { defaultLearnerProfile } from "../../../../src/core/model/settings";
import type { PolySense } from "../../../../src/core/model/poly";
import type { AiRequest } from "../../../../src/services/ai/providers/types";
import {
  PRACTICE_SCENARIO_BASE_PROMPT,
  parsePracticeQuestion,
  parsePracticeScenario,
  practiceScenario,
  practiceScenarioFor,
  refsOf,
} from "../../../../src/services/ai/tasks/practiceScenario";
import type { ScenarioRequest } from "../../../../src/services/practice/scenarioApi";

const ctx = () => ({ profile: defaultLearnerProfile(), history: [] });
const sense = (id: string, zh: string): PolySense => {
  const [word, slug] = id.split(".");
  return { id, word, zh, example: `${word} ${slug}`, cue: `線索 ${slug}`, level: 1 };
};
const ARRIVE = sense("get.arrive", "到達");
const OBTAIN = sense("get.obtain", "得到");
const BECOME = sense("get.become", "變得");
const RUN = sense("run.operate", "經營");
const POLY: ScenarioRequest = { track: "poly", tested: [ARRIVE, OBTAIN], reference: [BECOME, RUN] };
const VOCAB: ScenarioRequest = { track: "vocab", words: [{ id: "e1", word: "reluctant", zh: "不情願的", pos: "adj." }] };
const MIX: ScenarioRequest = {
  track: "mix",
  poly: { tested: [ARRIVE], reference: [OBTAIN, BECOME] },
  vocab: VOCAB.track === "vocab" ? VOCAB.words : [],
  grammar: [{ topicId: "past-simple", objectiveId: "regular", text: "規則動詞", title: "過去式", pattern: "V-ed" }],
};

const polyAsk = (extra: Record<string, unknown> = {}) => ({
  focusId: "get.arrive",
  kind: "which-sense",
  text: "When did you [[get]] home?",
  options: [
    { id: "get.arrive", text: "到達" },
    { id: "get.obtain", text: "得到" },
    { id: "get.become", text: "變得" },
  ],
  answerId: "get.arrive",
  explanation: "home 表示地點。",
  optionNotes: [{ id: "get.obtain", note: "後面接東西才是得到" }],
  sentenceZh: "你幾點到家？",
  errorTag: "sense-confusion",
  ...extra,
});
const turn = (ask: unknown[], text = "", speaker = "Amy") => ({ speaker, text, ask });
const reply = (turns: unknown[]) => ({ scene: "回家路上", form: "dialogue", speakers: ["Amy"], turns });

describe("parsePracticeScenario", () => {
  it("parses poly questions, keeps notes and hangs lead lines on the next question", () => {
    const d = parsePracticeScenario(
      reply([turn([], "Hi there."), turn([], "How was work?", "Ben"), turn([polyAsk()]), turn([polyAsk({ text: "Did you [[get]] the job?", focusId: "get.obtain", answerId: "get.obtain" })])]),
      refsOf(POLY)
    );
    expect(d.questions).toHaveLength(2);
    expect(d.questions[0]).toMatchObject({
      focus: { kind: "sense", id: "get.arrive" },
      kind: "which-sense",
      optionNotes: { "get.obtain": "後面接東西才是得到" },
      errorTag: "sense-confusion",
      speaker: "Amy",
      lead: [{ speaker: "Amy", text: "Hi there." }, { speaker: "Ben", text: "How was work?" }],
    });
    expect(d.questions[1].lead).toBeUndefined();
  });

  it("caps lead at 3 and accepts ask as a bare object", () => {
    const leads = ["a", "b", "c", "d"].map((t) => turn([], t));
    const d = parsePracticeScenario(reply([...leads, { speaker: "A", text: "", ask: polyAsk() }]), refsOf(POLY));
    expect(d.questions[0].lead!.map((l) => l.text)).toEqual(["b", "c", "d"]);
  });

  it("drops a poly which-sense whose options come from another word", () => {
    const bad = polyAsk({
      options: [
        { id: "get.arrive", text: "到達" },
        { id: "run.operate", text: "經營" },
        { id: "get.obtain", text: "得到" },
      ],
    });
    const d = parsePracticeScenario(reply([turn([bad]), turn([polyAsk({ text: "Let me [[get]] there." })])]), refsOf(POLY));
    expect(d.questions).toHaveLength(1);
    expect(parsePracticeQuestion(bad, refsOf(POLY))).toBeNull();
  });

  it("drops questions with an id not marked 考, wrong kind, bad markers, bad answers, duplicate options", () => {
    const r = refsOf(POLY);
    expect(parsePracticeQuestion(polyAsk({ focusId: "get.become" }), r)).toBeNull(); // 參考
    expect(parsePracticeQuestion(polyAsk({ focusId: "made.up" }), r)).toBeNull();
    expect(parsePracticeQuestion(polyAsk({ kind: "choice" }), r)).toBeNull();
    expect(parsePracticeQuestion(polyAsk({ text: "No marker here" }), r)).toBeNull();
    expect(parsePracticeQuestion(polyAsk({ text: "[[get]] and [[get]]" }), r)).toBeNull();
    expect(parsePracticeQuestion(polyAsk({ answerId: "zzz" }), r)).toBeNull();
    expect(parsePracticeQuestion(polyAsk({ answerId: "get.obtain" }), r)).toBeNull(); // not the tested sense
    expect(parsePracticeQuestion(polyAsk({ options: [{ id: "get.arrive", text: "到達" }, { id: "get.arrive", text: "別的" }, { id: "get.obtain", text: "得到" }] }), r)).toBeNull();
    expect(parsePracticeQuestion(polyAsk({ options: [{ id: "get.arrive", text: "到達" }, { id: "get.obtain", text: "到達" }, { id: "get.become", text: "變得" }] }), r)).toBeNull();
    expect(parsePracticeQuestion(polyAsk({ options: polyAsk().options.slice(0, 2) }), r)).toBeNull();
  });

  it("pick-word needs exactly one gap; same-sense one marked word", () => {
    const r = refsOf(POLY);
    const pick = polyAsk({
      kind: "pick-word",
      text: "I ____ home at six.",
      options: ["get", "make", "do", "put"].map((w) => ({ id: w, text: w })),
      answerId: "get",
    });
    expect(parsePracticeQuestion(pick, r)?.text).toBe("I ____ home at six.");
    expect(parsePracticeQuestion({ ...pick, text: "I ________ home at six." }, r)?.text).toBe("I ____ home at six.");
    expect(parsePracticeQuestion({ ...pick, text: "I ____ home ____." }, r)).toBeNull();
    expect(parsePracticeQuestion({ ...pick, text: "I got home." }, r)).toBeNull();
    const same = polyAsk({
      kind: "same-sense",
      text: "I [[get]] home at six.",
      options: ["I got to Taipei.", "I got a gift.", "I got angry."].map((t, i) => ({ id: `o${i}`, text: t })),
      answerId: "o0",
    });
    expect(parsePracticeQuestion(same, r)?.kind).toBe("same-sense");
    expect(parsePracticeQuestion({ ...same, text: "I get home." }, r)).toBeNull();
  });

  it("vocab: which-sense with a/b/c ids; unknown errorTag is dropped", () => {
    const q = {
      focusId: "e1",
      kind: "which-sense",
      text: "He was [[reluctant]] to go.",
      options: ["a", "b", "c"].map((id, i) => ({ id, text: ["不情願的", "熱心的", "生氣的"][i] })),
      answerId: "a",
      explanation: "to go 前面。",
      optionNotes: { b: "相反", a: "不該有", z: "不存在" },
      sentenceZh: "他不情願去。",
      errorTag: "whatever",
    };
    const d = parsePracticeQuestion(q, refsOf(VOCAB))!;
    expect(d.focus).toEqual({ kind: "word", id: "e1" });
    expect(d.errorTag).toBeUndefined();
    expect(d.optionNotes).toEqual({ b: "相反" });
    expect(parsePracticeQuestion({ ...q, kind: "same-sense" }, refsOf(VOCAB))).toBeNull();
    expect(parsePracticeQuestion({ ...q, errorTag: "meaning" }, refsOf(VOCAB))?.errorTag).toBe("meaning");
  });

  it("mix: routes by category, grammar kinds and the grammar tag list", () => {
    const r = refsOf(MIX);
    const choice = {
      focusId: "past-simple/regular",
      kind: "choice",
      text: "She ____ yesterday.",
      options: ["walked", "walks", "walk"].map((t) => ({ id: t, text: t })),
      answerId: "walked",
      explanation: "yesterday。",
      errorTag: "nonsense",
    };
    const g = parsePracticeQuestion(choice, r)!;
    expect(g.focus).toEqual({ kind: "grammar-objective", id: "past-simple/regular" });
    expect(g.errorTag).toBe("other");
    expect(parsePracticeQuestion({ ...choice, kind: "which-sense" }, r)).toBeNull();
    const fe = { ...choice, kind: "find-error", text: "She walk yesterday.", options: ["She", "walk", "yesterday"].map((t) => ({ id: t, text: t })), answerId: "walk" };
    expect(parsePracticeQuestion(fe, r)?.kind).toBe("find-error");
    expect(parsePracticeQuestion({ ...fe, options: [{ id: "x", text: "nope" }, ...fe.options.slice(1)] }, r)).toBeNull();
    expect(parsePracticeQuestion(polyAsk({ focusId: "get.obtain", answerId: "get.arrive" }), r)).toBeNull();
    expect(parsePracticeQuestion(polyAsk(), r)?.focus.kind).toBe("sense");
  });

  it("fewer than half usable → bad_output; none → bad_output; no turns → bad_output", () => {
    const r = refsOf(POLY);
    const bad = polyAsk({ answerId: "nope" });
    expect(() => parsePracticeScenario(reply([turn([polyAsk()]), turn([bad]), turn([bad])]), r)).toThrow(/only 1 of 3/);
    expect(() => parsePracticeScenario(reply([turn([bad])]), r)).toThrow();
    expect(() => parsePracticeScenario({ scene: "x" }, r)).toThrow();
    expect(parsePracticeScenario(reply([turn([polyAsk()]), turn([polyAsk({ text: "How to [[get]] there?" })]), turn([bad])]), r).questions).toHaveLength(2);
  });

  it("dedupes repeated sentences; the bare parser infers the category from the id", () => {
    const d = parsePracticeScenario(reply([turn([polyAsk()]), turn([polyAsk()])]));
    expect(d.questions).toHaveLength(1);
    expect(d.questions[0].focus.kind).toBe("sense");
  });

  it("practiceScenarioFor binds the request", () => {
    const task = practiceScenarioFor(POLY);
    const json = JSON.stringify(reply([turn([polyAsk({ focusId: "get.become" })]), turn([polyAsk()])]));
    const out = task.parse!({ text: json, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: "m", stop: "end", transport: "fetch" });
    expect(out.questions).toHaveLength(1);
  });
});

const sysText = (req: AiRequest) => req.system.slice(1).map((b) => b.text).join("\n");

describe("practiceScenario.build", () => {
  it("poly: base prompt verbatim, 考／參考 lines, weakness, previous, words, avoid", () => {
    const req = practiceScenario.build(
      {
        request: POLY,
        count: 6,
        weakness: "get.arrive（到達）｜錯 2 次（最近 10/12）",
        previous: { scene: "咖啡店", lastLines: ["A: Hi.", "B: Hello."] },
        words: ["apron"],
        avoid: ["I got home."],
      },
      ctx()
    );
    expect(req.system[0].text).toBe(PRACTICE_SCENARIO_BASE_PROMPT);
    const sys = sysText(req);
    expect(sys).toContain("〔出題參考〕\n考 get.arrive｜到達｜get arrive｜線索 arrive\n考 get.obtain｜得到｜get obtain｜線索 obtain\n參考 get.become｜變得");
    expect(sys).toContain("參考 run.operate｜經營");
    expect(sys).toContain("〔學習弱點〕\nget.arrive（到達）");
    expect(sys).toContain("〔上一段〕\n場景：咖啡店\n最後兩句：\n- A: Hi.\n- B: Hello.");
    expect(sys).toContain("〔已學單字〕apron");
    expect(sys).toContain("〔已出過的句子〕\n- I got home.");
    const user = req.messages.at(-1)!.content;
    expect(user).toContain("任務：常用多義詞情境練習（get）");
    expect(user).toContain("出 6 題");
    expect(user).toContain("sense-confusion、light-verb");
    expect(req.output?.name).toBe("practice_scenario");
  });

  it("omits optional blocks when empty", () => {
    const sys = sysText(practiceScenario.build({ request: VOCAB }, ctx()));
    expect(sys).toContain("〔出題參考〕\ne1｜reluctant｜不情願的｜adj.");
    for (const h of ["〔學習弱點〕", "〔上一段〕", "〔已學單字〕", "〔已出過的句子〕"]) expect(sys).not.toContain(h);
    const user = practiceScenario.build({ request: VOCAB }, ctx()).messages.at(-1)!.content;
    expect(user).toContain("單字情境練習（1 個字）");
    expect(user).toContain("出 6 題");
    expect(user).toContain("meaning、form、collocation、confusable");
  });

  it("mix: three reference sections and the union of error tags", () => {
    const req = practiceScenario.build({ request: MIX, count: 20 }, ctx());
    const sys = sysText(req);
    expect(sys).toContain("【單字】\ne1｜reluctant");
    expect(sys).toContain("【常用字】\n考 get.arrive");
    expect(sys).toContain("參考 get.obtain");
    expect(sys).toContain("【文法】\npast-simple/regular｜規則動詞｜過去式（V-ed）");
    const user = req.messages.at(-1)!.content;
    expect(user).toContain("綜合情境練習");
    expect(user).toContain("出 10 題");
    expect(user).toContain("sense-confusion");
    expect(user).toContain("tense-choice");
    expect(user).toContain("confusable");
  });

  it("mix with only some categories lists only those", () => {
    const sys = sysText(practiceScenario.build({ request: { track: "mix", vocab: VOCAB.track === "vocab" ? VOCAB.words : [] } }, ctx()));
    expect(sys).toContain("【單字】");
    expect(sys).not.toContain("【文法】");
    expect(sys).not.toContain("【常用字】");
  });
});
