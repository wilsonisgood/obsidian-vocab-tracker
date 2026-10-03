import { describe, expect, it } from "vitest";
import { migrate } from "../../../src/core/migrations";
import type { VocabDataV1 } from "../../../src/core/model/schemaV1";

describe("migrate", () => {
  it("returns an empty v2 shape for null/undefined (first run, no data.json yet)", () => {
    expect(migrate(null)).toEqual({
      data: { schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] },
      migrated: false,
    });
  });

  it("migrates v1 data (no schemaVersion) and reports migrated: true", () => {
    const raw: VocabDataV1 = {
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

    const result = migrate(raw);
    expect(result.migrated).toBe(true);
    expect(result.data.schemaVersion).toBe(2);
    expect(result.data.entries[0].rev).toBe(0);
  });

  it("is idempotent: migrating already-v2 data passes it through untouched", () => {
    const v1: VocabDataV1 = { entries: [] };
    const first = migrate(v1);
    expect(first.migrated).toBe(true);

    const second = migrate(first.data);
    expect(second.migrated).toBe(false);
    expect(second.data).toBe(first.data);
  });
});
