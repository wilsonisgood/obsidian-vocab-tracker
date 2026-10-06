import { describe, expect, it } from "vitest";
import { verbFavoriteId, type VerbFavorite } from "../../../src/core/model/usage";
import { LEARN_SHARD, LearnStore } from "../../../src/services/learn/LearnStore";
import { learnFingerprint, mergeLearn, normalizeLearnShard, type LearnShard } from "../../../src/services/learn/learnMerge";
import { MemoryStorage } from "../ai/fakes";

// 動詞用法收藏 (1005 回饋 #4): one record per verb in learn.json, merged
// across devices like saved trivia.

function setup() {
  const storage = new MemoryStorage();
  let clock = Date.parse("2026-10-05T08:00:00Z");
  const learn = new LearnStore({ storage, clock: () => new Date((clock += 1000)) });
  return { storage, learn };
}

const VERB = { id: "v1", word: "sugarcoat" };

function fav(extra: Partial<VerbFavorite> = {}): VerbFavorite {
  return { id: verbFavoriteId("v1"), entryId: "v1", word: "sugarcoat", ...extra };
}

describe("LearnStore verb favorites", () => {
  it("saves once per verb, stamped, and announces it", async () => {
    const { learn, storage } = setup();
    await learn.ensureLoaded();
    const events: VerbFavorite[] = [];
    learn.events.on("verbFavorite:upsert", (v) => events.push({ ...v }));

    const a = learn.favoriteVerb(VERB);
    const b = learn.favoriteVerb(VERB);
    expect(b).toBe(a);
    expect(a).toMatchObject({ id: "verb:v1", entryId: "v1", word: "sugarcoat", rev: 1 });
    expect(a.createdAt).toBe(a.updatedAt);
    expect(learn.verbFavorite("v1")).toBe(a);
    expect(learn.verbFavorites()).toEqual([a]);
    expect(events).toHaveLength(1);

    await learn.flush();
    expect((storage.shards.get(LEARN_SHARD) as LearnShard).verbs).toEqual([a]);
  });

  it("unsaves as a tombstone, and saving again revives the same id as the newer record", async () => {
    const { learn } = setup();
    await learn.ensureLoaded();
    const first = learn.favoriteVerb(VERB);
    const created = first.createdAt;
    learn.unfavoriteVerb("v1");
    expect(learn.verbFavorite("v1")).toBeUndefined();
    expect(learn.verbFavorites()).toEqual([]);
    const tomb = { ...first };
    expect(tomb.deletedAt).toBeTruthy();

    const again = learn.favoriteVerb(VERB);
    expect(again.id).toBe("verb:v1");
    expect(again.deletedAt).toBeUndefined();
    expect(again.rev).toBeGreaterThan(tomb.rev ?? 0);
    expect(again.updatedAt! > tomb.updatedAt!).toBe(true);
    // A new save is a new 收藏日期.
    expect(again.createdAt! > created!).toBe(true);
    // The revived save beats the tombstone in a merge, either way round.
    const a: LearnShard = { families: [], trivia: [], verbs: [tomb] };
    const b: LearnShard = { families: [], trivia: [], verbs: [again] };
    expect(mergeLearn(a, b).verbs).toEqual([again]);
    expect(mergeLearn(b, a).verbs).toEqual([again]);
  });

  it("merges two devices' saves by id: union, newer wins, tombstones included", () => {
    const local: LearnShard = {
      families: [],
      trivia: [],
      verbs: [fav({ updatedAt: "2026-10-05T08:00:00Z", rev: 1 }), { id: "verb:v2", entryId: "v2", word: "toil", updatedAt: "2026-10-05T08:00:00Z" }],
    };
    const remote: LearnShard = {
      families: [],
      trivia: [],
      verbs: [
        fav({ updatedAt: "2026-10-05T09:00:00Z", deletedAt: "2026-10-05T09:00:00Z", rev: 2 }),
        { id: "verb:v3", entryId: "v3", word: "expel", updatedAt: "2026-10-05T07:00:00Z" },
      ],
    };
    const merged = mergeLearn(local, remote).verbs ?? [];
    expect(merged.map((v) => [v.id, !!v.deletedAt])).toEqual([
      ["verb:v1", true],
      ["verb:v2", false],
      ["verb:v3", false],
    ]);
  });

  it("reads files written before verb favorites existed", async () => {
    const { learn, storage } = setup();
    storage.shards.set(LEARN_SHARD, { families: [], trivia: [] });
    await learn.ensureLoaded();
    expect(learn.verbFavorites()).toEqual([]);
    expect(normalizeLearnShard({ families: [], trivia: [] }).verbs).toEqual([]);
    // A missing array and an empty one are the same to the sync check.
    expect(learnFingerprint({ families: [], trivia: [] })).toBe(learnFingerprint({ families: [], trivia: [], verbs: [] }));
  });

  it("a synced save shows up on reload, and the union goes back when this device has more", async () => {
    const { learn, storage } = setup();
    await learn.ensureLoaded();
    learn.favoriteVerb(VERB);
    await learn.flush();
    storage.shards.set(LEARN_SHARD, {
      families: [],
      trivia: [],
      verbs: [{ id: "verb:v9", entryId: "v9", word: "labor", updatedAt: "2026-10-05T10:00:00Z", rev: 1 }],
    });
    await learn.reload();
    expect(learn.verbFavorites().map((v) => v.id).sort()).toEqual(["verb:v1", "verb:v9"]);
    await learn.flush();
    expect((storage.shards.get(LEARN_SHARD) as LearnShard).verbs?.map((v) => v.id).sort()).toEqual(["verb:v1", "verb:v9"]);
  });
});

// Wave 8 U1 (1006-2 #21): favorites are per pos now. pos "v" keeps going
// through the legacy "verb:${id}" id/methods (above); every other pos
// gets a new "usage:${id}:${pos}" record, and both kinds coexist fine in
// learn.json / learnMerge.
describe("LearnStore usage favorites (any pos)", () => {
  it("favorites pos v through the legacy id/path — old and new API are the same record", async () => {
    const { learn } = setup();
    await learn.ensureLoaded();
    const viaOld = learn.favoriteVerb(VERB);
    expect(learn.usageFavorite("v1", "v")).toBe(viaOld);
    expect(learn.favoriteUsage(VERB, "v")).toBe(viaOld);
  });

  it("favorites a non-verb pos under its own id, independent of pos v", async () => {
    const { learn } = setup();
    await learn.ensureLoaded();
    const noun = learn.favoriteUsage(VERB, "n");
    expect(noun.id).toBe("usage:v1:n");
    expect(learn.usageFavorite("v1", "n")).toBe(noun);
    expect(learn.usageFavorite("v1", "v")).toBeUndefined();
    expect(learn.verbFavorites().map((v) => v.id)).toEqual(["usage:v1:n"]);

    learn.favoriteVerb(VERB);
    expect(learn.usageFavoritesFor("v1").map((v) => v.id).sort()).toEqual(["usage:v1:n", "verb:v1"]);

    learn.unfavoriteUsage("v1", "n");
    expect(learn.usageFavorite("v1", "n")).toBeUndefined();
    expect(learn.usageFavorite("v1", "v")).toBeTruthy(); // unaffected

    learn.unfavoriteAllUsages("v1");
    expect(learn.usageFavoritesFor("v1")).toEqual([]);
  });

  it("merges two devices' pos favorites independently (different ids, no collision)", () => {
    const local: LearnShard = { families: [], trivia: [], verbs: [{ id: "usage:v1:n", entryId: "v1", word: "sugarcoat", pos: "n", updatedAt: "2026-10-05T08:00:00Z" }] };
    const remote: LearnShard = { families: [], trivia: [], verbs: [{ id: "verb:v1", entryId: "v1", word: "sugarcoat", updatedAt: "2026-10-05T08:00:00Z" }] };
    const merged = mergeLearn(local, remote).verbs ?? [];
    expect(merged.map((v) => v.id).sort()).toEqual(["usage:v1:n", "verb:v1"]);
  });
});
