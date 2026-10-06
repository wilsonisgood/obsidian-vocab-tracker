import { describe, expect, it } from "vitest";
import { defaultLearnerProfile, type LearnerProfile } from "../../../../src/core/model/settings";
import type { ChatMessage } from "../../../../src/services/ai/providers/types";
import { isAiError } from "../../../../src/services/ai/errors";
import {
  DNA_ANALYZE_BASE_PROMPT,
  DNA_CHAT_BASE_PROMPT,
  DNA_EXPAND_BASE_PROMPT,
  DNA_TASKS,
  dnaAnalyze,
  dnaCompare,
  dnaExamples,
  dnaExpand,
  dnaFollowup,
  parseDnaAnalyze,
  parseDnaExpand,
  type DnaAnalyzeInput,
  type DnaChatInput,
  type DnaExpandInput,
} from "../../../../src/services/ai/tasks/dna";
import type { AiRequest, AiResult } from "../../../../src/services/ai/providers/types";

const ctx = (profile: LearnerProfile = defaultLearnerProfile(), history: ChatMessage[] = []) => ({ profile, history });

function render(req: AiRequest): string {
  const sys = req.system.map((b, i) => `── system[${i}]${b.cache ? " (cache)" : ""} ──\n${b.text}`);
  const msgs = req.messages.map((m) => `── ${m.role}${m.cache ? " (cache)" : ""} ──\n${m.content}`);
  return [`tier=${req.tier} maxTokens=${req.maxTokens}`, ...sys, ...msgs].join("\n\n");
}

function json(value: unknown, extra: Partial<AiResult> = {}): AiResult {
  return {
    text: "",
    json: value,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    model: "claude-sonnet-5",
    stop: "end",
    transport: "fetch",
    ...extra,
  };
}

const ANALYZE_INPUT: DnaAnalyzeInput = {
  words: [
    { word: "retain", partOfSpeech: "verb", zh: "保留" },
    { word: "containers", partOfSpeech: "noun", zh: "容器" },
  ],
  knownMorphemes: [{ id: "m-ten", type: "root", form: "tain", variants: ["ten", "tin"] }],
};

const EXPAND_INPUT: DnaExpandInput = {
  morpheme: { type: "root", form: "tain", variants: ["ten", "tin"], meaningZh: "握、持有" },
  exclude: ["retain", "contain"],
};

const CHAT_INPUT: DnaChatInput = {
  morpheme: { type: "root", form: "tain", meaningZh: "握、持有" },
  words: [
    { word: "retain", partOfSpeech: "verb", zh: "保留" },
    { word: "container", partOfSpeech: "noun", zh: "容器" },
  ],
};

describe("dna.analyze / dna.expand — composed AiRequest snapshots", () => {
  it("dna.analyze — known morphemes + words to split", () => {
    expect(render(dnaAnalyze.build(ANALYZE_INPUT, ctx()))).toMatchSnapshot();
  });

  it("dna.analyze — no known morphemes yet", () => {
    expect(render(dnaAnalyze.build({ ...ANALYZE_INPUT, knownMorphemes: [] }, ctx()))).toMatchSnapshot();
  });

  it("dna.analyze — caps at 10 words / 200 known morphemes", () => {
    const words = Array.from({ length: 15 }, (_, i) => ({ word: `w${i}` }));
    const knownMorphemes = Array.from({ length: 210 }, (_, i) => ({ id: `id${i}`, type: "root" as const, form: `f${i}`, variants: [] }));
    const req = dnaAnalyze.build({ words, knownMorphemes }, ctx());
    const user = req.messages.at(-1)?.content ?? "";
    expect(user).toContain("（10 個）");
    expect(user).toContain("（200 個）");
    expect(user).not.toContain("w10");
    expect(user).not.toContain("id200");
  });

  it("dna.expand — with variants and an exclude list", () => {
    expect(render(dnaExpand.build(EXPAND_INPUT, ctx()))).toMatchSnapshot();
  });

  it("dna.expand — no variants, nothing to exclude yet", () => {
    expect(render(dnaExpand.build({ morpheme: { type: "prefix", form: "un", variants: [], meaningZh: "不、否定" }, exclude: [] }, ctx()))).toMatchSnapshot();
  });

  it("both tasks are fast tier, JSON-only (answerChars disabled)", () => {
    expect(dnaAnalyze.tier).toBe("fast");
    expect(dnaExpand.tier).toBe("fast");
    expect(dnaAnalyze.answerChars?.(ANALYZE_INPUT, 300)).toBe(0);
    expect(dnaExpand.answerChars?.(EXPAND_INPUT, 300)).toBe(0);
  });

  it("base prompts say what the spec requires (決定 2-5)", () => {
    expect(DNA_ANALYZE_BASE_PROMPT).toContain("一定要用它既有的 id");
    expect(DNA_ANALYZE_BASE_PROMPT).toContain("inflection");
    expect(DNA_ANALYZE_BASE_PROMPT).toContain("不要編造");
    expect(DNA_EXPAND_BASE_PROMPT).toContain("不要推薦");
    expect(DNA_CHAT_BASE_PROMPT).toContain("不要編造");
  });
});

describe("dna.examples / dna.compare / dna.followup — composed AiRequest snapshots", () => {
  it("dna.examples — full request", () => {
    expect(render(dnaExamples.build(CHAT_INPUT, ctx()))).toMatchSnapshot();
  });

  it("dna.compare — full request", () => {
    expect(render(dnaCompare.build(CHAT_INPUT, ctx()))).toMatchSnapshot();
  });

  it("dna.followup — with selection and history", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "造句" },
      { role: "assistant", content: "**retain**: She retained her composure." },
    ];
    const req = dnaFollowup.build({ ...CHAT_INPUT, selection: "retained", question: "這是什麼時態？" }, ctx(defaultLearnerProfile(), history));
    expect(render(req)).toMatchSnapshot();
  });

  it("dna.followup — no morpheme/words (defensive)", () => {
    const req = dnaFollowup.build({ words: [], question: "再講一次" }, ctx());
    // No extra cached block (the morpheme line) and no 〔已學單字〕 context
    // block when there's nothing to put in them.
    expect(req.system.filter((b) => b.cache)).toHaveLength(1);
    // Just the base prompt (cached) and the profile — no morpheme line, no
    // 〔已學單字〕 context block.
    expect(req.system).toHaveLength(2);
    expect(req.messages.at(-1)?.content).toContain("再講一次");
  });

  it("none of the chat tasks carry a label (DU draws its own buttons)", () => {
    for (const t of [dnaExamples, dnaCompare, dnaFollowup]) expect(t.label).toBeUndefined();
  });

  it("surface is \"morpheme\" for every DNA task", () => {
    for (const t of DNA_TASKS) expect(t.surface).toBe("morpheme");
  });

  it("registers exactly the five DNA tasks with unique ids", () => {
    expect(DNA_TASKS.map((t) => t.id)).toEqual(["dna.analyze", "dna.expand", "dna.examples", "dna.compare", "dna.followup"]);
    expect(new Set(DNA_TASKS.map((t) => t.id)).size).toBe(DNA_TASKS.length);
  });
});

describe("parseDnaAnalyze", () => {
  const VALID = {
    words: [
      { word: "retain", emoji: "🔒", status: "ok", gloss: "to keep", parts: [{ text: "re", type: "prefix", meaningZh: "再、回", morphemeRef: "m-re" }, { text: "tain", type: "root", meaningZh: "握、持有", morphemeRef: "m-ten" }] },
      { word: "jar", emoji: "🫙", status: "none", gloss: "罐子", parts: [] },
    ],
    morphemes: [
      {
        ref: "m-re",
        type: "prefix",
        form: "re",
        variants: [],
        meaningZh: "再、回",
        origin: "拉丁文 re-",
        timeline: [{ stage: "拉丁文", form: "re-" }],
        factTitle: "",
        factBody: "",
        suggested: [{ word: "redo", zh: "重做", emoji: "🔁" }],
      },
    ],
  };

  it("parses a well-formed response", () => {
    const out = parseDnaAnalyze(VALID);
    expect(out.words).toHaveLength(2);
    expect(out.words[1]).toEqual({ word: "jar", emoji: "🫙", status: "none", gloss: "罐子", parts: [] });
    expect(out.morphemes[0].ref).toBe("m-re");
    expect(out.morphemes[0].suggested).toEqual([{ word: "redo", zh: "重做", emoji: "🔁" }]);
  });

  it("drops a duplicated suggested word (case-insensitive) instead of failing", () => {
    const dup = { ...VALID, morphemes: [{ ...VALID.morphemes[0], suggested: [{ word: "Redo", zh: "a", emoji: "a" }, { word: "redo", zh: "b", emoji: "b" }] }] };
    expect(parseDnaAnalyze(dup).morphemes[0].suggested).toHaveLength(1);
  });

  it("rejects a response that isn't { words, morphemes }", () => {
    for (const bad of [null, {}, { words: [] }, { words: "x", morphemes: [] }]) {
      expect(() => parseDnaAnalyze(bad)).toThrow();
      try {
        parseDnaAnalyze(bad);
      } catch (e) {
        expect(isAiError(e) && e.code).toBe("bad_output");
      }
    }
  });

  it("rejects a word with a bad status or missing field", () => {
    expect(() => parseDnaAnalyze({ words: [{ word: "x", emoji: "a", status: "maybe", gloss: "g", parts: [] }], morphemes: [] })).toThrow();
    expect(() => parseDnaAnalyze({ words: [{ word: "x", status: "ok", gloss: "g", parts: [] }], morphemes: [] })).toThrow();
  });

  it("rejects a malformed part or morpheme", () => {
    const badPart = { words: [{ word: "x", emoji: "a", status: "ok", gloss: "g", parts: [{ text: "x", type: "weird", meaningZh: "", morphemeRef: "" }] }], morphemes: [] };
    expect(() => parseDnaAnalyze(badPart)).toThrow();
    const badMorpheme = { words: [], morphemes: [{ ref: "r1", type: "root" }] };
    expect(() => parseDnaAnalyze(badMorpheme)).toThrow();
  });

  it("the provider's own JSON (r.json) is used directly via the task's parse()", () => {
    expect(dnaAnalyze.parse?.(json(VALID))).toEqual(parseDnaAnalyze(VALID));
  });
});

describe("parseDnaExpand", () => {
  it("parses and dedupes words", () => {
    const out = parseDnaExpand({ words: [{ word: "contain", zh: "包含", emoji: "📦" }, { word: "Contain", zh: "x", emoji: "x" }] });
    expect(out.words).toEqual([{ word: "contain", zh: "包含", emoji: "📦" }]);
  });

  it("rejects a malformed response", () => {
    expect(() => parseDnaExpand({})).toThrow();
    expect(() => parseDnaExpand({ words: [{ word: "x" }] })).toThrow();
    try {
      parseDnaExpand({});
    } catch (e) {
      expect(isAiError(e) && e.code).toBe("bad_output");
    }
  });

  it("the task's parse() reads r.json", () => {
    const value = { words: [{ word: "sustain", zh: "維持", emoji: "💪" }] };
    expect(dnaExpand.parse?.(json(value))).toEqual(value);
  });
});
