import { normalizePath, type Plugin } from "obsidian";
import type { BackupStoragePort, StoragePort } from "../core/ports";

// "data" is loadData/saveData's data.json (same file M0 already used).
// Every other shard is `store/<name>.json` inside the plugin folder
// (規劃書 06 §4.2) and must be listed here by the milestone that starts
// writing it — unknown names still throw instead of silently no-op-ing, so
// a typo'd shard name fails loudly.
const FILE_SHARDS = new Set(["reviews", "usage", "threads", "imports", "learn", "files"]);

const UNSUPPORTED_SHARD = (name: string) =>
  new Error(`ObsidianStorage: shard "${name}" is not implemented yet`);

// Backup file names: plain names only (no folders, no "..").
const BACKUP_NAME = /^[\w.-]+\.json$/;

export class ObsidianStorage implements StoragePort, BackupStoragePort {
  constructor(private plugin: Plugin) {}

  private pluginDir(): string {
    const dir = this.plugin.manifest.dir;
    if (!dir) throw new Error("ObsidianStorage: plugin manifest.dir is unavailable");
    return dir;
  }

  private shardPath(name: string): string {
    return normalizePath(`${this.pluginDir()}/store/${name}.json`);
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

  // The v1 → v2 migration's one-off backup of data.json:
  // backup/<name>-v1-<time>.json (BackupService lists and restores these).
  async backup(name: string, data: unknown): Promise<void> {
    const stamp = new Date().toISOString().replace(/:/g, "-");
    await this.writeBackupFile(`${name}-v1-${stamp}.json`, JSON.stringify(data, null, 2));
  }

  // ── 備份與還原 (services/backup) ─────────────────────────────────

  get backupFolder(): string {
    return normalizePath(`${this.pluginDir()}/backup`);
  }

  private backupPath(name: string): string {
    if (!BACKUP_NAME.test(name) || name.includes("..")) throw new Error(`ObsidianStorage: bad backup name "${name}"`);
    return normalizePath(`${this.backupFolder}/${name}`);
  }

  private async writeBackupFile(name: string, text: string): Promise<string> {
    const adapter = this.plugin.app.vault.adapter;
    const dir = this.backupFolder;
    if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
    const path = this.backupPath(name);
    await adapter.write(path, text);
    return path;
  }

  // Plain file names of the *.json files in backup/.
  async listBackups(): Promise<string[]> {
    const adapter = this.plugin.app.vault.adapter;
    const dir = this.backupFolder;
    if (!(await adapter.exists(dir))) return [];
    const { files } = await adapter.list(dir);
    return files.map((p) => p.slice(p.lastIndexOf("/") + 1)).filter((n) => BACKUP_NAME.test(n));
  }

  async readBackup(name: string): Promise<unknown | null> {
    const adapter = this.plugin.app.vault.adapter;
    const path = this.backupPath(name);
    if (!(await adapter.exists(path))) return null;
    try {
      return JSON.parse(await adapter.read(path)) as unknown;
    } catch (e) {
      console.error(`Vocab Tracker: couldn't parse ${path}`, e);
      return null;
    }
  }

  // Compact JSON: a full backup carries every discussion, so pretty
  // printing would roughly double it.
  writeBackup(name: string, data: unknown): Promise<string> {
    return this.writeBackupFile(name, JSON.stringify(data));
  }

  // data.json plus every store/*.json, parsed. A shard that doesn't parse
  // is kept as its raw text, so a backup never silently drops it.
  async readAllShards(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { data: (await this.plugin.loadData()) ?? null };
    const adapter = this.plugin.app.vault.adapter;
    const dir = normalizePath(`${this.pluginDir()}/store`);
    if (!(await adapter.exists(dir))) return out;
    const { files } = await adapter.list(dir);
    for (const path of files) {
      const m = /\/([\w.-]+)\.json$/.exec(path);
      if (!m || m[1] === "data") continue;
      const text = await adapter.read(path);
      try {
        out[m[1]] = JSON.parse(text) as unknown;
      } catch {
        out[m[1]] = text;
      }
    }
    return out;
  }
}
