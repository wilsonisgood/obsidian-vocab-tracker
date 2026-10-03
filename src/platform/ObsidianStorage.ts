import { normalizePath, type Plugin } from "obsidian";
import type { StoragePort } from "../core/ports";

// Only the "data" shard exists today (loadData/saveData's data.json, same
// file M0 already used). Other shard names will get real implementations
// when the milestone that writes them (threads.json in M4, learn.json in
// M7, …) lands — throwing here instead of silently no-op-ing reflects that
// they're genuinely unsupported, not just untested.
const UNSUPPORTED_SHARD = (name: string) =>
  new Error(`ObsidianStorage: shard "${name}" is not implemented yet`);

export class ObsidianStorage implements StoragePort {
  constructor(private plugin: Plugin) {}

  async readShard<T>(name: string): Promise<T | null> {
    if (name !== "data") throw UNSUPPORTED_SHARD(name);
    return ((await this.plugin.loadData()) as T | undefined) ?? null;
  }

  async writeShard<T>(name: string, data: T): Promise<void> {
    if (name !== "data") throw UNSUPPORTED_SHARD(name);
    await this.plugin.saveData(data);
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
