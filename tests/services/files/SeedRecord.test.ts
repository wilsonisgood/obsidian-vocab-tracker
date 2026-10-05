import { describe, expect, it, vi } from "vitest";
import type { StoragePort } from "../../../src/core/ports";
import { FILES_SHARD, SeedRecord } from "../../../src/services/files/SeedRecord";
import { paragraphNumber } from "../../../src/services/files/paragraphNumber";

class MemoryStorage implements StoragePort {
  shards = new Map<string, unknown>();
  writes = 0;
  async readShard<T>(name: string): Promise<T | null> {
    return (this.shards.get(name) as T | undefined) ?? null;
  }
  async writeShard<T>(name: string, data: T): Promise<void> {
    this.writes++;
    this.shards.set(name, JSON.parse(JSON.stringify(data)));
  }
  async backup(): Promise<void> {}
}

describe("SeedRecord", () => {
  it("starts empty and remembers what was marked", async () => {
    const storage = new MemoryStorage();
    const seeds = new SeedRecord(storage, () => "2026-10-05T00:00:00.000Z");
    expect([...(await seeds.seeded())]).toEqual([]);
    await seeds.markSeeded(["flashcards", "trivia"]);
    expect(storage.shards.get(FILES_SHARD)).toEqual({
      seeded: { flashcards: "2026-10-05T00:00:00.000Z", trivia: "2026-10-05T00:00:00.000Z" },
    });
    expect([...(await new SeedRecord(storage).seeded())].sort()).toEqual(["flashcards", "trivia"]);
  });

  it("unions with another device's record instead of overwriting it", async () => {
    const storage = new MemoryStorage();
    const seeds = new SeedRecord(storage, () => "B");
    await seeds.markSeeded(["verbs"]);
    // Sync brings in the other device's record.
    storage.shards.set(FILES_SHARD, { seeded: { families: "A" } });
    await seeds.markSeeded(["trivia"]);
    expect(storage.shards.get(FILES_SHARD)).toEqual({ seeded: { families: "A", verbs: "B", trivia: "B" } });
  });

  it("doesn't write when nothing is new", async () => {
    const storage = new MemoryStorage();
    const seeds = new SeedRecord(storage);
    await seeds.markSeeded(["verbs"]);
    await seeds.markSeeded(["verbs"]);
    expect(storage.writes).toBe(1);
  });

  it("treats an unreadable or malformed record as empty", async () => {
    const storage = new MemoryStorage();
    storage.shards.set(FILES_SHARD, { seeded: null });
    expect([...(await new SeedRecord(storage).seeded())]).toEqual([]);
    storage.readShard = async () => {
      throw new Error("not implemented");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect([...(await new SeedRecord(storage).seeded())]).toEqual([]);
    err.mockRestore();
  });
});

describe("paragraphNumber", () => {
  const NOTE = [
    "---",
    "title: x",
    "---",
    "# Speech", // 3
    "",
    "First paragraph.", // 5 → ¶1
    "",
    "```js",
    "code();",
    "```",
    "",
    "- a list", // 11 → ¶2
    "- second item",
    "",
    "> a quote", // 14 → ¶3
    "",
    "Last one,", // 16 → ¶4
    "two lines.",
  ].join("\n");

  it("counts paragraphs, lists and quotes, 1-based", () => {
    expect(paragraphNumber(NOTE, 5)).toBe(1);
    expect(paragraphNumber(NOTE, 12)).toBe(2);
    expect(paragraphNumber(NOTE, 14)).toBe(3);
    expect(paragraphNumber(NOTE, 17)).toBe(4);
  });

  it("is null outside a paragraph", () => {
    expect(paragraphNumber(NOTE, 3)).toBeNull();
    expect(paragraphNumber(NOTE, 8)).toBeNull();
    expect(paragraphNumber(NOTE, 99)).toBeNull();
  });
});
