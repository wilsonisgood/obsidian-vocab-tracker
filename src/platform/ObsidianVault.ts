import { TFile, TFolder, normalizePath, type App, type Component, type TAbstractFile } from "obsidian";
import type { ParagraphVaultPort, VaultPort } from "../core/ports";

// The vault as the services see it (規劃書 06 §5.1 paragraph anchors, §8
// exports):
//   G — process, blockIdTaken
//   I — exists, create, rename, findManaged, ready

// Thrown inside vault.process to skip writing an unchanged note.
class Unchanged {
  constructor(readonly text: string) {}
}

export class ObsidianVault implements VaultPort, ParagraphVaultPort {
  constructor(private app: App) {}

  // ── shared ────────────────────────────────────────────────────────────

  async read(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? this.app.vault.cachedRead(file) : null;
  }

  // ── task G ────────────────────────────────────────────────────────────

  // vault.process(file, fn). Rethrow whatever `fn` throws unchanged:
  // ExportService tells another article's .ai.md apart by the error's
  // class. Skip the write when `fn` returns the text unchanged (no mtime
  // bump, no sync churn). Rejects when the file doesn't exist. Needs
  // minAppVersion ≥ 1.1.0 in manifest.json.
  async process(path: string, fn: (text: string) => string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`);
    // vault.process writes whatever the callback returns; throwing is the
    // only way to cancel the write from inside the atomic callback, so an
    // unchanged result throws this module-private marker (fn can't throw
    // one itself) and is caught below.
    try {
      return await this.app.vault.process(file, (text) => {
        const next = fn(text);
        if (next === text) throw new Unchanged(text);
        return next;
      });
    } catch (e) {
      if (e instanceof Unchanged) return e.text;
      throw e;
    }
  }

  // Any markdown file whose metadataCache blocks already have this id.
  // metadataCache keys block ids in lower case.
  blockIdTaken(id: string): boolean {
    const key = id.toLowerCase();
    const { metadataCache, vault } = this.app;
    return vault.getMarkdownFiles().some((f) => {
      const blocks = metadataCache.getFileCache(f)?.blocks;
      return !!blocks && (Object.prototype.hasOwnProperty.call(blocks, key) || Object.prototype.hasOwnProperty.call(blocks, id));
    });
  }

  // ── task I ────────────────────────────────────────────────────────────

  // Index of managed notes for findManaged, built from the metadata cache
  // on first use and kept current by the events register() subscribes to.
  // Null = not built yet (or dropped by the first "resolved", to rebuild
  // from the complete cache).
  private managed: ManagedIndex | null = null;
  private watching = false;
  private cacheResolved = false;
  private readyWaiters: (() => void)[] = [];
  // ready() gives up waiting after this long, so a vault where "resolved"
  // never fires (or fired before register) can't hang its callers.
  readyTimeoutMs = 10_000;

  // Subscribes the managed-note index to the vault and metadata cache.
  // Call once from Plugin.onload (before the layout is ready, so the first
  // "resolved" isn't missed): `vault.register(this)`. The plugin
  // unregisters the events on unload.
  register(component: Component): void {
    if (this.watching) return;
    this.watching = true;
    const { vault, metadataCache, workspace } = this.app;
    component.registerEvent(
      metadataCache.on("changed", (file, _data, cache) => this.managed?.set(file.path, managedRefOf(cache?.frontmatter)))
    );
    component.registerEvent(metadataCache.on("deleted", (file) => this.managed?.delete(file.path)));
    component.registerEvent(metadataCache.on("resolved", () => this.onResolved()));
    component.registerEvent(vault.on("rename", (file, oldPath) => this.onRenamed(file, oldPath)));
    component.registerEvent(
      vault.on("delete", (file) => {
        if (file instanceof TFolder) this.managed?.deleteUnder(file.path);
        else this.managed?.delete(file.path);
      })
    );
    // Enabled mid-session (not at startup): the cache finished long ago
    // and its first "resolved" won't come again.
    if (workspace.layoutReady) this.markResolved();
  }

  exists(path: string): boolean {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  // Creates missing parent folders; rejects when the file already exists.
  async create(path: string, content: string): Promise<void> {
    const target = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(target)) throw new Error(`File already exists: ${target}`);
    await this.ensureFolder(parentOf(target));
    const file = await this.app.vault.create(target, content);
    // The cache parses the new file a moment later; findManaged shouldn't
    // miss it in between.
    this.managed?.set(file.path, managedRefOf(parseFrontmatter(content)));
  }

  // fileManager.renameFile, so links to the file follow it. Creates the
  // target's missing folders; rejects when the source is missing or the
  // target exists (never overwrites).
  async rename(from: string, to: string): Promise<void> {
    const source = normalizePath(from);
    const target = normalizePath(to);
    const file = this.app.vault.getAbstractFileByPath(source);
    if (!file) throw new Error(`File not found: ${source}`);
    if (source === target) return;
    if (this.app.vault.getAbstractFileByPath(target)) throw new Error(`File already exists: ${target}`);
    await this.ensureFolder(parentOf(target));
    await this.app.fileManager.renameFile(file, target);
    this.managed?.move(source, target);
  }

  // Frontmatter `vocab-tracker: <kind>` + `vocab-tracker-id: <id>`, the id
  // compared as a string (also article paths for "ai-note"). Keep an index
  // updated from metadataCache changed / rename / delete rather than
  // scanning every file per call.
  findManaged(kind: string, id: string): string | null {
    // Without register() nothing keeps an index current: look it up fresh.
    if (!this.watching) return this.scan().find(kind, id);
    this.managed ??= this.scan();
    return this.managed.find(kind, id);
  }

  // Resolves once metadataCache has finished its initial index, so
  // findManaged doesn't miss a moved word page or .ai.md at startup.
  ready(): Promise<void> {
    if (this.cacheResolved || cacheLooksResolved(this.app)) {
      this.cacheResolved = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (ref) this.app.metadataCache.offref(ref);
        resolve();
      };
      const timer = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((w) => w !== finish);
        finish();
      }, this.readyTimeoutMs);
      this.readyWaiters.push(finish);
      // Not registered: listen for this one call.
      const ref = this.watching ? null : this.app.metadataCache.on("resolved", () => this.onResolved());
    });
  }

  private onResolved(): void {
    if (this.cacheResolved) return;
    // Rebuild from the now complete cache: files parsed before register()
    // or while the index was unbuilt never sent "changed" to it.
    this.managed = null;
    this.markResolved();
  }

  private markResolved(): void {
    this.cacheResolved = true;
    for (const finish of this.readyWaiters.splice(0)) finish();
  }

  private onRenamed(file: TAbstractFile, oldPath: string): void {
    const index = this.managed;
    if (!index) return;
    if (file instanceof TFolder) {
      index.moveUnder(oldPath, file.path);
    } else if (index.has(oldPath)) {
      index.move(oldPath, file.path);
    } else if (file instanceof TFile) {
      // Already moved with its folder, or not indexed yet: read it fresh.
      index.set(file.path, managedRefOf(this.app.metadataCache.getFileCache(file)?.frontmatter));
    }
  }

  private scan(): ManagedIndex {
    const index = new ManagedIndex();
    const { vault, metadataCache } = this.app;
    for (const file of vault.getMarkdownFiles()) {
      index.set(file.path, managedRefOf(metadataCache.getFileCache(file)?.frontmatter));
    }
    return index;
  }

  // Creates `dir` and its missing parents, one level at a time. A folder
  // that appears meanwhile (another call, sync) is fine; a file in the
  // way is an error.
  private async ensureFolder(dir: string): Promise<void> {
    if (!dir) return;
    const parts = dir.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join("/");
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`Not a folder: ${path}`);
      try {
        await this.app.vault.createFolder(path);
      } catch (e) {
        if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFolder)) throw e;
      }
    }
  }
}

// ── Managed-note index (task I) ─────────────────────────────────────────

const KIND_KEY = "vocab-tracker";
const ID_KEY = "vocab-tracker-id";

export interface ManagedRef {
  kind: string;
  id: string;
}

// A frontmatter value as the string it was written as: YAML may have read
// an unquoted numeric id as a number.
function scalar(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function managedRefOf(frontmatter: unknown): ManagedRef | null {
  if (!frontmatter || typeof frontmatter !== "object") return null;
  const fm = frontmatter as Record<string, unknown>;
  const kind = scalar(fm[KIND_KEY]);
  const id = scalar(fm[ID_KEY]);
  return kind && id ? { kind, id } : null;
}

// The two keys from a file's text, for a file the cache hasn't parsed
// yet. Only top-level `key: value` lines; values JSON- or single-quoted
// or bare (the forms the exports write).
export function parseFrontmatter(text: string): Record<string, string> | null {
  const m = /^\ufeff?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (!kv) continue;
    let value = kv[2];
    if (value.startsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed === "string") value = parsed;
      } catch {
        // Keep it as written.
      }
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    out[kv[1]] = value;
  }
  return out;
}

const refKey = (kind: string, id: string) => `${kind}\n${id}`;

export class ManagedIndex {
  private byPath = new Map<string, string>();
  private byRef = new Map<string, Set<string>>();

  has(path: string): boolean {
    return this.byPath.has(path);
  }

  set(path: string, ref: ManagedRef | null): void {
    this.delete(path);
    if (!ref) return;
    const key = refKey(ref.kind, ref.id);
    this.byPath.set(path, key);
    let paths = this.byRef.get(key);
    if (!paths) this.byRef.set(key, (paths = new Set()));
    paths.add(path);
  }

  delete(path: string): void {
    const key = this.byPath.get(path);
    if (key === undefined) return;
    this.byPath.delete(path);
    const paths = this.byRef.get(key);
    paths?.delete(path);
    if (paths && !paths.size) this.byRef.delete(key);
  }

  move(from: string, to: string): void {
    const key = this.byPath.get(from);
    if (key === undefined) return;
    const [kind, id] = splitKey(key);
    this.delete(from);
    this.set(to, { kind, id });
  }

  moveUnder(fromDir: string, toDir: string): void {
    for (const path of [...this.byPath.keys()]) {
      if (path.startsWith(`${fromDir}/`)) this.move(path, toDir + path.slice(fromDir.length));
    }
  }

  deleteUnder(dir: string): void {
    for (const path of [...this.byPath.keys()]) {
      if (path.startsWith(`${dir}/`)) this.delete(path);
    }
  }

  // With several (a sync conflict copy), the same one every time.
  find(kind: string, id: string): string | null {
    const paths = this.byRef.get(refKey(kind, id));
    if (!paths?.size) return null;
    return [...paths].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))[0];
  }
}

function splitKey(key: string): [string, string] {
  const i = key.indexOf("\n");
  return [key.slice(0, i), key.slice(i + 1)];
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : "";
}

// Obsidian keeps an undocumented flag once the first full resolve is done.
// Used only when present; otherwise ready() waits for the event.
function cacheLooksResolved(app: App): boolean {
  return (app.metadataCache as unknown as { resolved?: unknown }).resolved === true;
}
