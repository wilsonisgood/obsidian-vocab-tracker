import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class TFile {
    constructor(public path: string) {}
  }
  return { TFile };
});

import { TFile, type App } from "obsidian";
import { ObsidianVault } from "../../src/platform/ObsidianVault";

// A vault whose process() behaves like Obsidian's: it writes whatever the
// callback returns, and writes nothing when the callback throws.
function fakeApp(files: Record<string, string>, blocks: Record<string, string[]> = {}) {
  const tfiles = new Map(Object.keys(files).map((p) => [p, new (TFile as unknown as new (p: string) => TFile)(p)]));
  const writes: string[] = [];
  const vault = {
    getAbstractFileByPath: (p: string) => tfiles.get(p) ?? null,
    cachedRead: async (f: TFile) => files[f.path],
    process: async (f: TFile, fn: (text: string) => string) => {
      const next = fn(files[f.path]);
      files[f.path] = next;
      writes.push(f.path);
      return next;
    },
    getMarkdownFiles: () => [...tfiles.values()],
  };
  const metadataCache = {
    getFileCache: (f: TFile) =>
      blocks[f.path] ? { blocks: Object.fromEntries(blocks[f.path].map((id) => [id, { id }])) } : null,
  };
  return { app: { vault, metadataCache } as unknown as App, files, writes };
}

class OtherArticle extends Error {}

describe("ObsidianVault.process", () => {
  it("writes the new text and resolves to it", async () => {
    const { app, files, writes } = fakeApp({ "a.md": "Hello." });
    const v = new ObsidianVault(app);
    await expect(v.process("a.md", (t) => `${t} ^vt-aaaaaa`)).resolves.toBe("Hello. ^vt-aaaaaa");
    expect(files["a.md"]).toBe("Hello. ^vt-aaaaaa");
    expect(writes).toEqual(["a.md"]);
  });

  it("doesn't write when the text comes back unchanged", async () => {
    const { app, writes } = fakeApp({ "a.md": "Hello. ^mine" });
    const v = new ObsidianVault(app);
    await expect(v.process("a.md", (t) => t)).resolves.toBe("Hello. ^mine");
    expect(writes).toEqual([]);
  });

  it("rethrows the callback's own error unchanged and writes nothing", async () => {
    const { app, files, writes } = fakeApp({ "a.md": "Hello." });
    const v = new ObsidianVault(app);
    const err = new OtherArticle("not ours");
    const p = v.process("a.md", () => {
      throw err;
    });
    await expect(p).rejects.toBe(err);
    await expect(p).rejects.toBeInstanceOf(OtherArticle);
    expect(files["a.md"]).toBe("Hello.");
    expect(writes).toEqual([]);
  });

  it("rejects when the file doesn't exist", async () => {
    const { app } = fakeApp({});
    const fn = vi.fn((t: string) => t);
    await expect(new ObsidianVault(app).process("missing.md", fn)).rejects.toThrow("missing.md");
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("ObsidianVault.blockIdTaken", () => {
  it("checks every note's cached blocks", () => {
    const { app } = fakeApp({ "a.md": "", "b.md": "", "c.md": "" }, { "b.md": ["vt-k3x9q2", "mine"] });
    const v = new ObsidianVault(app);
    expect(v.blockIdTaken("vt-k3x9q2")).toBe(true);
    expect(v.blockIdTaken("mine")).toBe(true);
    expect(v.blockIdTaken("vt-zzzzzz")).toBe(false);
  });

  it("matches the cache's lower-cased keys", () => {
    const { app } = fakeApp({ "a.md": "" }, { "a.md": ["myblock"] });
    expect(new ObsidianVault(app).blockIdTaken("MyBlock")).toBe(true);
  });

  it("is false in a vault without blocks", () => {
    const { app } = fakeApp({ "a.md": "" });
    expect(new ObsidianVault(app).blockIdTaken("vt-aaaaaa")).toBe(false);
  });
});
