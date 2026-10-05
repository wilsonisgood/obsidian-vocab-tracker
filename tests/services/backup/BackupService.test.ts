import { describe, expect, it, vi } from "vitest";
import type { VocabData } from "../../../src/core/model/entry";
import { BackupError, BackupService } from "../../../src/services/backup/BackupService";
import type { BackupHost, BackupStoragePort, RestoreChanges } from "../../../src/services/backup/ports";

// In-memory plugin folder: shards (data + store/*) and backup/ files, with
// a log of every write in order.
class FakeStorage implements BackupStoragePort {
  readonly backupFolder = ".obsidian/plugins/vocab-tracker/backup";
  shards = new Map<string, unknown>();
  backups = new Map<string, unknown>();
  log: string[] = [];
  failBackupWrite = false;

  async readShard<T>(name: string): Promise<T | null> {
    return (structuredClone(this.shards.get(name)) as T) ?? null;
  }
  async writeShard<T>(name: string, data: T): Promise<void> {
    this.log.push(`shard:${name}`);
    this.shards.set(name, structuredClone(data));
  }
  async backup(): Promise<void> {}
  async listBackups(): Promise<string[]> {
    return [...this.backups.keys()];
  }
  async readBackup(name: string): Promise<unknown | null> {
    return structuredClone(this.backups.get(name)) ?? null;
  }
  async writeBackup(name: string, data: unknown): Promise<string> {
    if (this.failBackupWrite) throw new Error("disk full");
    this.log.push(`backup:${name}`);
    this.backups.set(name, structuredClone(data));
    return `${this.backupFolder}/${name}`;
  }
  async readAllShards(): Promise<Record<string, unknown>> {
    return Object.fromEntries([...this.shards].map(([k, v]) => [k, structuredClone(v)]));
  }
}

const T0 = "2026-09-01T10:00:00.000Z";
const T1 = "2026-09-10T10:00:00.000Z";

function word(id: string, w: string, extra: object = {}) {
  return { id, word: w, definition: w, createdAt: T0, updatedAt: T0, rev: 1, ...extra };
}

function setup(clock = new Date("2026-10-01T10:00:00.000Z")) {
  const storage = new FakeStorage();
  storage.shards.set("data", { schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [word("a", "apple"), word("b", "bread")] });
  storage.shards.set("threads", { threads: [] });
  storage.shards.set("usage", { version: 1, devices: { mac: { "2026-10-01": { input: 5 } } } });
  const calls: string[] = [];
  let applied: VocabData | null = null;
  let changes: RestoreChanges | null = null;
  const host: BackupHost = {
    flush: vi.fn(async () => void calls.push("flush")),
    reload: vi.fn(async () => void calls.push("reload")),
    applyData: (d) => {
      calls.push("applyData");
      applied = d;
    },
    restored: (c) => {
      calls.push("restored");
      changes = c;
    },
  };
  const service = new BackupService({ storage, host, clock: () => clock });
  return { storage, host, service, calls, applied: () => applied, changes: () => changes };
}

describe("BackupService.create", () => {
  it("flushes, then writes every shard (usage included) into one full backup", async () => {
    const { storage, service, calls } = setup();
    const path = await service.create();
    expect(calls).toEqual(["flush"]);
    expect(path).toBe(".obsidian/plugins/vocab-tracker/backup/full-2026-10-01T10-00-00.000Z-manual.json");
    const file = storage.backups.get("full-2026-10-01T10-00-00.000Z-manual.json") as { shards: Record<string, unknown> };
    expect(Object.keys(file.shards).sort()).toEqual(["data", "files", "imports", "learn", "reviews", "threads", "usage"]);
  });
});

describe("BackupService.list", () => {
  it("lists newest first with a summary; unreadable files are listed but marked", async () => {
    const { storage, service } = setup();
    storage.backups.set("data-v1-2026-08-01T00-00-00.000Z.json", { entries: [word("a", "apple")] });
    storage.backups.set("full-2026-09-15T00-00-00.000Z-manual.json", {
      vocabTrackerBackup: 1,
      createdAt: "2026-09-15T00:00:00.000Z",
      reason: "manual",
      shards: { data: { schemaVersion: 2, entries: [word("a", "apple"), word("b", "bread")] }, threads: { threads: [] } },
    });
    storage.backups.set("broken-2026-09-20T00-00-00.000Z.json", { nope: true });
    const items = await service.list();
    expect(items.map((i) => [i.name, i.kind])).toEqual([
      ["broken-2026-09-20T00-00-00.000Z.json", "unreadable"],
      ["full-2026-09-15T00-00-00.000Z-manual.json", "full"],
      ["data-v1-2026-08-01T00-00-00.000Z.json", "data"],
    ]);
    expect(items[1].summary).toEqual({ words: 2, threads: 0, questions: 0 });
    expect(items[2]).toMatchObject({ reason: "migration", summary: { words: 1 } });
    expect(items[1].path).toBe(".obsidian/plugins/vocab-tracker/backup/full-2026-09-15T00-00-00.000Z-manual.json");
  });
});

describe("BackupService.restore", () => {
  async function withBackup() {
    const s = setup();
    // The backup: apple and bread at T0. Since then: apple edited, bread
    // deleted, cider added.
    await s.service.create();
    s.storage.shards.set("data", {
      schemaVersion: 2,
      settings: { schemaVersion: 2, srs: { dailyNew: 9 } },
      entries: [word("a", "apple", { definition: "edited", updatedAt: T1, rev: 2 }), word("b", "bread", { deletedAt: T1, updatedAt: T1, rev: 2 }), word("c", "cider", { updatedAt: T1 })],
    });
    s.calls.length = 0;
    s.storage.log.length = 0;
    return { ...s, name: "full-2026-10-01T10-00-00.000Z-manual.json" };
  }

  it("previews without writing anything", async () => {
    const { storage, service, name } = await withBackup();
    const p = await service.preview(name);
    expect(p.counts.words).toEqual({ changed: 1, revived: 1, extra: 1 });
    expect(p.safetyFolder).toBe(storage.backupFolder);
    expect(storage.log).toEqual([]);
  });

  it("backs up the current state first, then writes the restored shards, then reloads and redraws", async () => {
    const { storage, service, calls, name, applied, changes } = await withBackup();
    const later = new Date("2026-10-02T10:00:00.000Z");
    (service as unknown as { clock: () => Date }).clock = () => later;
    const result = await service.restore(name, { removeExtras: false });

    const safetyName = "full-2026-10-02T10-00-00.000Z-before-restore.json";
    expect(result.safetyPath).toBe(`${storage.backupFolder}/${safetyName}`);
    expect(storage.log[0]).toBe(`backup:${safetyName}`);
    // Unchanged shards (threads, still empty) aren't rewritten; usage never is.
    expect(storage.log.slice(1)).toEqual(["shard:data"]);
    expect(calls).toEqual(["flush", "reload", "applyData", "restored"]);

    // The safety backup holds the pre-restore state, settings and all.
    const safety = storage.backups.get(safetyName) as { reason: string; restoring: string; shards: { data: VocabData } };
    expect(safety).toMatchObject({ reason: "before-restore", restoring: name });
    expect(safety.shards.data.entries.map((e) => e.word)).toEqual(["apple", "bread", "cider"]);

    const data = storage.shards.get("data") as VocabData;
    expect(data.entries.find((e) => e.id === "a")).toMatchObject({ definition: "apple", updatedAt: later.toISOString() });
    expect(data.entries.find((e) => e.id === "b")!.deletedAt).toBeUndefined();
    expect(data.entries.find((e) => e.id === "c")!.deletedAt).toBeUndefined();
    expect(data.settings).toEqual({ schemaVersion: 2, srs: { dailyNew: 9 } });
    expect(applied()).toEqual(data);
    expect(changes()!.entryIds.sort()).toEqual(["a", "b"]);
  });

  it("changes nothing when the safety backup can't be written", async () => {
    const { storage, service, calls, name } = await withBackup();
    storage.failBackupWrite = true;
    const before = structuredClone(storage.shards.get("data"));
    await expect(service.restore(name, { removeExtras: true })).rejects.toMatchObject({ code: "safety-failed" });
    expect(storage.shards.get("data")).toEqual(before);
    expect(calls).toEqual(["flush"]);
  });

  it("refuses an unreadable backup, and a second restore while one runs", async () => {
    const { service, storage, name } = await withBackup();
    await expect(service.restore("missing.json", { removeExtras: false })).rejects.toBeInstanceOf(BackupError);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const write = storage.writeBackup.bind(storage);
    storage.writeBackup = async (n, d) => {
      await gate;
      return write(n, d);
    };
    const first = service.restore(name, { removeExtras: false });
    await expect(service.restore(name, { removeExtras: false })).rejects.toMatchObject({ code: "busy" });
    release();
    await first;
  });
});
