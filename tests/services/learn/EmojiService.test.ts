import { describe, expect, it, vi } from "vitest";
import { defaultEmoji } from "../../../src/core/model/wordMeta";
import { EMOJI_BATCH_SIZE, EmojiService, type EmojiServiceDeps } from "../../../src/services/learn/EmojiService";
import { LearnStore } from "../../../src/services/learn/LearnStore";
import { MemoryStorage } from "../ai/fakes";
import { entry, FakeLearnAi, FakeVocab, result } from "./fakes";

// EmojiService (09 §2 決定 1, §4, §5.2, A7): emojiOf()'s fallback, ensure()'s
// background word.emoji batching (queue de-dup, one batch at a time, no
// overwriting a user's own pick, no retry on failure), and set()'s
// hand-picked override. Never touches VocabEntry — every assertion here
// reads wordMeta, not the entry.

const NOW = new Date("2026-10-07T12:00:00Z");
const flush = () => new Promise<void>((r) => setTimeout(r));

function setup(overrides: Partial<EmojiServiceDeps> & { vocabEntries?: ReturnType<typeof entry>[] } = {}) {
  const vocab = new FakeVocab(overrides.vocabEntries ?? [entry("e1", "apron", { partOfSpeech: "noun" }), entry("e2", "glitter", { partOfSpeech: "verb" })]);
  const learn = new LearnStore({ storage: new MemoryStorage(), clock: () => NOW });
  const ai = new FakeLearnAi(() => result("", { json: { items: [] } }));
  const emojis = new EmojiService({ ai, vocab, learn, aiReady: () => true, ...overrides });
  return { vocab, learn, ai, emojis };
}

describe("EmojiService.emojiOf", () => {
  it("falls back to the part-of-speech default until wordMeta has an emoji", () => {
    const { learn, vocab, emojis } = setup();
    expect(emojis.emojiOf(vocab.entries[0])).toBe(defaultEmoji("noun"));
    learn.putWordMeta({ id: "e1", emoji: "👝", emojiSource: "ai" });
    expect(emojis.emojiOf(vocab.entries[0])).toBe("👝");
  });
});

describe("EmojiService.set", () => {
  it("writes a user emoji without touching other wordMeta fields", () => {
    const { learn, emojis } = setup();
    learn.putWordMeta({ id: "e1", emoji: "🔤", emojiSource: "ai", breakdown: { status: "none", parts: [], gloss: "", word: "apron", generatedAt: "", model: "" } });
    emojis.set("e1", "👝");
    expect(learn.wordMeta("e1")).toMatchObject({ emoji: "👝", emojiSource: "user", breakdown: { word: "apron" } });
  });
});

describe("EmojiService.ensure", () => {
  it("does nothing when AI isn't configured", async () => {
    const { ai, emojis } = setup({ aiReady: () => false });
    emojis.ensure(["e1", "e2"]);
    await flush();
    expect(ai.requests).toHaveLength(0);
  });

  it("skips entries that already have an emoji, and ids that aren't tracked", async () => {
    const { learn, ai, emojis } = setup();
    learn.putWordMeta({ id: "e1", emoji: "👝", emojiSource: "user" });
    emojis.ensure(["e1", "e2", "no-such-id"]);
    await flush();
    expect(ai.requests).toHaveLength(1);
    expect(ai.requests[0].system.some((b) => b.text.includes("glitter"))).toBe(true);
    expect(ai.requests[0].system.some((b) => b.text.includes("apron"))).toBe(false);
  });

  it("writes the AI's emoji into wordMeta (ai), matching items back to entries by word", async () => {
    const { learn, ai, emojis } = setup();
    ai.script = () => result("", { json: { items: [{ word: "apron", emoji: "👝" }, { word: "Glitter", emoji: "✨" }] } });
    emojis.ensure(["e1", "e2"]);
    await flush();
    expect(learn.wordMeta("e1")).toMatchObject({ emoji: "👝", emojiSource: "ai" });
    expect(learn.wordMeta("e2")).toMatchObject({ emoji: "✨", emojiSource: "ai" });
  });

  it("never overwrites a user's own emoji set while that id's batch is still in flight", async () => {
    let resolveBatch!: (v: ReturnType<typeof result>) => void;
    const pending = new Promise<ReturnType<typeof result>>((res) => (resolveBatch = res));
    const vocab = new FakeVocab([entry("e1", "apron", { partOfSpeech: "noun" })]);
    const learn = new LearnStore({ storage: new MemoryStorage(), clock: () => NOW });
    const ai = new FakeLearnAi(() => pending);
    const emojis = new EmojiService({ ai, vocab, learn, aiReady: () => true });

    emojis.ensure(["e1"]); // batch starts, AI hasn't answered yet
    emojis.set("e1", "🧺"); // learner picks one by hand in the meantime
    resolveBatch(result("", { json: { items: [{ word: "apron", emoji: "👝" }] } }));
    await flush();

    expect(learn.wordMeta("e1")).toMatchObject({ emoji: "🧺", emojiSource: "user" });
  });

  it("runs one batch at a time; the same id isn't queued twice while in flight", async () => {
    let resolveFirst!: (v: ReturnType<typeof result>) => void;
    const first = new Promise<ReturnType<typeof result>>((res) => (resolveFirst = res));
    let calls = 0;
    const vocab = new FakeVocab([entry("e1", "apron", { partOfSpeech: "noun" }), entry("e2", "glitter", { partOfSpeech: "verb" }), entry("e3", "toil")]);
    const learn = new LearnStore({ storage: new MemoryStorage(), clock: () => NOW });
    const ai = new FakeLearnAi((): ReturnType<typeof result> | Promise<ReturnType<typeof result>> => {
      calls++;
      if (calls === 1) return first;
      return result("", { json: { items: [{ word: "toil", emoji: "😩" }] } });
    });
    const emojis = new EmojiService({ ai, vocab, learn, aiReady: () => true, batchSize: 2 });

    emojis.ensure(["e1", "e2"]); // batch 1 starts, pending on `first`
    emojis.ensure(["e1", "e3"]); // e1 already queued → ignored; e3 queued for batch 2
    expect(calls).toBe(1);

    resolveFirst(result("", { json: { items: [{ word: "apron", emoji: "👝" }, { word: "glitter", emoji: "✨" }] } }));
    await flush();

    expect(calls).toBe(2); // batch 2 (just e3) ran once batch 1 finished
    expect(learn.wordMeta("e1")).toMatchObject({ emoji: "👝", emojiSource: "ai" });
    expect(learn.wordMeta("e2")).toMatchObject({ emoji: "✨", emojiSource: "ai" });
    expect(learn.wordMeta("e3")).toMatchObject({ emoji: "😩", emojiSource: "ai" });
  });

  it("logs a failed batch once and never retries that id on a later ensure() call", async () => {
    const { learn, ai, emojis } = setup();
    ai.script = () => {
      throw new Error("boom");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    emojis.ensure(["e1"]);
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(learn.wordMeta("e1")).toBeUndefined();

    emojis.ensure(["e1"]);
    await flush();
    expect(ai.requests).toHaveLength(1); // no second attempt
    spy.mockRestore();
  });

  it(`defaults to batches of ${EMOJI_BATCH_SIZE}`, async () => {
    const entries = Array.from({ length: EMOJI_BATCH_SIZE + 2 }, (_, i) => entry(`e${i}`, `word${i}`));
    const { ai, emojis } = setup({ vocabEntries: entries });
    emojis.ensure(entries.map((e) => e.id));
    await flush();
    expect(ai.requests).toHaveLength(2);
    expect(ai.requests[0].system.some((b) => b.text.includes(`共 ${EMOJI_BATCH_SIZE} 個`))).toBe(true);
    expect(ai.requests[1].system.some((b) => b.text.includes("共 2 個"))).toBe(true);
  });
});
