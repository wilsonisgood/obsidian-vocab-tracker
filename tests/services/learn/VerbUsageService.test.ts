import { describe, expect, it } from "vitest";
import { AiError } from "../../../src/services/ai/errors";
import { VerbUsageService, verbThreadId, type EntryWithUsage } from "../../../src/services/learn/VerbUsageService";
import { entry, FakeLearnAi, FakeVocab, result } from "./fakes";

const NOW = new Date("2026-10-04T12:00:00Z");

const USAGE = {
  patterns: [
    { pattern: "sugarcoat + 名詞", meaningZh: "把壞消息說得比較好聽", example: "I won't sugarcoat the results." },
    { pattern: "  ", meaningZh: "dropped", example: "" },
  ],
  related: [{ phrase: "gloss over", zh: "輕描淡寫帶過" }],
};

function setup(script = () => result(JSON.stringify(USAGE), { json: USAGE, model: "claude-sonnet-5-5" })) {
  const vocab = new FakeVocab([
    entry("v1", "sugarcoat", { partOfSpeech: "verb", example: "I'm not going to sugarcoat it." }),
    entry("v2", "Expel", { partOfSpeech: "transitive verb" }),
    entry("n1", "apron", { partOfSpeech: "noun" }),
    entry("a1", "quickly", { partOfSpeech: "adverb" }),
  ]);
  const ai = new FakeLearnAi(script);
  const verbs = new VerbUsageService({ ai, vocab, clock: () => NOW });
  return { vocab, ai, verbs };
}

describe("VerbUsageService", () => {
  it("lists only verbs, alphabetically", () => {
    const { verbs } = setup();
    expect(verbs.verbs().map((e) => e.word)).toEqual(["Expel", "sugarcoat"]);
  });

  it("generates, stamps and stores the usage block on the entry", async () => {
    const { verbs, vocab, ai } = setup();
    const busy: boolean[] = [];
    verbs.events.on("verb:busy", (e) => busy.push(e.busy));
    const e = vocab.entries[0];

    const block = await verbs.generate(e);
    expect(block).toEqual({
      patterns: [USAGE.patterns[0]],
      related: USAGE.related,
      generatedAt: NOW.toISOString(),
      model: "claude-sonnet-5-5",
    });
    expect((e as EntryWithUsage).usage).toBe(block);
    expect(verbs.usage(e)).toBe(block);
    expect(vocab.touched).toEqual([e]);
    expect(busy).toEqual([true, false]);
    expect(verbs.isBusy(e.id)).toBe(false);
    expect(ai.threadIds).toEqual([verbThreadId("v1")]);
    // The learner's own sentence goes into the prompt.
    expect(ai.requests[0].system[1].text).toContain("〔出處句子〕\nI'm not going to sugarcoat it.");
  });

  it("refuses non-verbs", async () => {
    const { verbs, vocab, ai } = setup();
    expect(verbs.canGenerate(vocab.entries[2])).toBe(false);
    expect(verbs.canGenerate(vocab.entries[3])).toBe(false);
    await expect(verbs.generate(vocab.entries[2])).rejects.toThrow(/not a verb/);
    expect(ai.requests).toHaveLength(0);
  });

  it("keeps the old block when the answer is malformed", async () => {
    const { verbs, vocab } = setup(() => result("sorry", { json: { patterns: [] } }));
    const e = vocab.entries[0] as EntryWithUsage;
    const old = { patterns: [], related: [], generatedAt: "x", model: "m" };
    e.usage = old;
    await expect(verbs.generate(e)).rejects.toMatchObject({ code: "bad_output" });
    expect(e.usage).toBe(old);
    expect(verbs.isBusy(e.id)).toBe(false);
  });

  it("passes AI errors through and can be stopped", async () => {
    const { verbs, vocab, ai } = setup(() => {
      throw new AiError("rate_limit");
    });
    await expect(verbs.generate(vocab.entries[0])).rejects.toMatchObject({ code: "rate_limit" });
    verbs.stop("v1");
    expect(ai.cancelled).toEqual(["verb:v1"]);
  });
});
