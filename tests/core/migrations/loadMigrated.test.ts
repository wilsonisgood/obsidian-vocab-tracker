import { describe, expect, it, vi } from "vitest";
import { loadMigrated } from "../../../src/core/migrations/loadMigrated";
import type { StoragePort } from "../../../src/core/ports";
import type { VocabDataV1 } from "../../../src/core/model/schemaV1";

function fakeStorage(initial: unknown): StoragePort & { shards: Map<string, unknown>; backups: unknown[] } {
  const shards = new Map<string, unknown>([["data", initial]]);
  const backups: unknown[] = [];
  return {
    shards,
    backups,
    async readShard<T>(name: string) {
      return (shards.get(name) as T) ?? null;
    },
    async writeShard<T>(name: string, data: T) {
      shards.set(name, data);
    },
    async backup(_name: string, data: unknown) {
      backups.push(data);
    },
  };
}

const v1: VocabDataV1 = {
  entries: [
    {
      id: "1",
      word: "word",
      level: "",
      synonyms: "",
      antonyms: "",
      example: "",
      definition: "",
      definitionZh: "",
      phonetic: "",
      partOfSpeech: "",
      grammar: "",
      source: null,
      added: "2026-01-01 00:00:00",
      lastReviewed: "2026-01-01 00:00:00",
      reviews: 0,
    },
  ],
};

describe("loadMigrated", () => {
  it("backs up the raw data and writes the migrated shape back when migrating", async () => {
    const storage = fakeStorage(v1);
    const data = await loadMigrated(storage);

    expect(data.schemaVersion).toBe(2);
    expect(storage.backups).toEqual([v1]);
    expect(storage.shards.get("data")).toBe(data);
  });

  it("never calls backup or re-writes the shard when data is already v2", async () => {
    const alreadyV2 = { schemaVersion: 2 as const, settings: { schemaVersion: 2 as const }, entries: [] };
    const storage = fakeStorage(alreadyV2);
    const writeShard = vi.spyOn(storage, "writeShard");

    const data = await loadMigrated(storage);

    expect(data).toBe(alreadyV2);
    expect(storage.backups).toEqual([]);
    expect(writeShard).not.toHaveBeenCalled();
  });

  it("never writes the migrated shape if backup fails (no data loss on a half-done migration)", async () => {
    const storage = fakeStorage(v1);
    const writeShard = vi.spyOn(storage, "writeShard");
    storage.backup = vi.fn().mockRejectedValue(new Error("disk full"));

    await expect(loadMigrated(storage)).rejects.toThrow("disk full");
    expect(writeShard).not.toHaveBeenCalled();
    expect(storage.shards.get("data")).toBe(v1);
  });

  it("returns an empty v2 shape without touching storage when there is no existing data", async () => {
    const storage = fakeStorage(null);
    const backup = vi.spyOn(storage, "backup");
    const writeShard = vi.spyOn(storage, "writeShard");

    const data = await loadMigrated(storage);

    expect(data.entries).toEqual([]);
    expect(backup).not.toHaveBeenCalled();
    expect(writeShard).not.toHaveBeenCalled();
  });
});
