import { describe, expect, it } from "vitest";
import {
  fullBackupFile,
  fullBackupName,
  isBackupName,
  parseBackup,
  stampFromName,
  summarize,
} from "../../../src/services/backup/format";

const V1 = {
  entries: [
    { id: "a", word: "apple", level: "", synonyms: "", antonyms: "", example: "", definition: "", definitionZh: "", phonetic: "", partOfSpeech: "", grammar: "", source: null, added: "2026-08-01 10:00:00", lastReviewed: "", reviews: 0 },
  ],
  someOldSetting: true,
};

describe("backup file names", () => {
  it("round-trips the time through a colon-free name", () => {
    const name = fullBackupName("2026-10-05T12:34:56.789Z", "manual");
    expect(name).toBe("full-2026-10-05T12-34-56.789Z-manual.json");
    expect(stampFromName(name)).toBe("2026-10-05T12:34:56.789Z");
    // The migration backup's own name (ObsidianStorage.backup).
    expect(stampFromName("data-v1-2026-10-04T08-00-00.000Z.json")).toBe("2026-10-04T08:00:00.000Z");
    expect(stampFromName("notes.json")).toBeNull();
  });

  it("accepts plain file names only", () => {
    expect(isBackupName("full-2026-10-05T12-34-56.789Z-manual.json")).toBe(true);
    expect(isBackupName("../data.json")).toBe(false);
    expect(isBackupName("sub/x.json")).toBe(false);
    expect(isBackupName("x.txt")).toBe(false);
  });
});

describe("parseBackup", () => {
  it("reads the v1 → v2 migration backup as a words-only backup (migrated, ids kept)", () => {
    const parsed = parseBackup("data-v1-2026-10-04T08-00-00.000Z.json", V1)!;
    expect(parsed).toMatchObject({ kind: "data", reason: "migration", createdAt: "2026-10-04T08:00:00.000Z" });
    expect(parsed.snapshot.data!.entries[0]).toMatchObject({ id: "a", word: "apple", lang: "en", rev: 0 });
    expect(Object.keys(parsed.snapshot)).toEqual(["data"]);
  });

  it("reads a hand-copied v2 data.json too", () => {
    const parsed = parseBackup("my-copy.json", { schemaVersion: 2, entries: [] })!;
    expect(parsed).toMatchObject({ kind: "data", reason: "unknown", createdAt: null });
  });

  it("reads a full backup; shards recorded as null count as present but empty", () => {
    const file = fullBackupFile({ data: { schemaVersion: 2, entries: [] }, threads: { threads: [] }, usage: { version: 1, devices: {} } }, "2026-10-05T12:00:00.000Z", "manual");
    expect(file.shards).toMatchObject({ learn: null, reviews: null, imports: null, files: null });
    const parsed = parseBackup("full-x.json", JSON.parse(JSON.stringify(file)))!;
    expect(parsed).toMatchObject({ kind: "full", reason: "manual", createdAt: "2026-10-05T12:00:00.000Z" });
    expect(parsed.snapshot.learn).toEqual({ families: [], trivia: [] });
    expect(parsed.snapshot.reviews).toEqual([]);
  });

  it("rejects anything else", () => {
    expect(parseBackup("x.json", { hello: 1 })).toBeNull();
    expect(parseBackup("x.json", [1, 2])).toBeNull();
    expect(parseBackup("x.json", "text")).toBeNull();
  });
});

describe("summarize", () => {
  it("counts live records; parts a backup lacks stay undefined", () => {
    const s = summarize({
      data: { entries: [{ id: "a" }, { id: "b", deletedAt: "x" }] as never },
      threads: [
        { id: "1", turns: [{ id: "q", role: "user" }, { id: "a", role: "assistant" }, { id: "q2", role: "user", deletedAt: "x" }] },
        { id: "2", turns: [] },
      ] as never,
      learn: { families: [{ id: "f" }], trivia: [] } as never,
    });
    expect(s).toEqual({ words: 1, threads: 1, questions: 1, families: 1, trivia: 0 });
    expect(summarize({ data: { entries: [] } })).toEqual({ words: 0 });
  });
});
