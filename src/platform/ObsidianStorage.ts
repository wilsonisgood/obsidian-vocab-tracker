import { normalizePath, type Plugin } from "obsidian";
import type { StoragePort } from "../core/ports";

// "data" is loadData/saveData's data.json (same file M0 already used).
// Every other shard (reviews in M2; threads/learn/usage later) is its own
// JSON file under <plugin dir>/store/ (規劃書 06 §4.2), so a large or
// frequently written shard never forces a rewrite of data.json — and
// onExternalSettingsChange, which only watches data.json, stays scoped to
// settings + entries.
export class ObsidianStorage implements StoragePort {
  constructor(private plugin: Plugin) {}

  async readShard<T>(name: string): Promise<T | null> {
    if (name === "data") return ((await this.plugin.loadData()) as T | undefined) ?? null;

    const adapter = this.plugin.app.vault.adapter;
    const path = this.shardPath(name);
    if (!(await adapter.exists(path))) return null;
    return JSON.parse(await adapter.read(path)) as T;
  }

  async writeShard<T>(name: string, data: T): Promise<void> {
    if (name === "data") {
      await this.plugin.saveData(data);
      return;
    }

    const adapter = this.plugin.app.vault.adapter;
    const dir = normalizePath(`${this.pluginDir()}/store`);
    if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
    await adapter.write(this.shardPath(name), JSON.stringify(data));
  }

  async backup(name: string, data: unknown): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;
    const backupDir = normalizePath(`${this.pluginDir()}/backup`);
    if (!(await adapter.exists(backupDir))) await adapter.mkdir(backupDir);

    const stamp = new Date().toISOString().replace(/:/g, "-");
    const path = normalizePath(`${backupDir}/${name}-v1-${stamp}.json`);
    await adapter.write(path, JSON.stringify(data, null, 2));
  }

  private pluginDir(): string {
    const dir = this.plugin.manifest.dir;
    if (!dir) throw new Error("ObsidianStorage: plugin manifest.dir is unavailable");
    return dir;
  }

  private shardPath(name: string): string {
    if (!/^[a-z0-9-]+$/i.test(name)) throw new Error(`ObsidianStorage: invalid shard name "${name}"`);
    return normalizePath(`${this.pluginDir()}/store/${name}.json`);
  }
}
