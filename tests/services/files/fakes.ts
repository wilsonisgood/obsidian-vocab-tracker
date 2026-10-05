import type { VaultPort } from "../../../src/core/ports";
import type { SeedRecordPort } from "../../../src/services/files/ports";

// In-memory vault whose findManaged reads the files' frontmatter, like
// ObsidianVault's index does. `log` records every write.
export class MemoryVault implements VaultPort {
  files = new Map<string, string>();
  log: string[] = [];
  readyCalls = 0;
  // Called inside create() before the existence check, to simulate a file
  // appearing meanwhile (sync).
  beforeCreate: ((path: string) => void) | null = null;

  async ready(): Promise<void> {
    this.readyCalls++;
  }

  exists(path: string): boolean {
    return this.files.has(path);
  }

  async create(path: string, content: string): Promise<void> {
    await Promise.resolve();
    this.beforeCreate?.(path);
    if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
    this.log.push(`create ${path}`);
    this.files.set(path, content);
  }

  async process(path: string, fn: (text: string) => string): Promise<void> {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`missing ${path}`);
    const next = fn(text);
    if (next !== text) this.log.push(`process ${path}`);
    this.files.set(path, next);
  }

  async rename(from: string, to: string): Promise<void> {
    const text = this.files.get(from);
    if (text === undefined) throw new Error(`missing ${from}`);
    if (this.files.has(to)) throw new Error(`File already exists: ${to}`);
    this.log.push(`rename ${from} → ${to}`);
    this.files.delete(from);
    this.files.set(to, text);
  }

  // A rename by the user (not through the plugin).
  move(from: string, to: string): void {
    const text = this.files.get(from);
    if (text === undefined) throw new Error(`missing ${from}`);
    this.files.delete(from);
    this.files.set(to, text);
  }

  findManaged(kind: string, id: string): string | null {
    for (const [path, text] of this.files) {
      const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
      const get = (k: string) => {
        const m = new RegExp(`^${k}: (.*)$`, "m").exec(fm)?.[1];
        return m === undefined ? undefined : m.startsWith('"') ? JSON.parse(m) : m;
      };
      if (get("vocab-tracker") === kind && String(get("vocab-tracker-id")) === id) return path;
    }
    return null;
  }
}

export class MemorySeeds implements SeedRecordPort {
  ids = new Set<string>();
  async seeded(): Promise<ReadonlySet<string>> {
    return new Set(this.ids);
  }
  async markSeeded(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.ids.add(id);
  }
}
