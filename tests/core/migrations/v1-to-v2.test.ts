import { describe, expect, it } from "vitest";
import { migrateV1ToV2 } from "../../../src/core/migrations/v1-to-v2";
import type { VocabDataV1, VocabEntryV1 } from "../../../src/core/model/schemaV1";

function entryV1(overrides: Partial<VocabEntryV1> = {}): VocabEntryV1 {
  return {
    id: "1",
    word: "ephemeral",
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
    added: "2026-01-02 03:04:05",
    lastReviewed: "2026-01-02 03:04:05",
    reviews: 0,
    ...overrides,
  };
}

describe("migrateV1ToV2", () => {
  it("stamps schemaVersion and per-entry createdAt/updatedAt/rev/lang", () => {
    const raw: VocabDataV1 = { entries: [entryV1()] };
    const result = migrateV1ToV2(raw);

    expect(result.schemaVersion).toBe(2);
    expect(result.settings).toEqual({ schemaVersion: 2 });
    expect(result.entries).toHaveLength(1);

    const [entry] = result.entries;
    expect(entry.lang).toBe("en");
    expect(entry.rev).toBe(0);
    expect(entry.createdAt).toBe(entry.updatedAt);
    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Original fields carried over untouched.
    expect(entry.word).toBe("ephemeral");
  });

  it("derives createdAt from the legacy added timestamp (local time)", () => {
    const raw: VocabDataV1 = { entries: [entryV1({ added: "2026-03-05 09:00:00" })] };
    const [entry] = migrateV1ToV2(raw).entries;

    const expected = new Date("2026-03-05T09:00:00").toISOString();
    expect(entry.createdAt).toBe(expected);
  });

  it("falls back to now when added is missing or unparseable", () => {
    const raw: VocabDataV1 = { entries: [entryV1({ added: "" })] };
    const before = Date.now();
    const [entry] = migrateV1ToV2(raw).entries;
    const after = Date.now();

    const createdAtMs = new Date(entry.createdAt as string).getTime();
    expect(createdAtMs).toBeGreaterThanOrEqual(before);
    expect(createdAtMs).toBeLessThanOrEqual(after);
  });

  it("handles an empty entries array", () => {
    const result = migrateV1ToV2({ entries: [] });
    expect(result).toEqual({ schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] });
  });
});
