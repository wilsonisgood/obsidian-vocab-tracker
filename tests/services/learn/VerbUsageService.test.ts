import { describe, expect, it, vi } from "vitest";
import type { VerbFavorite, PosKey } from "../../../src/core/model/usage";
import { AiError } from "../../../src/services/ai/errors";
import { VerbUsageService, verbThreadId, type UsageFavorites } from "../../../src/services/learn/VerbUsageService";
import { entry, FakeLearnAi, FakeVocab, result } from "./fakes";

const NOW = new Date("2026-10-04T12:00:00Z");

// Minimal fake for VerbUsageServiceDeps.learn — just the 3 methods the
// service uses (usageFavorite/favoriteUsage/unfavoriteUsage), backed by a
// map keyed "entryId:pos" so pos "v" and other pos never collide, same as
// the real LearnStore (see src/services/learn/LearnStore.ts and
// tests/services/learn/verbFavorites.test.ts for the real thing's
// id-scheme tests).
class FakeFavorites implements UsageFavorites {
  byKey = new Map<string, VerbFavorite>();
  private key(entryId: string, pos: PosKey) {
    return `${entryId}:${pos}`;
  }
  usageFavorite(entryId: string, pos: PosKey) {
    return this.byKey.get(this.key(entryId, pos));
  }
  favoriteUsage(e: { id: string; word: string }, pos: PosKey): VerbFavorite {
    const rec: VerbFavorite = { id: this.key(e.id, pos), entryId: e.id, word: e.word, pos };
    this.byKey.set(this.key(e.id, pos), rec);
    return rec;
  }
  unfavoriteUsage(entryId: string, pos: PosKey) {
    this.byKey.delete(this.key(entryId, pos));
  }
}

// One AI answer covering several parts of speech — the shape
// verbUsage.parse() (src/services/ai/tasks/verbUsage.ts) hands back.
const MULTI_POS = {
  entries: [
    {
      pos: "v",
      patterns: [
        { pattern: "sugarcoat + 名詞", meaningZh: "把壞消息說得比較好聽", example: "I won't sugarcoat the results." },
        { pattern: "  ", meaningZh: "dropped", example: "" },
      ],
      related: [{ phrase: "gloss over", zh: "輕描淡寫帶過" }],
    },
    { pos: "noun", patterns: [{ pattern: "a sugarcoated version", meaningZh: "包裝過的說法", example: "" }], related: [] },
  ],
};

function setup(script = () => result(JSON.stringify(MULTI_POS), { json: MULTI_POS, model: "claude-sonnet-5-5" })) {
  const vocab = new FakeVocab([
    entry("v1", "sugarcoat", { partOfSpeech: "verb", example: "I'm not going to sugarcoat it." }),
    entry("v2", "Expel", { partOfSpeech: "transitive verb" }),
    entry("n1", "apron", { partOfSpeech: "noun" }),
    entry("a1", "quickly", { partOfSpeech: "adverb" }),
  ]);
  const ai = new FakeLearnAi(script);
  const learn = new FakeFavorites();
  const verbs = new VerbUsageService({ ai, vocab, learn, clock: () => NOW });
  return { vocab, ai, learn, verbs };
}

describe("VerbUsageService", () => {
  it("lists only verbs, alphabetically (ui/blocks/verbs.ts is still verb-only this wave)", () => {
    const { verbs } = setup();
    expect(verbs.verbs().map((e) => e.word)).toEqual(["Expel", "sugarcoat"]);
  });

  it("canGenerate allows any part of speech now (1006-2 #17), only excludes deleted entries", () => {
    const { verbs, vocab } = setup();
    expect(verbs.canGenerate(vocab.entries[2])).toBe(true); // noun
    expect(verbs.canGenerate(vocab.entries[3])).toBe(true); // adverb
    const deleted = { ...vocab.entries[0], deletedAt: "2026-10-01T00:00:00Z" };
    expect(verbs.canGenerate(deleted)).toBe(false);
  });

  it("generateAll makes one AI call, stores a block per pos, and unions partOfSpeech (#20)", async () => {
    const { verbs, vocab, ai } = setup();
    const busy: boolean[] = [];
    verbs.events.on("verb:busy", (e) => busy.push(e.busy));
    const saved: { entryId: string; pos?: string }[] = [];
    verbs.events.on("verb:usage", (e) => saved.push(e));
    const e = vocab.entries[0]; // partOfSpeech: "verb"

    const usages = await verbs.generateAll(e);
    expect(Object.keys(usages).sort()).toEqual(["n", "v"]);
    expect(usages.v).toEqual({
      patterns: [MULTI_POS.entries[0].patterns[0]],
      related: MULTI_POS.entries[0].related,
      createdAt: NOW.toISOString(),
      generatedAt: NOW.toISOString(),
      model: "claude-sonnet-5-5",
    });
    expect(e.usages).toEqual(usages);
    expect(e.usage).toBeUndefined(); // legacy field dropped once the new format is written
    // Dictionary said "verb"; the AI also said "noun" — union, not replace.
    expect(e.partOfSpeech).toBe("noun, verb");
    expect(saved.map((s) => s.entryId)).toEqual([e.id, e.id]);
    expect(saved.map((s) => s.pos).sort()).toEqual(["n", "v"]);
    expect(vocab.touched).toEqual([e]);
    expect(busy).toEqual([true, false]);
    expect(verbs.isBusy(e.id)).toBe(false);
    expect(ai.threadIds).toEqual([verbThreadId("v1")]);
    // The learner's own sentence goes into the prompt, same context builder as before.
    expect(ai.requests[0].system[1].text).toContain("〔出處句子〕\nI'm not going to sugarcoat it.");
  });

  it("keeps the first generation's date as 加入日期 per pos when regenerating (1005 #14)", async () => {
    let now = new Date("2026-10-02T12:00:00Z");
    const vocab = new FakeVocab([entry("v1", "sugarcoat", { partOfSpeech: "verb" })]);
    const ai = new FakeLearnAi(() => result(JSON.stringify(MULTI_POS), { json: MULTI_POS }));
    const verbs = new VerbUsageService({ ai, vocab, learn: new FakeFavorites(), clock: () => now });
    const e = vocab.entries[0];
    await verbs.generateAll(e);
    now = new Date("2026-10-05T12:00:00Z");
    const again = await verbs.generateAll(e);
    expect([again.v?.createdAt, again.v?.generatedAt]).toEqual(["2026-10-02T12:00:00.000Z", "2026-10-05T12:00:00.000Z"]);
  });

  it("regenerate() only replaces the one pos, leaving the others on the entry untouched", async () => {
    const vocab = new FakeVocab([entry("v1", "sugarcoat", { partOfSpeech: "verb" })]);
    const ai = new FakeLearnAi(() => result(JSON.stringify(MULTI_POS), { json: MULTI_POS }));
    const verbs = new VerbUsageService({ ai, vocab, learn: new FakeFavorites(), clock: () => NOW });
    const e = vocab.entries[0];
    await verbs.generateAll(e);
    const nBefore = e.usages!.n;
    const posBefore = e.partOfSpeech;

    const vOnly = { entries: [MULTI_POS.entries[0]] };
    ai.script = () => result(JSON.stringify(vOnly), { json: vOnly });
    const block = await verbs.regenerate(e, "v");
    expect(block).toEqual(e.usages!.v);
    expect(e.usages!.n).toBe(nBefore); // untouched
    expect(e.partOfSpeech).toBe(posBefore); // regenerate doesn't re-derive the pos union
  });

  it("generate()/usage() are verb-only back-compat wrappers over generateAll()/usages().v", async () => {
    const { verbs, vocab } = setup();
    const e = vocab.entries[0];
    const block = await verbs.generate(e);
    expect(block).toEqual(verbs.usage(e));
    expect(block).toEqual(verbs.usages(e).v);
    await expect(verbs.generate(vocab.entries[2])).rejects.toThrow(/not a verb/); // noun
  });

  it("keeps the old data when the answer is malformed", async () => {
    const { verbs, vocab } = setup(() => result("sorry", { json: { entries: [] } }));
    const e = vocab.entries[0];
    e.usage = { patterns: [], related: [], generatedAt: "x", model: "m" };
    const saved = vi.fn();
    verbs.events.on("verb:usage", saved);
    await expect(verbs.generateAll(e)).rejects.toMatchObject({ code: "bad_output" });
    expect(saved).not.toHaveBeenCalled();
    expect(e.usage).toEqual({ patterns: [], related: [], generatedAt: "x", model: "m" });
    expect(e.usages).toBeUndefined();
    expect(verbs.isBusy(e.id)).toBe(false);
  });

  it("passes AI errors through and can be stopped", async () => {
    const { verbs, vocab, ai } = setup(() => {
      throw new AiError("rate_limit");
    });
    await expect(verbs.generateAll(vocab.entries[0])).rejects.toMatchObject({ code: "rate_limit" });
    verbs.stop("v1");
    expect(ai.cancelled).toEqual(["verb:v1"]);
  });

  it("isFavorite/favorite/unfavorite delegate to the learn store, per pos", () => {
    const { verbs, learn } = setup();
    expect(verbs.isFavorite("v1", "n")).toBe(false);
    verbs.favorite({ id: "v1", word: "sugarcoat" }, "n");
    expect(verbs.isFavorite("v1", "n")).toBe(true);
    expect(verbs.isFavorite("v1", "v")).toBe(false);
    expect(learn.byKey.get("v1:n")).toMatchObject({ entryId: "v1", pos: "n" });
    verbs.unfavorite("v1", "n");
    expect(verbs.isFavorite("v1", "n")).toBe(false);
  });
});
