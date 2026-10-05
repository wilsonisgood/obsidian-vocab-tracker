import type { StoragePort } from "../../core/ports";
import type { SeedRecordPort } from "../../core/ports";

// SeedRecordPort on a storage shard (store/files.json). Like NoteImports,
// the record only grows: what's on disk (another device's sync) is unioned
// with what this session marked, so an entry file seeded anywhere counts
// as seeded everywhere.

export const FILES_SHARD = "files";

interface FilesShard {
  // Entry file id → when it was first created (or found already there).
  seeded: Record<string, string>;
}

export class SeedRecord implements SeedRecordPort {
  private record: Record<string, string> = {};

  constructor(
    private storage: StoragePort,
    private now: () => string = () => new Date().toISOString()
  ) {}

  private async load(): Promise<void> {
    let disk: FilesShard | null = null;
    try {
      disk = await this.storage.readShard<FilesShard>(FILES_SHARD);
    } catch (e) {
      console.error("Vocab Tracker: couldn't read the files record", e);
    }
    const seeded = disk && typeof disk.seeded === "object" && disk.seeded ? disk.seeded : {};
    this.record = { ...seeded, ...this.record };
  }

  async seeded(): Promise<ReadonlySet<string>> {
    await this.load();
    return new Set(Object.keys(this.record));
  }

  async markSeeded(ids: readonly string[]): Promise<void> {
    const fresh = ids.filter((id) => !(id in this.record));
    if (!fresh.length) return;
    await this.load();
    const at = this.now();
    for (const id of fresh) this.record[id] ??= at;
    await this.storage.writeShard<FilesShard>(FILES_SHARD, { seeded: this.record });
  }
}
