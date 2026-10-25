import { describe, expect, it } from "vitest";
import type { LearnerShard } from "../../../src/core/model/learner";
import { emptyLearnerShard, learnerFingerprint, mergeLearner, normalizeLearnerShard, pruneLearner } from "../../../src/services/learner/learnerMerge";
import { LEARNER_SHARD, LearnerStore } from "../../../src/services/learner/LearnerStore";
import { LearnerModel } from "../../../src/services/learner/LearnerModel";
import { MemoryStorage } from "../ai/fakes";

const shard = (p: Partial<LearnerShard>): LearnerShard => ({ ...emptyLearnerShard(), ...p });
const w = (id: string, level: string, at: string) => ({ id, level, at }) as never;

describe("wordCefr in learner.json", () => {
  it("normalize: lowercases ids, drops bad levels and dates, tolerates garbage", () => {
    const n = normalizeLearnerShard({ wordCefr: [w("Pug", "B2", "2026-10-01T00:00:00Z"), w("x", "Z9", "2026-10-01T00:00:00Z"), w("y", "C1", "nope"), 3, w("", "A1", "2026-10-01T00:00:00Z")] });
    expect(n.wordCefr).toEqual([{ id: "pug", level: "B2", at: "2026-10-01T00:00:00Z" }]);
    expect(normalizeLearnerShard({}).wordCefr).toEqual([]);
    expect(normalizeLearnerShard({ wordCefr: "x" }).wordCefr).toEqual([]);
  });

  it("merge: by id, the newer `at` wins; the union is kept", () => {
    const a = shard({ wordCefr: [w("pug", "B2", "2026-10-01T00:00:00Z"), w("only-a", "C1", "2026-10-01T00:00:00Z")] });
    const b = shard({ wordCefr: [w("pug", "C1", "2026-10-05T00:00:00Z"), w("only-b", "A2", "2026-10-02T00:00:00Z")] });
    const m = mergeLearner(a, b).wordCefr;
    expect(m?.map((x) => [x.id, x.level])).toEqual([["only-a", "C1"], ["only-b", "A2"], ["pug", "C1"]]);
    expect(mergeLearner(b, a).wordCefr?.find((x) => x.id === "pug")?.level).toBe("C1");
  });

  it("fingerprint changes when a level changes; prune keeps everything", () => {
    const a = shard({ wordCefr: [w("pug", "B2", "2026-10-01T00:00:00Z")] });
    const b = shard({ wordCefr: [w("pug", "C1", "2026-10-05T00:00:00Z")] });
    expect(learnerFingerprint(a)).not.toBe(learnerFingerprint(b));
    expect(learnerFingerprint(a)).toBe(learnerFingerprint(shard({ wordCefr: [w("pug", "B2", "2026-10-01T00:00:00Z")] })));
    expect(pruneLearner(a, Date.parse("2030-01-01T00:00:00Z")).wordCefr).toHaveLength(1);
  });
});

describe("LearnerStore.setWordCefr / wordCefr", () => {
  function setup() {
    const storage = new MemoryStorage();
    let t = Date.parse("2026-10-13T08:00:00Z");
    const store = new LearnerStore({ storage, clock: () => new Date((t += 1000)) });
    return { storage, store };
  }

  it("stores levels by lowercased word, persists them, and reloads them", async () => {
    const { storage, store } = setup();
    await store.ensureLoaded();
    store.setWordCefr([{ word: " Ubiquitous ", level: "C1" }, { word: "pug", level: "B2" }, { word: "", level: "A1" }]);
    expect([...store.wordCefr()]).toEqual([["ubiquitous", "C1"], ["pug", "B2"]]);
    await store.flush();
    expect((storage.shards.get(LEARNER_SHARD) as LearnerShard).wordCefr).toHaveLength(2);
    const again = new LearnerStore({ storage });
    await again.ensureLoaded();
    expect(again.wordCefr().get("pug")).toBe("B2");
  });

  it("the same level again changes nothing; a different one replaces it", async () => {
    const { store } = setup();
    await store.ensureLoaded();
    store.setWordCefr([{ word: "pug", level: "B2" }]);
    const first = (store as unknown as { data: LearnerShard }).data.wordCefr?.[0].at;
    store.setWordCefr([{ word: "pug", level: "B2" }]);
    expect((store as unknown as { data: LearnerShard }).data.wordCefr?.[0].at).toBe(first);
    store.setWordCefr([{ word: "pug", level: "C2" }]);
    expect(store.wordCefr().get("pug")).toBe("C2");
  });

  it("LearnerModel.wordCefr hands the map to the report", async () => {
    const { store } = setup();
    await store.ensureLoaded();
    store.setWordCefr([{ word: "pug", level: "B2" }]);
    const model = new LearnerModel({ vocab: () => [], grammar: { questions: () => [], attempts: () => [], progress: () => undefined } as never, learner: store, level: () => "" });
    expect(model.wordCefr().get("pug")).toBe("B2");
  });
});
