import { afterAll, describe, expect, it } from "vitest";
import { loadMigrated } from "../../src/core/migrations/loadMigrated";
import type { VocabData, VocabEntry } from "../../src/core/model/entry";
import type { Thread } from "../../src/core/model/thread";
import type { StoragePort } from "../../src/core/ports";
import { cleanupTombstones } from "../../src/core/store/cleanupTombstones";
import { merge } from "../../src/core/store/merge";
import { mergeThreads } from "../../src/core/store/threads";
import { VocabStore } from "../../src/core/store/VocabStore";
import { SrsService } from "../../src/services/srs/SrsService";
import { ThreadService } from "../../src/services/threads/ThreadService";
import { FakeAi, result } from "../services/threads/fakes";
import { buildStressFixture } from "../fixtures/stress";
import { median, ms, PERF_FACTOR, report, type Row } from "./support/report";

// 規劃書 06 M8 (task K) item (c): VocabStore load / merge with 1,000 words,
// plus the other data paths that scale with the stress fixture. §1.3 sets
// no number for these; the budget here (50 ms each) is this task's own:
// they all run on startup or on a sync event, before or alongside the
// 150 ms sidebar open, so each should stay a fraction of it.

const BUDGET_MS = 50;
const RUNS = 9;

// Shards kept as JSON text, so reads pay the same JSON.parse the plugin's
// loadData / adapter.read do.
class JsonStorage implements StoragePort {
  files = new Map<string, string>();
  backups: string[] = [];
  async readShard<T>(name: string): Promise<T | null> {
    const s = this.files.get(name);
    return s === undefined ? null : (JSON.parse(s) as T);
  }
  async writeShard<T>(name: string, data: T): Promise<void> {
    this.files.set(name, JSON.stringify(data));
  }
  async backup(name: string, data: unknown): Promise<void> {
    this.backups.push(`${name}:${JSON.stringify(data)}`);
  }
}

const fx = buildStressFixture();
const DAY = 86_400_000;

async function timeAsync(fn: () => Promise<unknown>): Promise<{ first: number; med: number }> {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  return { first: times[0], med: median(times.slice(1)) };
}

// Two devices' copies of the same library: each edited 50 different words
// since the last sync, the remote one also added 10 and deleted 5.
function devices(): { local: VocabData; remote: VocabData } {
  const local = fx.data();
  const remote = fx.data();
  const later = (n: number) => new Date(fx.now.getTime() + n * 1000).toISOString();
  for (let i = 0; i < 50; i++) {
    const a = local.entries[i * 7];
    a.definitionZh += "（本機）";
    a.updatedAt = later(i);
    a.rev = (a.rev ?? 0) + 1;
    const b = remote.entries[i * 7 + 3];
    b.example += " (remote)";
    b.updatedAt = later(i);
    b.rev = (b.rev ?? 0) + 1;
  }
  for (let i = 0; i < 10; i++) {
    const e: VocabEntry = { ...structuredClone(remote.entries[i]), id: `remote-${i}`, word: `remoteword${i}`, createdAt: later(100 + i), updatedAt: later(100 + i) };
    remote.entries.push(e);
  }
  for (let i = 0; i < 5; i++) {
    const e = remote.entries[500 + i];
    e.deletedAt = later(200 + i);
    e.updatedAt = e.deletedAt;
  }
  return { local, remote };
}

describe("data paths with 1,000 words / 200 threads", () => {
  const rows: Row[] = [];
  afterAll(() => report("VocabStore load / merge and other data paths", rows));
  const push = (metric: string, t: { first: number; med: number }) => {
    rows.push({ metric, budget: `< ${BUDGET_MS} ms`, measured: `first ${ms(t.first)} · median ${ms(t.med)}`, note: `assert ≤ ${BUDGET_MS * PERF_FACTOR} ms` });
    expect(t.first).toBeLessThan(BUDGET_MS * PERF_FACTOR);
    expect(t.med).toBeLessThan(BUDGET_MS * PERF_FACTOR);
  };

  it("loads data.json into VocabStore (parse, migrate check, tombstones, settings)", async () => {
    const storage = new JsonStorage();
    storage.files.set("data", JSON.stringify(fx.data()));
    let store: VocabStore | null = null;
    const t = await timeAsync(async () => {
      const data = cleanupTombstones(await loadMigrated(storage), fx.now.getTime());
      store = new VocabStore(data, async () => {});
      void store.settings;
      return store.entries.length;
    });
    expect(store!.entries).toHaveLength(1000);
    push("load data.json → VocabStore (1,000 + 20 tombstones)", t);
  });

  it("merges two devices' data.json (1,000 words each)", async () => {
    const pairs = Array.from({ length: RUNS }, devices);
    let i = 0;
    let merged: VocabData | null = null;
    const t = await timeAsync(async () => {
      const { local, remote } = pairs[i++];
      merged = merge(local, remote);
    });
    expect(merged!.entries).toHaveLength(1020 + 10);
    push("merge(local, remote)", t);
  });

  it("a sync event's full data round (merge + replace + changed check)", async () => {
    // What main.ts onExternalSettingsChange does with data.json.
    const pairs = Array.from({ length: RUNS }, devices);
    let i = 0;
    const store = new VocabStore(fx.data(), async () => {});
    let rewrote = false;
    const t = await timeAsync(async () => {
      const { local, remote } = pairs[i++];
      const disk = JSON.parse(JSON.stringify(remote)) as VocabData;
      const m = merge(local, disk);
      store.replace(m);
      rewrote = JSON.stringify(m) !== JSON.stringify(disk);
    });
    expect(rewrote).toBe(true);
    push("onExternalSettingsChange data round", t);
  });

  it("migrates a v1 data.json of 1,000 words (once, on upgrade)", async () => {
    const t = await timeAsync(async () => {
      const storage = new JsonStorage();
      storage.files.set("data", JSON.stringify(fx.v1Data()));
      const data = await loadMigrated(storage);
      expect(data.entries).toHaveLength(1000);
    });
    push("v1 → v2 migration + backup", t);
  });

  it("loads and merges threads.json (200 threads)", async () => {
    const storage = new JsonStorage();
    storage.files.set("threads", JSON.stringify(fx.threadsShard()));
    const store = new VocabStore(fx.data(), async () => {});
    const load = await timeAsync(async () => {
      const threads = new ThreadService({ storage, store, ai: new FakeAi(async () => result("")), notes: { read: async () => null } });
      await threads.ensureLoaded();
      expect(threads.paragraphThreads()).toHaveLength(100);
    });
    push("ThreadService.ensureLoaded (threads.json)", load);

    // Each side asked one more question in 20 threads.
    const side = (tag: string): Thread[] =>
      fx.threadsShard().threads.map((th, k) =>
        k % 10 === 0
          ? { ...th, updatedAt: new Date(fx.now.getTime() + DAY).toISOString(), turns: [...th.turns, { id: `${tag}-${k}`, role: "user", content: "?", at: new Date(fx.now.getTime() + k).toISOString(), status: "done" }] }
          : th
      );
    const sides = Array.from({ length: RUNS }, () => [side("mac"), side("iphone")] as const);
    let i = 0;
    const m = await timeAsync(async () => {
      const [a, b] = sides[i++];
      const out = mergeThreads(a, b);
      expect(out).toHaveLength(200);
    });
    push("mergeThreads (200 × 2 devices)", m);
  });

  it("builds the flashcard queue over 1,000 words", async () => {
    const store = new VocabStore(fx.data(), async () => {});
    const storage = new JsonStorage();
    const srs = new SrsService({ store, storage, clock: () => fx.now });
    await srs.ensureLoaded();
    const t = await timeAsync(async () => {
      srs.queue();
      srs.dueTomorrow();
    });
    expect(srs.queue().length).toBeGreaterThan(0);
    push("SrsService.queue + dueTomorrow", t);
  });
});
