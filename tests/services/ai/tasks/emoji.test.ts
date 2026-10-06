import { describe, expect, it } from "vitest";
import { defaultLearnerProfile, type LearnerProfile } from "../../../../src/core/model/settings";
import type { AiResult, ChatMessage } from "../../../../src/services/ai/providers/types";
import { parseWordEmojiItems, WORD_EMOJI_SCHEMA, wordEmoji, type WordEmojiInput } from "../../../../src/services/ai/tasks/emoji";

// Build snapshot + bad-data parse for word.emoji (09 §4, §5.2 — EmojiService
// batches of up to 30), mirroring learnTasks.test.ts's coverage of
// family.generate/family.expand.

const ctx = (profile: LearnerProfile = defaultLearnerProfile(), history: ChatMessage[] = []) => ({ profile, history });

function aiResult(text: string, extra: Partial<AiResult> = {}): AiResult {
  return { text, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: "m", stop: "end", transport: "fetch", ...extra };
}

const INPUT: WordEmojiInput = {
  words: [
    { word: "apron", partOfSpeech: "noun", zh: "圍裙" },
    { word: "glitter", partOfSpeech: "verb" },
    { word: "toil" },
  ],
};

describe("word.emoji build", () => {
  it("is fast-tier, structured JSON, no quick-action label", () => {
    const req = wordEmoji.build(INPUT, ctx());
    expect(req.tier).toBe("fast");
    expect(req.maxTokens).toBe(wordEmoji.maxTokens);
    expect(req.output).toEqual({ name: "word_emoji", schema: WORD_EMOJI_SCHEMA });
    expect(req.system.at(-1)?.text).not.toContain("字以內");
    expect(wordEmoji.label).toBeUndefined();
    expect(req.system.map((b) => b.text).join("\n\n")).toMatchSnapshot();
    expect(req.messages.at(-1)?.content).toMatchSnapshot();
  });

  it("strict schema: every object is closed and requires all its properties", () => {
    const walk = (s: Record<string, unknown>) => {
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        expect([...(s.required as string[])].sort()).toEqual(Object.keys(s.properties as object).sort());
        for (const p of Object.values(s.properties as Record<string, Record<string, unknown>>)) walk(p);
      }
      if (s.type === "array") walk(s.items as Record<string, unknown>);
    };
    walk(WORD_EMOJI_SCHEMA);
  });
});

describe("word.emoji parse", () => {
  it("reads items, trims word/emoji and de-dupes by word", () => {
    const json = {
      items: [
        { word: " apron ", emoji: " 👝 " },
        { word: "Apron", emoji: "👜" },
        { word: " ", emoji: "🔤" },
      ],
    };
    expect(parseWordEmojiItems(json)).toEqual([{ word: "apron", emoji: "👝" }]);
  });

  it("throws bad_output on the wrong shape, non-JSON or a cut-off answer", () => {
    for (const r of [
      aiResult("", { json: { items: "no" } }),
      aiResult("", { json: { items: ["str"] } }),
      aiResult("I can't do that"),
      aiResult('{"items":[{"word"', { stop: "max_tokens" }),
    ]) {
      expect(() => wordEmoji.parse!(r)).toThrow(expect.objectContaining({ code: "bad_output" }));
    }
    expect(() => parseWordEmojiItems(null)).toThrow(expect.objectContaining({ code: "bad_output" }));
  });
});
