import type { StoragePort } from "../ports";
import type { VocabData } from "../model/entry";
import { migrate } from "./index";

// The safety invariant this PR exists for: a migrated shape is only ever
// written back over the original file *after* its backup has landed. If
// backup() throws, writeShard() never runs — the original v1 file on disk
// is untouched and onload simply fails loudly instead of risking data loss.
export async function loadMigrated(storage: StoragePort, shard = "data"): Promise<VocabData> {
  const raw = await storage.readShard<unknown>(shard);
  const { data, migrated } = migrate(raw);
  if (migrated) {
    await storage.backup(shard, raw);
    await storage.writeShard(shard, data);
  }
  return data;
}
