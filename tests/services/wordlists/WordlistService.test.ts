import { describe, expect, it, vi } from "vitest";
import { resolveWordlistSettings, type WordlistSettings } from "../../../src/core/model/wordlists";
import type { WordlistSourcePort } from "../../../src/core/ports";
import { WordlistService } from "../../../src/services/wordlists/WordlistService";

function setup(files: Record<string, string>, patch: Partial<WordlistSettings> = {}) {
  let settings = resolveWordlistSettings(patch);
  const source: WordlistSourcePort = {
    list: (folder) =>
      Object.keys(files)
        .filter((p) => p.startsWith(folder + "/"))
        .map((path) => ({ path, basename: path.slice(path.lastIndexOf("/") + 1).replace(/\.\w+$/, "") })),
    read: async (path) => files[path] ?? null,
  };
  const service = new WordlistService({ source, settings: () => settings, yieldToUi: async () => {} });
  return { service, setSettings: (p: Partial<WordlistSettings>) => (settings = resolveWordlistSettings({ ...settings, ...p })) };
}

const FILES = {
  "vocab-wordlists/exam-TOEFL.md": "analyze\ndata",
  "vocab-wordlists/exam-IELTS.txt": "data",
  "vocab-wordlists/empty.md": "# nothing",
  "elsewhere/exam-TOEIC.md": "budget",
};

describe("WordlistService", () => {
  it("loads lists from the configured folder only and emits index-changed", async () => {
    const { service } = setup(FILES);
    const onChange = vi.fn();
    service.on("index-changed", onChange);
    await service.reload();
    expect(service.index.tags).toEqual(["exam/IELTS", "exam/TOEFL"]);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("scans a note once per mtime and emits scanned", async () => {
    const { service } = setup(FILES);
    await service.reload();
    const read = vi.fn(async () => "The data was analyzed.\n".repeat(700));
    const onScanned = vi.fn();
    service.on("scanned", onScanned);

    const r = await service.scan("note.md", 1, read);
    expect(r.byTag["exam/TOEFL"]).toEqual({ unique: 2, count: 1400 });
    expect(r.hits.map((h) => [h.word, h.line])).toEqual([["data", 0], ["analyze", 0]]);
    await service.scan("note.md", 1, read);
    expect(read).toHaveBeenCalledOnce();
    expect(onScanned).toHaveBeenCalledOnce();
    expect(service.cachedScan("note.md", 1)).toBe(r);
    expect(service.cachedScan("note.md", 2)).toBeNull();
  });

  it("drops cached scans when the lists reload", async () => {
    const { service } = setup(FILES);
    await service.reload();
    await service.scan("note.md", 1, async () => "data");
    await service.reload();
    expect(service.cachedScan("note.md", 1)).toBeNull();
  });

  it("highlightLookup skips disabled tags and returns null when off", async () => {
    const { service, setSettings } = setup(FILES, { tags: { "exam/IELTS": { enabled: false } } });
    await service.reload();
    expect(service.highlightLookup()!("data")).toEqual(["exam/TOEFL"]);
    setSettings({ highlight: false });
    expect(service.highlightLookup()).toBeNull();
  });

  it("frontmatter tag overrides the file name", async () => {
    const { service } = setup({ "vocab-wordlists/x.md": "---\ntag: exam/GEPT\n---\nbenefit" });
    await service.reload();
    expect(service.index.tags).toEqual(["exam/GEPT"]);
  });
});
