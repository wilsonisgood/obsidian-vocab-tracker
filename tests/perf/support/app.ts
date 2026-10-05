/* eslint-disable @typescript-eslint/no-explicit-any */
// An in-memory Obsidian App for booting the real plugin (main.ts) in the
// perf / §1.3 metric tests: a vault of notes, the plugin folder behind
// vault.adapter (data.json, store/*.json, backup/*), a metadata cache that
// parses frontmatter and block ids, and a workspace with one active note.
//
// Uses the mock's own classes directly: vi.mock("obsidian") hands the
// plugin this same module instance, so `instanceof TFile` agrees.

import { Events, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "./obsidian";

export const PLUGIN_DIR = ".obsidian/plugins/vocab-tracker";

export class FakeAdapter {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();
  writes: string[] = [];
  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }
  async read(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return v;
  }
  async write(path: string, data: string): Promise<void> {
    this.writes.push(path);
    this.files.set(path, data);
  }
  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
  async list(dir: string): Promise<{ files: string[]; folders: string[] }> {
    const files = [...this.files.keys()].filter((p) => p.startsWith(dir + "/") && !p.slice(dir.length + 1).includes("/"));
    return { files, folders: [] };
  }
}

function parentPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export class FakeVault extends Events {
  readonly adapter = new FakeAdapter();
  private nodes = new Map<string, TAbstractFile>();
  private contents = new Map<string, string>();
  private clock = 1_700_000_000_000;
  readonly root = new TFolder("/");
  modifies = 0;

  constructor(private app: FakeApp) {
    super();
  }

  private ensureFolder(path: string): TFolder {
    if (!path) return this.root;
    const hit = this.nodes.get(path);
    if (hit instanceof TFolder) return hit;
    const folder = new TFolder(path);
    folder.parent = this.ensureFolder(parentPath(path));
    folder.parent.children.push(folder);
    this.nodes.set(path, folder);
    return folder;
  }

  // Seeds a note (no events).
  addFile(path: string, content: string): TFile {
    const file = new TFile(path);
    file.parent = this.ensureFolder(parentPath(path));
    file.parent.children.push(file);
    file.stat = { ctime: this.clock, mtime: ++this.clock, size: content.length };
    this.nodes.set(path, file);
    this.contents.set(path, content);
    return file;
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return this.nodes.get(path) ?? null;
  }
  getRoot(): TFolder {
    return this.root;
  }
  getFiles(): TFile[] {
    return [...this.nodes.values()].filter((n): n is TFile => n instanceof TFile);
  }
  getMarkdownFiles(): TFile[] {
    return this.getFiles().filter((f) => f.extension === "md");
  }
  getAllLoadedFiles(): TAbstractFile[] {
    return [...this.nodes.values()];
  }

  text(path: string): string | undefined {
    return this.contents.get(path);
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.contents.get(file.path) ?? "";
  }
  async read(file: TFile): Promise<string> {
    return this.contents.get(file.path) ?? "";
  }
  async modify(file: TFile, data: string): Promise<void> {
    this.modifies++;
    this.contents.set(file.path, data);
    file.stat = { ...file.stat, mtime: ++this.clock, size: data.length };
    this.app.metadataCache.invalidate(file.path);
    this.trigger("modify", file);
  }
  async process(file: TFile, fn: (text: string) => string): Promise<string> {
    const next = fn(this.contents.get(file.path) ?? "");
    await this.modify(file, next);
    return next;
  }
  async create(path: string, data: string): Promise<TFile> {
    if (this.nodes.has(path)) throw new Error(`File already exists: ${path}`);
    const file = this.addFile(path, data);
    this.trigger("create", file);
    return file;
  }
  async createFolder(path: string): Promise<TFolder> {
    return this.ensureFolder(path);
  }
  async delete(file: TAbstractFile): Promise<void> {
    this.nodes.delete(file.path);
    this.contents.delete(file.path);
    this.trigger("delete", file);
  }
  async rename(file: TAbstractFile, to: string): Promise<void> {
    const from = file.path;
    const content = this.contents.get(from);
    this.nodes.delete(from);
    this.contents.delete(from);
    file.path = to;
    this.nodes.set(to, file);
    if (content !== undefined) this.contents.set(to, content);
    this.app.metadataCache.invalidate(from);
    this.trigger("rename", file, from);
  }
}

interface FileCache {
  frontmatter?: Record<string, unknown>;
  blocks?: Record<string, { id: string; position: { start: { line: number }; end: { line: number } } }>;
}

function parseFrontmatter(text: string): Record<string, unknown> | undefined {
  if (!text.startsWith("---\n")) return undefined;
  const end = text.indexOf("\n---", 4);
  if (end < 0) return undefined;
  const out: Record<string, unknown> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export class FakeMetadataCache extends Events {
  resolved = true;
  private cache = new Map<string, FileCache>();
  constructor(private app: FakeApp) {
    super();
  }
  invalidate(path: string): void {
    this.cache.delete(path);
  }
  getCache(path: string): FileCache | null {
    const text = this.app.vault.text(path);
    if (text === undefined) return null;
    let c = this.cache.get(path);
    if (!c) {
      c = {};
      const fm = parseFrontmatter(text);
      if (fm) c.frontmatter = fm;
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = /\s\^([A-Za-z0-9-]+)\s*$/.exec(lines[i]);
        if (!m) continue;
        c.blocks ??= {};
        c.blocks[m[1].toLowerCase()] = { id: m[1], position: { start: { line: i }, end: { line: i } } };
      }
      this.cache.set(path, c);
    }
    return c;
  }
  getFileCache(file: TFile): FileCache | null {
    return this.getCache(file.path);
  }
  getFirstLinkpathDest(): null {
    return null;
  }
}

export class FakeWorkspace extends Events {
  layoutReady = false;
  private readyCallbacks: (() => void)[] = [];
  activeFile: TFile | null = null;
  readonly leaves: WorkspaceLeaf[] = [];

  constructor(private app: FakeApp) {
    super();
  }
  onLayoutReady(cb: () => void): void {
    if (this.layoutReady) cb();
    else this.readyCallbacks.push(cb);
  }
  finishLayout(): void {
    this.layoutReady = true;
    for (const cb of this.readyCallbacks.splice(0)) cb();
  }
  getActiveFile(): TFile | null {
    return this.activeFile;
  }
  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return this.leaves.filter((l) => l.view?.getViewType?.() === type);
  }
  private newLeaf(): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf(this.app);
    this.leaves.push(leaf);
    return leaf;
  }
  getRightLeaf(): WorkspaceLeaf {
    return this.newLeaf();
  }
  getLeaf(): WorkspaceLeaf {
    return this.newLeaf();
  }
  revealLeaf(): void {}
  setActiveLeaf(): void {}
  openFile(file: TFile): void {
    this.activeFile = file;
    this.trigger("file-open", file);
  }
  get activeLeaf(): WorkspaceLeaf | null {
    return null;
  }
}

export class FakeApp {
  readonly vault: FakeVault;
  readonly metadataCache: FakeMetadataCache;
  readonly workspace: FakeWorkspace;
  readonly fileManager: { renameFile(file: TAbstractFile, to: string): Promise<void> };
  private local = new Map<string, unknown>();

  constructor() {
    this.vault = new FakeVault(this);
    this.metadataCache = new FakeMetadataCache(this);
    this.workspace = new FakeWorkspace(this);
    this.fileManager = { renameFile: (file, to) => this.vault.rename(file, to) };
  }

  loadLocalStorage(key: string): unknown {
    return this.local.get(key) ?? null;
  }
  saveLocalStorage(key: string, value: unknown): void {
    if (value === null || value === undefined) this.local.delete(key);
    else this.local.set(key, value);
  }
}

// Plugin-folder file helpers.
export function pluginFile(name: string): string {
  return `${PLUGIN_DIR}/${name}`;
}

export function asAny<T>(x: T): any {
  return x;
}
