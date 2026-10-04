import { normalizePath, type Plugin } from "obsidian";
import type { StoragePort } from "../core/ports";

// "data" is loadData/saveData's data.json (same file M0 already used).
// Every other shard is `store/<name>.json` inside the plugin folder
// (規劃書 06 §4.2) and must be listed here by the milestone that starts
// writing it — unknown names still throw instead of silently no-op-ing, so
// a typo'd shard name fails loudly.
const FILE_SHARDS = new Set(["reviews", "usage"]);

const UNSUPPORTED_SHARD = (name: string) =>
  new Error(`ObsidianStorage: shard "${name}" is not implemented yet`);

export class ObsidianStorage implements StoragePort {
  constructor(private plugin: Plugin) {}

  private shardPath(name: string): string {
    const dir = this.plugin.manifest.dir;
    if (!dir) throw new Error("ObsidianStorage: plugin manifest.dir is unavailable");
    return normalizePath(`${dir}/store/${name}.json`);
  }

  async readShard<T>(name: string): Promise<T | null> {
    if (name === "data") return ((await this.plugin.loadData()) as T | undefined) ?? null;
    if (!FILE_SHARDS.has(name)) throw UNSUPPORTED_SHARD(name);

    const adapter = this.plugin.app.vault.adapter;
    const path = this.shardPath(name);
    if (!(await adapter.exists(path))) return null;
    try {
      return JSON.parse(await adapter.read(path)) as T;
    } catch (e) {
      // A half-synced or hand-edited shard shouldn't take the plugin down;
      // callers treat null as "empty" and rebuild it.
      console.error(`Vocab Tracker: couldn't parse ${path}`, e);
      return null;
    }
  }

  async writeShard<T>(name: string, data: T): Promise<void> {
    if (name === "data") return this.plugin.saveData(data);
    if (!FILE_SHARDS.has(name)) throw UNSUPPORTED_SHARD(name);

    const adapter = this.plugin.app.vault.adapter;
    const path = this.shardPath(name);
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
    await adapter.write(path, JSON.stringify(data));
  }

  async backup(name: string, data: unknown): Promise<void> {
    const dir = this.plugin.manifest.dir;
    if (!dir) throw new Error("ObsidianStorage: plugin manifest.dir is unavailable");

    const adapter = this.plugin.app.vault.adapter;
    const backupDir = normalizePath(`${dir}/backup`);
    if (!(await adapter.exists(backupDir))) await adapter.mkdir(backupDir);

    const stamp = new Date().toISOString().replace(/:/g, "-");
    const path = normalizePath(`${backupDir}/${name}-v1-${stamp}.json`);
    await adapter.write(path, JSON.stringify(data, null, 2));
  }
}
