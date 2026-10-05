import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class TAbstractFile {
    constructor(public path: string) {}
  }
  class TFile extends TAbstractFile {}
  class TFolder extends TAbstractFile {}
  const normalizePath = (p: string) => p.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  return { TAbstractFile, TFile, TFolder, normalizePath };
});

import { TFile, TFolder, type App, type Component } from "obsidian";
import { ManagedIndex, ObsidianVault, managedRefOf, parseFrontmatter } from "../../src/platform/ObsidianVault";

// The mocked classes take their path (Obsidian's typings declare no
// constructor arguments).
const newFile = (path: string) => new (TFile as unknown as new (p: string) => TFile)(path);
const newFolder = (path: string) => new (TFolder as unknown as new (p: string) => TFolder)(path);

type Listener = (...args: unknown[]) => void;
interface Ref {
  name: string;
  fn: Listener;
}

class Emitter {
  refs: Ref[] = [];
  on(name: string, fn: Listener): Ref {
    const ref = { name, fn };
    this.refs.push(ref);
    return ref;
  }
  offref(ref: Ref): void {
    this.refs = this.refs.filter((r) => r !== ref);
  }
  trigger(name: string, ...args: unknown[]): void {
    for (const r of [...this.refs]) if (r.name === name) r.fn(...args);
  }
  count(name: string): number {
    return this.refs.filter((r) => r.name === name).length;
  }
}

type Frontmatter = Record<string, unknown>;

// Just enough of Obsidian's App for ObsidianVault.
class FakeApp {
  entries = new Map<string, TFile | TFolder>();
  texts = new Map<string, string>();
  caches = new Map<string, { frontmatter?: Frontmatter }>();
  log: string[] = [];
  metadataCache = Object.assign(new Emitter(), {
    getFileCache: (file: TFile) => this.caches.get(file.path) ?? null,
  });
  vault = Object.assign(new Emitter(), {
    getAbstractFileByPath: (path: string) => this.entries.get(path) ?? null,
    getMarkdownFiles: () => [...this.entries.values()].filter((f): f is TFile => f instanceof TFile && f.path.endsWith(".md")),
    create: async (path: string, content: string) => {
      if (this.entries.has(path)) throw new Error("File already exists.");
      this.log.push(`create ${path}`);
      const file = newFile(path);
      this.entries.set(path, file);
      this.texts.set(path, content);
      return file;
    },
    createFolder: async (path: string) => {
      if (this.entries.has(path)) throw new Error("Folder already exists.");
      this.log.push(`mkdir ${path}`);
      const folder = newFolder(path);
      this.entries.set(path, folder);
      return folder;
    },
  });
  fileManager = {
    renameFile: async (file: TFile | TFolder, to: string) => {
      this.log.push(`renameFile ${file.path} → ${to}`);
      this.moveEntry(file, to);
    },
  };
  workspace = { layoutReady: false };

  // A Markdown file the cache already knows (e.g. from a previous session).
  addFile(path: string, frontmatter?: Frontmatter): TFile {
    const file = newFile(path);
    this.entries.set(path, file);
    this.caches.set(path, frontmatter ? { frontmatter } : {});
    return file;
  }

  addFolder(path: string): TFolder {
    const folder = newFolder(path);
    this.entries.set(path, folder);
    return folder;
  }

  // The cache (re)parsed a file: "changed".
  edit(path: string, frontmatter?: Frontmatter): void {
    const file = this.entries.get(path) as TFile;
    const cache = frontmatter ? { frontmatter } : {};
    this.caches.set(path, cache);
    this.metadataCache.trigger("changed", file, "", cache);
  }

  // A move outside the plugin (file explorer): children move with a
  // folder, then "rename" fires for the folder and for each child.
  moveEntry(file: TFile | TFolder, to: string): void {
    const from = file.path;
    const moved: [TFile | TFolder, string][] = [[file, from]];
    if (file instanceof TFolder) {
      for (const [p, f] of this.entries) if (p.startsWith(`${from}/`)) moved.push([f, p]);
    }
    for (const [f, old] of moved) {
      const next = to + old.slice(from.length);
      this.entries.delete(old);
      f.path = next;
      this.entries.set(next, f);
      const cache = this.caches.get(old);
      this.caches.delete(old);
      if (cache) this.caches.set(next, cache);
    }
    for (const [f, old] of moved) this.vault.trigger("rename", f, old);
  }

  remove(path: string): void {
    const file = this.entries.get(path);
    if (!file) return;
    const gone = [path, ...[...this.entries.keys()].filter((p) => p.startsWith(`${path}/`))];
    for (const p of gone) {
      this.entries.delete(p);
      this.caches.delete(p);
    }
    this.vault.trigger("delete", file);
  }
}

class FakeComponent {
  refs: unknown[] = [];
  registerEvent(ref: unknown): void {
    this.refs.push(ref);
  }
}

function setup(opts: { register?: boolean; layoutReady?: boolean } = {}) {
  const app = new FakeApp();
  app.workspace.layoutReady = opts.layoutReady ?? false;
  const vault = new ObsidianVault(app as unknown as App);
  const component = new FakeComponent();
  if (opts.register ?? true) vault.register(component as unknown as Component);
  return { app, vault, component };
}

const WORD = { "vocab-tracker": "word", "vocab-tracker-id": "1721900000000" };

describe("ObsidianVault.exists", () => {
  it("is true for files and folders", () => {
    const { app, vault } = setup();
    app.addFile("a/b.md");
    app.addFolder("a");
    expect(vault.exists("a/b.md")).toBe(true);
    expect(vault.exists("/a/")).toBe(true);
    expect(vault.exists("a/c.md")).toBe(false);
  });
});

describe("ObsidianVault.create", () => {
  it("creates the missing parent folders first, top-down", async () => {
    const { app, vault } = setup();
    app.addFolder("vocab-list");
    await vault.create("vocab-list/單字/glittery.md", "hi");
    expect(app.log).toEqual(["mkdir vocab-list/單字", "create vocab-list/單字/glittery.md"]);
    expect(app.texts.get("vocab-list/單字/glittery.md")).toBe("hi");
  });

  it("creates a file at the vault root without folders", async () => {
    const { app, vault } = setup();
    await vault.create("x.md", "");
    expect(app.log).toEqual(["create x.md"]);
  });

  it("rejects when the file exists, leaving it as it was", async () => {
    const { app, vault } = setup();
    app.addFile("x.md");
    app.texts.set("x.md", "mine");
    await expect(vault.create("x.md", "theirs")).rejects.toThrow(/exists/);
    expect(app.texts.get("x.md")).toBe("mine");
    expect(app.log).toEqual([]);
  });

  it("is fine with a folder that appears meanwhile", async () => {
    const { app, vault } = setup();
    const createFolder = app.vault.createFolder;
    app.vault.createFolder = async (path: string) => {
      app.addFolder(path);
      return createFolder(path);
    };
    await vault.create("a/b.md", "");
    expect(app.entries.get("a/b.md")).toBeInstanceOf(TFile);
  });

  it("rejects when a file is where a folder should be", async () => {
    const { app, vault } = setup();
    app.addFile("a");
    await expect(vault.create("a/b.md", "")).rejects.toThrow(/Not a folder/);
  });

  it("indexes the new file right away, before the cache parses it", async () => {
    const { vault } = setup();
    expect(vault.findManaged("word", "1721900000000")).toBeNull();
    await vault.create("單字/glittery.md", '---\nvocab-tracker: word\nvocab-tracker-id: "1721900000000"\n---\n```vocab-word\n```\n');
    expect(vault.findManaged("word", "1721900000000")).toBe("單字/glittery.md");
  });
});

describe("ObsidianVault.rename", () => {
  it("goes through fileManager.renameFile and creates the target folder", async () => {
    const { app, vault } = setup();
    app.addFile("a.md", WORD);
    await vault.rename("a.md", "x/y/a.md");
    expect(app.log).toEqual(["mkdir x", "mkdir x/y", "renameFile a.md → x/y/a.md"]);
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBe("x/y/a.md");
  });

  it("rejects a missing source or an existing target", async () => {
    const { app, vault } = setup();
    app.addFile("a.md");
    app.addFile("b.md");
    await expect(vault.rename("nope.md", "c.md")).rejects.toThrow(/not found/);
    await expect(vault.rename("a.md", "b.md")).rejects.toThrow(/exists/);
    expect(app.log).toEqual([]);
  });
});

describe("ObsidianVault.findManaged", () => {
  it("finds a note by kind and id, comparing ids as strings", () => {
    const { app, vault } = setup();
    app.addFile("單字/glittery.md", { "vocab-tracker": "word", "vocab-tracker-id": 1721900000000 });
    app.addFile("討論串/Speech.ai.md", { "vocab-tracker": "ai-note", "vocab-tracker-id": "eng/Speech.md" });
    app.addFile("plain.md");
    expect(vault.findManaged("word", "1721900000000")).toBe("單字/glittery.md");
    expect(vault.findManaged("ai-note", "eng/Speech.md")).toBe("討論串/Speech.ai.md");
    expect(vault.findManaged("word", "eng/Speech.md")).toBeNull();
    expect(vault.findManaged("entry", "trivia")).toBeNull();
  });

  it("follows the cache's changed events", () => {
    const { app, vault } = setup();
    app.addFile("p.md");
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBeNull();
    app.edit("p.md", WORD);
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBe("p.md");
    // The user removed the id: no longer ours.
    app.edit("p.md", { "vocab-tracker": "word" });
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBeNull();
  });

  it("follows a renamed or moved file", () => {
    const { app, vault } = setup();
    const file = app.addFile("單字/glittery.md", WORD);
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBe("單字/glittery.md");
    app.moveEntry(file, "我的/閃亮.md");
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBe("我的/閃亮.md");
  });

  it("follows a renamed folder", () => {
    const { app, vault } = setup();
    const folder = app.addFolder("vocab-list");
    app.addFile("vocab-list/單字/glittery.md", WORD);
    app.addFile("vocab-list/冷知識.md", { "vocab-tracker": "entry", "vocab-tracker-id": "trivia" });
    expect(vault.findManaged("entry", "trivia")).toBe("vocab-list/冷知識.md");
    app.moveEntry(folder, "英文");
    expect(vault.findManaged("entry", "trivia")).toBe("英文/冷知識.md");
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBe("英文/單字/glittery.md");
  });

  it("indexes a file renamed before it was indexed", () => {
    const { app, vault } = setup();
    expect(vault.findManaged("word", "x")).toBeNull(); // builds the index
    const file = app.addFile("new.md", WORD); // no "changed" sent yet
    app.moveEntry(file, "moved.md");
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBe("moved.md");
  });

  it("forgets deleted files and folders", () => {
    const { app, vault } = setup();
    app.addFolder("w");
    app.addFile("w/a.md", { "vocab-tracker": "word", "vocab-tracker-id": "a" });
    app.addFile("b.md", { "vocab-tracker": "word", "vocab-tracker-id": "b" });
    app.addFile("c.md", { "vocab-tracker": "word", "vocab-tracker-id": "c" });
    expect(vault.findManaged("word", "a")).toBe("w/a.md");
    app.remove("w");
    app.remove("b.md");
    expect(vault.findManaged("word", "a")).toBeNull();
    expect(vault.findManaged("word", "b")).toBeNull();
    // The cache's own "deleted" event works too.
    app.metadataCache.trigger("deleted", app.entries.get("c.md"), null);
    expect(vault.findManaged("word", "c")).toBeNull();
  });

  it("picks the same file every time when the id is on several (sync conflict copy)", () => {
    const { app, vault } = setup();
    app.addFile("單字/glittery (conflict).md", WORD);
    app.addFile("單字/glittery.md", WORD);
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBe("單字/glittery.md");
  });

  it("scans the whole vault once, not on every call", () => {
    const { app, vault } = setup();
    app.addFile("a.md", WORD);
    const spy = vi.spyOn(app.vault, "getMarkdownFiles");
    vault.findManaged("word", "1");
    vault.findManaged("word", "2");
    vault.findManaged("word", "3");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rebuilds from the complete cache on the first resolved", () => {
    const { app, vault } = setup();
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBeNull();
    // Loaded into the cache at startup without a "changed" event.
    app.addFile("late.md", WORD);
    app.metadataCache.trigger("resolved");
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBe("late.md");
  });

  it("looks the vault up fresh on every call when not registered", () => {
    const { app, vault } = setup({ register: false });
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBeNull();
    app.addFile("a.md", WORD);
    expect(vault.findManaged("word", WORD["vocab-tracker-id"])).toBe("a.md");
  });

  it("registers its events on the component, once", () => {
    const { vault, component, app } = setup();
    vault.register(component as unknown as Component);
    expect(component.refs).toHaveLength(5);
    expect(app.metadataCache.count("changed")).toBe(1);
    expect(app.vault.count("rename")).toBe(1);
  });
});

describe("ObsidianVault.ready", () => {
  it("waits for the cache's first resolved", async () => {
    const { app, vault } = setup();
    let done = false;
    const p = vault.ready().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    app.metadataCache.trigger("resolved");
    await p;
    expect(done).toBe(true);
    // Later calls resolve at once.
    await vault.ready();
  });

  it("resolves at once when the plugin is enabled after startup", async () => {
    const { vault } = setup({ layoutReady: true });
    await vault.ready();
  });

  it("resolves at once when Obsidian's own flag says the cache is resolved", async () => {
    const { app, vault } = setup();
    Object.assign(app.metadataCache, { resolved: true });
    await vault.ready();
  });

  it("gives up waiting after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const { vault } = setup();
      vault.readyTimeoutMs = 50;
      let done = false;
      const p = vault.ready().then(() => (done = true));
      await vi.advanceTimersByTimeAsync(49);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("listens for one call when not registered, then stops listening", async () => {
    const { app, vault } = setup({ register: false });
    const p = vault.ready();
    expect(app.metadataCache.count("resolved")).toBe(1);
    app.metadataCache.trigger("resolved");
    await p;
    expect(app.metadataCache.count("resolved")).toBe(0);
  });
});

describe("frontmatter helpers", () => {
  it("reads kind and id as strings", () => {
    expect(managedRefOf({ "vocab-tracker": "word", "vocab-tracker-id": 12 })).toEqual({ kind: "word", id: "12" });
    expect(managedRefOf({ "vocab-tracker": "word", "vocab-tracker-id": " x " })).toEqual({ kind: "word", id: "x" });
    expect(managedRefOf({ "vocab-tracker": "word" })).toBeNull();
    expect(managedRefOf({ "vocab-tracker": ["word"], "vocab-tracker-id": "1" })).toBeNull();
    expect(managedRefOf(null)).toBeNull();
  });

  it("parses the frontmatter forms the exports write", () => {
    const text = '﻿---\r\nvocab-tracker: ai-note\r\nvocab-tracker-id: "eng/Speech.md"\r\nnote: \'it\'\'s\'\r\n---\r\nbody';
    expect(parseFrontmatter(text)).toEqual({ "vocab-tracker": "ai-note", "vocab-tracker-id": "eng/Speech.md", note: "it's" });
    expect(parseFrontmatter("no frontmatter")).toBeNull();
    expect(parseFrontmatter("---\nunclosed: yes\n")).toBeNull();
  });

  it("ManagedIndex moves and deletes by folder", () => {
    const index = new ManagedIndex();
    index.set("a/x.md", { kind: "word", id: "1" });
    index.set("ab/y.md", { kind: "word", id: "2" });
    index.moveUnder("a", "b");
    expect(index.find("word", "1")).toBe("b/x.md");
    expect(index.find("word", "2")).toBe("ab/y.md");
    index.deleteUnder("b");
    expect(index.find("word", "1")).toBeNull();
    expect(index.has("ab/y.md")).toBe(true);
  });
});
