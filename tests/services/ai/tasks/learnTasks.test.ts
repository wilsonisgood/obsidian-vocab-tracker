import { describe, expect, it } from "vitest";
import { defaultLearnerProfile, type LearnerProfile } from "../../../../src/core/model/settings";
import { templateSlots } from "../../../../src/core/text/template";
import { buildTriviaContext, knownWordList, type TriviaInput } from "../../../../src/services/ai/context/triviaContext";
import { buildWordContext, type WordInput } from "../../../../src/services/ai/context/wordContext";
import type { AiRequest, AiResult, ChatMessage } from "../../../../src/services/ai/providers/types";
import {
  FAMILY_BASE_PROMPT,
  FAMILY_EXPAND_SCHEMA,
  FAMILY_SCHEMA,
  FAMILY_TEMPLATES,
  familyExpand,
  familyGenerate,
  parseFamilies,
  parseFamilyExpandMembers,
  type FamilyExpandInput,
  type FamilyInput,
} from "../../../../src/services/ai/tasks/family";
import { TaskRegistry } from "../../../../src/services/ai/tasks/registry";
import {
  splitTrivia,
  TRIVIA_BASE_PROMPT,
  TRIVIA_TASKS,
  TRIVIA_TEMPLATES,
  triviaEtymology,
  triviaFollowup,
  triviaJoke,
  triviaNext,
  triviaQuiz,
} from "../../../../src/services/ai/tasks/trivia";
import { VERB_BASE_PROMPT, VERB_TEMPLATE, VERB_USAGE_SCHEMA, verbUsage } from "../../../../src/services/ai/tasks/verbUsage";
import { entry } from "../../learn/fakes";

// Snapshot tests of the M7 requests (規劃書 06 §11): any prompt change to
// family / verb / trivia shows up as a reviewable diff in
// __snapshots__/learnTasks.test.ts.snap.

const A1_TOEFL: LearnerProfile = { level: "A1", goal: "toefl", answerLanguage: "zh-TW", maxAnswerChars: 300, extra: "" };
const ctx = (profile: LearnerProfile = defaultLearnerProfile(), history: ChatMessage[] = []) => ({ profile, history });

function render(req: AiRequest): string {
  const sys = req.system.map((b, i) => `── system[${i}]${b.cache ? " (cache)" : ""} ──\n${b.text}`);
  const msgs = req.messages.map((m) => `── ${m.role} ──\n${m.content}`);
  const out = req.output ? [`output=${req.output.name}`] : [];
  return [`tier=${req.tier} maxTokens=${req.maxTokens}`, ...out, ...sys, ...msgs].join("\n\n");
}

function aiResult(text: string, extra: Partial<AiResult> = {}): AiResult {
  return { text, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: "m", stop: "end", transport: "fetch", ...extra };
}

const KNOWN: FamilyInput["known"] = [
  { word: "glittery", partOfSpeech: "adjective", zh: "閃亮的" },
  { word: "leotard", partOfSpeech: "noun", zh: "連身緊身衣" },
  { word: "aprons", partOfSpeech: "noun" },
  { word: "toil" },
];

const SUGARCOAT: WordInput = {
  entry: { word: "sugarcoat", phonetic: "/ˈʃʊɡ.ə.kəʊt/", partOfSpeech: "verb", definitionZh: "粉飾", example: "I'm not going to sugarcoat it." },
};

const TRIVIA: TriviaInput = {
  subject: { word: "apron", partOfSpeech: "noun", definitionZh: "圍裙", example: "She wore an apron." },
  knownWords: ["apron", "napkin", "glittery"],
  knownTotal: 240,
  told: [{ word: "glittery", title: "gl- 和光有關" }],
};

describe("M7 AiRequest snapshots", () => {
  it("family.generate — seeded (W3)", () => {
    const req = familyGenerate.build({ known: KNOWN, seeds: [KNOWN[0]], existingTopics: ["kitchenware"] }, ctx(A1_TOEFL));
    expect(render(req)).toMatchSnapshot();
  });

  it("family.generate — regroup the whole list (L5)", () => {
    expect(render(familyGenerate.build({ known: KNOWN }, ctx()))).toMatchSnapshot();
  });

  it("family.expand — 還有哪些字 (09 §4/§5.1)", () => {
    const input: FamilyExpandInput = {
      topic: "clothing",
      label: "服裝",
      groups: [{ label: "舞台服裝", members: [{ word: "glittery", zh: "閃亮的", emoji: "✨" }] }],
      known: KNOWN,
    };
    expect(render(familyExpand.build(input, ctx(A1_TOEFL)))).toMatchSnapshot();
  });

  it("verb.usage", () => {
    expect(render(verbUsage.build(SUGARCOAT, ctx(A1_TOEFL)))).toMatchSnapshot();
  });

  it("trivia.next — A1/TOEFL profile", () => {
    expect(render(triviaNext.build(TRIVIA, ctx(A1_TOEFL)))).toMatchSnapshot();
  });

  it("trivia.quiz / etymology / joke — final user turn", () => {
    for (const t of [triviaQuiz, triviaEtymology, triviaJoke]) {
      expect(t.build(TRIVIA, ctx()).messages.at(-1)?.content).toMatchSnapshot(t.id);
    }
  });

  it("trivia.followup — with history and selection", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "任務：再來一則冷知識（主角：apron）" },
      { role: "assistant", content: "**a napron → an apron**\n\napron 原本是 a napron。" },
    ];
    const req = triviaFollowup.build({ ...TRIVIA, question: "還有類似的例子嗎？", selection: "a napron" }, ctx(defaultLearnerProfile(), history));
    expect(render(req)).toMatchSnapshot();
  });
});

describe("M7 prompt invariants", () => {
  it("every base prompt asks for Traditional Chinese and forbids making up word origins", () => {
    for (const base of [FAMILY_BASE_PROMPT, VERB_BASE_PROMPT, TRIVIA_BASE_PROMPT]) {
      expect(base).toContain("繁體中文");
      expect(base).toContain("不要編造");
    }
    expect(TRIVIA_BASE_PROMPT).toContain("不確定就直接說「不確定」");
    expect(TRIVIA_BASE_PROMPT).toContain("不要編造字源");
    expect(FAMILY_BASE_PROMPT).toContain("不要編造字源");
  });

  it("every trivia task shares the cached prefix: base prompt + learned words", () => {
    const prefixes = TRIVIA_TASKS.map((t) => JSON.stringify(t.build({ ...TRIVIA, question: "q" }, ctx()).system.filter((b) => b.cache)));
    expect(new Set(prefixes).size).toBe(1);
    const sys = triviaNext.build(TRIVIA, ctx()).system;
    expect(sys[0]).toEqual({ text: TRIVIA_BASE_PROMPT, cache: true });
    expect(sys[1].text.startsWith("〔已學單字〕（共 240 個，以下是最近學的 3 個）")).toBe(true);
    // Subject and told titles change every round: after the cache breakpoint.
    expect(sys.slice(2).every((b) => !b.cache)).toBe(true);
  });

  it("caps a new trivia at 200 characters, follow-ups keep the learner's limit", () => {
    const profile = (req: AiRequest) => req.system.at(-1)?.text ?? "";
    expect(profile(triviaNext.build(TRIVIA, ctx()))).toContain("盡量在 200 字以內");
    expect(profile(triviaNext.build(TRIVIA, ctx({ ...defaultLearnerProfile(), maxAnswerChars: 120 })))).toContain("盡量在 120 字以內");
    expect(profile(triviaFollowup.build({ ...TRIVIA, question: "q" }, ctx()))).toContain("盡量在 300 字以內");
  });

  it("structured tasks send a strict schema and no prose length limit", () => {
    const fam = familyGenerate.build({ known: KNOWN }, ctx());
    const verb = verbUsage.build(SUGARCOAT, ctx());
    expect(fam.output).toEqual({ name: "word_families", schema: FAMILY_SCHEMA });
    expect(verb.output).toEqual({ name: "verb_usage", schema: VERB_USAGE_SCHEMA });
    for (const req of [fam, verb]) expect(req.system.at(-1)?.text).not.toContain("字以內");

    // Strict mode: every object is closed and requires all its properties.
    const walk = (s: Record<string, unknown>) => {
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        expect([...(s.required as string[])].sort()).toEqual(Object.keys(s.properties as object).sort());
        for (const p of Object.values(s.properties as Record<string, Record<string, unknown>>)) walk(p);
      }
      if (s.type === "array") walk(s.items as Record<string, unknown>);
    };
    walk(FAMILY_SCHEMA);
    walk(VERB_USAGE_SCHEMA);
  });

  it("templates only use slots their context builder provides", () => {
    const tSlots = Object.keys(buildTriviaContext(TRIVIA).slots);
    for (const [id, tpl] of Object.entries(TRIVIA_TEMPLATES)) {
      expect({ id, missing: templateSlots(tpl).filter((s) => !tSlots.includes(s)) }).toEqual({ id, missing: [] });
    }
    // VERB_TEMPLATE also takes `onlyPos` (VerbUsageService.regenerate /
    // U2's per-pos 重新產生), which the shared word context doesn't
    // provide — callers add it to the slots themselves (verbUsage.build()).
    const wSlots = [...Object.keys(buildWordContext(SUGARCOAT).slots), "onlyPos"];
    expect(templateSlots(VERB_TEMPLATE).filter((s) => !wSlots.includes(s))).toEqual([]);
    expect(templateSlots(FAMILY_TEMPLATES.seeded).sort()).toEqual(["existingTopics", "seeds"]);
  });

  it("registers cleanly next to the existing tasks", () => {
    const reg = new TaskRegistry([familyGenerate, verbUsage, ...TRIVIA_TASKS]);
    expect(reg.forSurface("trivia").map((t) => t.id)).toEqual([
      "trivia.next",
      "trivia.quiz",
      "trivia.etymology",
      "trivia.joke",
      "trivia.followup",
    ]);
    expect(reg.forSurface("family").map((t) => t.id)).toEqual(["family.generate"]);
    expect(reg.forSurface("verb").map((t) => t.id)).toEqual(["verb.usage"]);
    for (const t of reg.all()) expect(!!t.label).toBe(t.id !== "trivia.followup");
  });
});

describe("family.generate parse", () => {
  it("reads native JSON, cleans it up and drops empty parts", () => {
    const json = {
      families: [
        {
          topic: " clothing ",
          label: "服裝",
          emoji: " 👗 ",
          groups: [
            { label: "舞台", members: [{ word: "glittery", zh: "閃亮", emoji: "✨" }, { word: "Glittery", zh: "dup", emoji: "✨" }, { word: " ", zh: "" }] },
            { label: "空的", members: [] },
          ],
        },
        { topic: "", label: "", groups: [{ label: "x", members: [{ word: "a", zh: "" }] }] },
        { topic: "empty", label: "空", groups: [] },
      ],
    };
    expect(familyGenerate.parse!(aiResult("", { json }))).toEqual([
      { topic: "clothing", label: "服裝", emoji: "👗", groups: [{ label: "舞台", members: [{ word: "glittery", zh: "閃亮", emoji: "✨" }] }] },
    ]);
  });

  it("defaults a missing emoji to an empty string", () => {
    const json = { families: [{ topic: "x", label: "X", groups: [{ label: "g", members: [{ word: "a", zh: "" }] }] }] };
    expect(familyGenerate.parse!(aiResult("", { json }))[0]).toMatchObject({ emoji: "", groups: [{ label: "g", members: [{ word: "a", zh: "", emoji: "" }] }] });
  });

  it("falls back to JSON in the text (prompted providers)", () => {
    const text = '```json\n{"families":[{"topic":"gl-","label":"gl- 發光家族","groups":[{"label":"光","members":[{"word":"gleam","zh":"光澤"}]}]}]}\n```';
    expect(familyGenerate.parse!(aiResult(text))[0].topic).toBe("gl-");
  });

  it("throws bad_output on the wrong shape, non-JSON or a cut-off answer", () => {
    for (const r of [
      aiResult("", { json: { families: "no" } }),
      aiResult("", { json: { families: [{ topic: "x", groups: "no" }] } }),
      aiResult("", { json: { families: [{ topic: "x", groups: [{ label: "g", members: ["str"] }] }] } }),
      aiResult("I can't do that"),
      aiResult('{"families":[{"topic"', { stop: "max_tokens" }),
    ]) {
      expect(() => familyGenerate.parse!(r)).toThrow(expect.objectContaining({ code: "bad_output" }));
    }
    expect(() => parseFamilies(null)).toThrow(expect.objectContaining({ code: "bad_output" }));
  });
});

describe("family.expand", () => {
  it("strict schema: every object is closed and requires all its properties", () => {
    const walk = (s: Record<string, unknown>) => {
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        expect([...(s.required as string[])].sort()).toEqual(Object.keys(s.properties as object).sort());
        for (const p of Object.values(s.properties as Record<string, Record<string, unknown>>)) walk(p);
      }
      if (s.type === "array") walk(s.items as Record<string, unknown>);
    };
    walk(FAMILY_EXPAND_SCHEMA);
  });

  it("is fast-tier, structured JSON with no label (not a quick-action button)", () => {
    const input: FamilyExpandInput = { topic: "clothing", label: "服裝", groups: [], known: [] };
    const req = familyExpand.build(input, ctx());
    expect(req.tier).toBe("fast");
    expect(req.output).toEqual({ name: "family_expand", schema: FAMILY_EXPAND_SCHEMA });
    expect(req.system.at(-1)?.text).not.toContain("字以內");
    expect(familyExpand.label).toBeUndefined();
  });

  it("parse reads members, trims group/word/zh/emoji and drops one with no word", () => {
    const json = {
      members: [
        { group: " 舞台服裝 ", word: " sequin ", zh: " 亮片 ", emoji: " ✨ " },
        { group: "x", word: "Sequin", zh: "dup", emoji: "✨" },
        { group: "x", word: " ", zh: "", emoji: "" },
      ],
    };
    expect(parseFamilyExpandMembers(json)).toEqual([{ group: "舞台服裝", word: "sequin", zh: "亮片", emoji: "✨" }]);
  });

  it("throws bad_output on the wrong shape, non-JSON or a cut-off answer", () => {
    for (const r of [
      aiResult("", { json: { members: "no" } }),
      aiResult("", { json: { members: ["str"] } }),
      aiResult("I can't do that"),
      aiResult('{"members":[{"word"', { stop: "max_tokens" }),
    ]) {
      expect(() => familyExpand.parse!(r)).toThrow(expect.objectContaining({ code: "bad_output" }));
    }
    expect(() => parseFamilyExpandMembers(null)).toThrow(expect.objectContaining({ code: "bad_output" }));
  });
});

describe("verb.usage parse (1006-2 #18 — every part of speech, one answer)", () => {
  it("reads an entry per part of speech, resolving pos codes and words alike", () => {
    const json = {
      entries: [
        { pos: "v", patterns: [{ pattern: "sugarcoat it", meaningZh: "直說", example: "Don't sugarcoat it." }], related: [{ phrase: "gloss over", zh: "輕描淡寫" }] },
        { pos: "noun", patterns: [{ pattern: "a sugarcoated pill", meaningZh: "包裝過的壞消息", example: "" }] },
      ],
    };
    expect(verbUsage.parse!(aiResult("", { json }))).toEqual({
      entries: [
        { pos: "v", patterns: json.entries[0].patterns, related: json.entries[0].related },
        { pos: "n", patterns: json.entries[1].patterns, related: [] },
      ],
    });
  });

  it("drops an entry with an unknown pos or no usable patterns, tolerates a missing related list", () => {
    const json = {
      entries: [
        { pos: "xyz", patterns: [{ pattern: "whatever" }] },
        { pos: "adj", patterns: [{ pattern: "  " }] },
        { pos: "adv", patterns: [{ pattern: "quickly" }] },
      ],
    };
    expect(verbUsage.parse!(aiResult("", { json }))).toEqual({
      entries: [{ pos: "adv", patterns: [{ pattern: "quickly", meaningZh: "", example: "" }], related: [] }],
    });
  });

  it("throws bad_output on the wrong shape or when every entry is dropped", () => {
    for (const json of [
      { patterns: [] },
      { entries: "no" },
      { entries: [{ pos: "v", patterns: [] }] },
      { entries: [{ pos: "???", patterns: [{ pattern: "x" }] }] },
    ]) {
      expect(() => verbUsage.parse!(aiResult("", { json }))).toThrow(expect.objectContaining({ code: "bad_output" }));
    }
  });
});

describe("trivia answers", () => {
  it("splits a bold title line from the body", () => {
    expect(splitTrivia("**a napron → an apron**\n\napron 原本是 a napron。")).toEqual({ title: "a napron → an apron", body: "apron 原本是 a napron。" });
    expect(splitTrivia("## **標題**：\n內容")).toEqual({ title: "標題", body: "內容" });
    expect(splitTrivia("標題：gl- 和光有關\n\nglow、gleam")).toEqual({ title: "gl- 和光有關", body: "glow、gleam" });
    expect(triviaNext.parse!(aiResult("**T**\n\nB"))).toEqual({ title: "T", body: "B" });
  });

  it("uses the first sentence as the title when there's no title line", () => {
    expect(splitTrivia("有，**nickname** 剛好反過來。原本是 an ekename。")).toEqual({
      title: "有，nickname 剛好反過來。",
      body: "有，**nickname** 剛好反過來。原本是 an ekename。",
    });
    expect(splitTrivia("**only a bold line**").title).toBe("only a bold line");
    expect(splitTrivia("x".repeat(60)).title).toHaveLength(40);
  });
});

describe("knownWordList", () => {
  it("lists live words most recent first, de-duplicated and capped", () => {
    const entries = [
      entry("1", "old", { createdAt: "2026-01-01T00:00:00Z" }),
      entry("2", "new", { createdAt: "2026-10-01T00:00:00Z" }),
      entry("3", "New", { createdAt: "2026-09-01T00:00:00Z" }),
      entry("4", "legacy", { added: "2026-05-01 10:00:00" }),
      entry("5", "gone", { createdAt: "2026-10-02T00:00:00Z", deletedAt: "2026-10-03T00:00:00Z" }),
    ];
    expect(knownWordList(entries)).toEqual(["new", "legacy", "old"]);
    expect(knownWordList(entries, 2)).toEqual(["new", "legacy"]);
  });
});
