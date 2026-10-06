import { describe, expect, it } from "vitest";
import type { Family } from "../../../src/core/model/family";
import { EntryLinkageService } from "../../../src/services/learn/EntryLinkageService";
import { LEARN_SHARD, LearnStore } from "../../../src/services/learn/LearnStore";
import type { LearnShard } from "../../../src/services/learn/learnMerge";
import { entry, FakeVocab } from "./fakes";
import { MemoryStorage } from "../ai/fakes";

function fam(id: string, members: { entryId?: string; word: string; zh: string }[], extra: Partial<Family> = {}): Family {
  return { id, topic: id, label: id, source: "ai", groups: [{ label: "g", members }], ...extra };
}

function setup() {
  const storage = new MemoryStorage();
  let clock = Date.parse("2026-10-04T08:00:00Z");
  const learn = new LearnStore({ storage, clock: () => new Date((clock += 1000)) });
  const vocab = new FakeVocab();
  const linkage = new EntryLinkageService({ learn, vocab });
  return { storage, learn, vocab, linkage };
}

const saved = (storage: MemoryStorage) => storage.shards.get(LEARN_SHARD) as LearnShard;

describe("EntryLinkageService.sync", () => {
  it("backfills a saved trivia item's mentions when its subject's word is freshly learned", async () => {
    const { learn, vocab, linkage } = setup();
    await learn.ensureLoaded();
    learn.putTrivia({ id: "t1", entryId: "subj", mentions: [], title: "Glitter and gleam", body: "both shine" });
    vocab.all.push(entry("subj", "glitter"));
    linkage.init(); // "glitter" is already in the list — not a new word.

    vocab.all.push(entry("new1", "gleam"));
    await linkage.sync();

    expect(learn.triviaItem("t1")?.mentions).toEqual(["new1"]);
  });

  it("doesn't rescan a word already seen at init()", async () => {
    const { learn, vocab, linkage } = setup();
    await learn.ensureLoaded();
    learn.putTrivia({ id: "t1", entryId: "subj", mentions: [], title: "gleam", body: "" });
    vocab.all.push(entry("subj", "glitter"), entry("new1", "gleam"));
    linkage.init(); // both already known at startup

    await linkage.sync();
    expect(learn.triviaItem("t1")?.mentions).toEqual([]);
  });

  it("syncs a family member's word/zh when the entry is renamed", async () => {
    const { learn, vocab, linkage } = setup();
    await learn.ensureLoaded();
    learn.putFamily(fam("f1", [{ entryId: "e1", word: "colour", zh: "顏色" }]));
    vocab.all.push(entry("e1", "colour", { definitionZh: "顏色" }));
    linkage.init();

    vocab.all[0] = { ...vocab.all[0], word: "color", definitionZh: "顏色（美式）" };
    await linkage.sync();

    expect(learn.family("f1")?.groups[0].members[0]).toEqual({ entryId: "e1", word: "color", zh: "顏色（美式）" });
  });
});

describe("EntryLinkageService.impact / unlink", () => {
  it("reports and then clears every link, keeping member text", async () => {
    const { learn, vocab, linkage } = setup();
    await learn.ensureLoaded();
    learn.putFamily(fam("f1", [{ entryId: "e1", word: "pan", zh: "鍋" }]));
    learn.putTrivia({ id: "t1", entryId: "other", mentions: ["e1"], title: "x", body: "y" });
    learn.favoriteVerb({ id: "e1", word: "pan" });
    vocab.all.push(entry("e1", "pan"));
    linkage.init();

    const impact = linkage.impact("e1", "pan");
    expect(impact).toMatchObject({ families: 1, triviaMentions: 1, verbFavorite: true });

    linkage.unlink("e1");

    expect(learn.family("f1")?.groups[0].members[0]).toEqual({ word: "pan", zh: "鍋" });
    expect(learn.triviaItem("t1")?.mentions).toEqual([]);
    expect(learn.verbFavorite("e1")).toBeUndefined();

    const after = linkage.impact("e1", "pan");
    expect(after).toMatchObject({ families: 0, triviaMentions: 0, verbFavorite: false });
  });

  it("clears every favorited part of speech, not just verb (1006-2 #21)", async () => {
    const { learn, vocab, linkage } = setup();
    await learn.ensureLoaded();
    learn.favoriteVerb({ id: "e1", word: "pan" });
    learn.favoriteUsage({ id: "e1", word: "pan" }, "n");
    vocab.all.push(entry("e1", "pan"));
    linkage.init();

    expect(linkage.impact("e1", "pan")).toMatchObject({ verbFavorite: true });
    linkage.unlink("e1");
    expect(learn.verbFavorite("e1")).toBeUndefined();
    expect(learn.usageFavorite("e1", "n")).toBeUndefined();
    expect(linkage.impact("e1", "pan")).toMatchObject({ verbFavorite: false });
  });

  it("deletes wordMeta too (決定 1: it's outside the entry itself)", async () => {
    const { learn, vocab, linkage } = setup();
    await learn.ensureLoaded();
    learn.putWordMeta({ id: "e1", emoji: "📘", breakdown: { status: "ok", parts: [], gloss: "g", word: "pan", generatedAt: "t", model: "m" } });
    vocab.all.push(entry("e1", "pan"));
    linkage.init();

    expect(learn.wordMeta("e1")).toBeDefined();
    linkage.unlink("e1");
    expect(learn.wordMeta("e1")).toBeUndefined();
  });

  it("a delete isn't merged back in by a stale copy from another device", async () => {
    const { storage, learn, vocab, linkage } = setup();
    await learn.ensureLoaded();
    learn.putFamily(fam("f1", [{ entryId: "e1", word: "pan", zh: "鍋" }]));
    learn.favoriteVerb({ id: "e1", word: "pan" });
    vocab.all.push(entry("e1", "pan"));
    linkage.init();
    await learn.flush();

    // Another device synced in before this delete happened: an older copy
    // of the same family (still carrying e1) and the live (un-tombstoned)
    // verb favorite.
    const stale = structuredClone(saved(storage)) as LearnShard;

    linkage.unlink("e1");
    await learn.flush();

    storage.shards.set(LEARN_SHARD, stale);
    await learn.reload();

    // The newer, unlinked copy wins the merge — the stale remote doesn't
    // bring entryId or the live favorite back.
    expect(learn.family("f1")?.groups[0].members[0]).toEqual({ word: "pan", zh: "鍋" });
    expect(learn.verbFavorite("e1")).toBeUndefined();
  });
});

describe("EntryLinkageService.sync — spelling change invalidates DNA (Wave 9 DS, 規劃書 09 §5.3)", () => {
  function setupWithMorphemes() {
    const storage = new MemoryStorage();
    let clock = Date.parse("2026-10-04T08:00:00Z");
    const learn = new LearnStore({ storage, clock: () => new Date((clock += 1000)) });
    const vocab = new FakeVocab();
    const queued: string[][] = [];
    const linkage = new EntryLinkageService({ learn, vocab, morphemes: { queue: (ids) => queued.push(ids) } });
    return { learn, vocab, linkage, queued };
  }

  it("clears the breakdown (keeping the emoji) and queues a re-analysis for a liked word", async () => {
    const { learn, vocab, linkage, queued } = setupWithMorphemes();
    await learn.ensureLoaded();
    learn.putWordMeta({ id: "e1", emoji: "📘", emojiSource: "ai", breakdown: { status: "ok", parts: [], gloss: "g", word: "colour", generatedAt: "t", model: "m" } });
    vocab.all.push(entry("e1", "colour", { liked: true }));
    linkage.init();

    vocab.all[0] = { ...vocab.all[0], word: "color" };
    await linkage.sync();

    const meta = learn.wordMeta("e1");
    expect(meta?.breakdown).toBeUndefined();
    expect(meta).toMatchObject({ emoji: "📘", emojiSource: "ai" });
    expect(queued).toEqual([["e1"]]);
  });

  it("doesn't queue a re-analysis for a word that isn't liked", async () => {
    const { learn, vocab, linkage, queued } = setupWithMorphemes();
    await learn.ensureLoaded();
    learn.putWordMeta({ id: "e1", breakdown: { status: "ok", parts: [], gloss: "g", word: "colour", generatedAt: "t", model: "m" } });
    vocab.all.push(entry("e1", "colour", { liked: false }));
    linkage.init();

    vocab.all[0] = { ...vocab.all[0], word: "color" };
    await linkage.sync();

    expect(learn.wordMeta("e1")?.breakdown).toBeUndefined(); // still cleared regardless of liked
    expect(queued).toEqual([]);
  });

  it("does nothing when only definitionZh changes, not the spelling", async () => {
    const { learn, vocab, linkage, queued } = setupWithMorphemes();
    await learn.ensureLoaded();
    learn.putWordMeta({ id: "e1", breakdown: { status: "ok", parts: [], gloss: "g", word: "pan", generatedAt: "t", model: "m" } });
    vocab.all.push(entry("e1", "pan", { definitionZh: "鍋", liked: true }));
    linkage.init();

    vocab.all[0] = { ...vocab.all[0], definitionZh: "平底鍋" };
    await linkage.sync();

    expect(learn.wordMeta("e1")?.breakdown).toBeDefined(); // untouched
    expect(queued).toEqual([]);
  });

  it("is a no-op when there's no morphemes dep wired up (optional)", async () => {
    const { learn, vocab, linkage } = setup(); // the plain setup(), no `morphemes` dep
    await learn.ensureLoaded();
    vocab.all.push(entry("e1", "colour", { liked: true }));
    linkage.init();
    vocab.all[0] = { ...vocab.all[0], word: "color" };
    await expect(linkage.sync()).resolves.not.toThrow();
  });
});
