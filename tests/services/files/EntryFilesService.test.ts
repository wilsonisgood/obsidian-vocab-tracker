import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getLocale, setLocale, type Locale } from "../../../src/core/i18n";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Thread } from "../../../src/core/model/thread";
import { ExportService } from "../../../src/services/export/ExportService";
import type { ExportDataPort } from "../../../src/services/export/ports";
import { EntryFilesService, type EntryFilesDeps } from "../../../src/services/files/EntryFilesService";
import { ENTRY_FILES, legacyTitleHeading, renderEntryFile } from "../../../src/services/files/entryFiles";
import type { FilesExportPort } from "../../../src/core/ports";
import { cleanFolder, resolveFilesSettings } from "../../../src/services/files/settings";
import { MemorySeeds, MemoryVault } from "./fakes";

let previousLocale: Locale;
beforeAll(() => {
  previousLocale = getLocale();
  setLocale("zh-TW");
});
afterAll(() => setLocale(previousLocale));

const FLASHCARDS = "vocab-list/單字卡.md";
const TRIVIA = "vocab-list/冷知識.md";

function setup(extra: Partial<EntryFilesDeps> = {}) {
  const vault = new MemoryVault();
  const seeds = new MemorySeeds();
  const files = new EntryFilesService({ vault, seeds, ...extra });
  return { vault, seeds, files };
}

function fakeExport(log: string[]): FilesExportPort {
  return {
    renameArticle: vi.fn(async (a: string, b: string) => void log.push(`export.rename ${a} → ${b}`)),
    articleChanged: vi.fn((p: string, mode?: string) => void log.push(`export.changed ${p} ${mode}`)),
    openWordPage: vi.fn(async (id: string) => `vocab-list/單字/${id}.md`),
    triviaChanged: vi.fn(() => void log.push("export.trivia")),
  };
}

describe("entry file content", () => {
  it("hides the block's own favorites list in 冷知識.md (the exported section lists them)", () => {
    expect(renderEntryFile("trivia")).toContain("```vocab-trivia\nfavorites: off\n```");
  });

  it("has the frontmatter id and the code block, without a heading repeating the inline title (1005 #4)", () => {
    for (const def of ENTRY_FILES) {
      const text = renderEntryFile(def.id);
      expect(text).not.toMatch(/^# /m);
      expect(text).toMatch(new RegExp("^---\\n[^]*?\\n---\\n```" + def.block));
      expect(text).toContain("vocab-tracker: entry\n");
      expect(text).toContain(`vocab-tracker-id: ${def.id}\n`);
      expect(text).toContain("```" + def.block + "\n" + (def.params ? def.params + "\n" : "") + "```");
    }
  });

  it("matches the snapshots", () => {
    expect(Object.fromEntries(ENTRY_FILES.map((d) => [d.id, renderEntryFile(d.id)]))).toMatchSnapshot();
  });

  it("recognizes the 「# 字族樹」 an older entry file starts with", () => {
    const h = (heading: string, line: number, level = 1) => ({ heading, level, position: { start: { line } } });
    // Frontmatter on lines 0–3, heading right after (the old template).
    expect(legacyTitleHeading("字族樹", [h("字族樹", 4)], 3)).toBe(true);
    // A blank line or two in between is fine.
    expect(legacyTitleHeading("字族樹", [h("字族樹", 6)], 3)).toBe(true);
    expect(legacyTitleHeading("字族樹", [h("字族樹", 7)], 3)).toBe(false);
    // No frontmatter: first line.
    expect(legacyTitleHeading("字族樹", [h("字族樹", 0)], undefined)).toBe(true);
    // Renamed file, an H2, a heading the user wrote further down, none.
    expect(legacyTitleHeading("我的字族", [h("字族樹", 4)], 3)).toBe(false);
    expect(legacyTitleHeading("字族樹", [h("字族樹", 4, 2)], 3)).toBe(false);
    expect(legacyTitleHeading("字族樹", [h("筆記", 4), h("字族樹", 9)], 3)).toBe(false);
    expect(legacyTitleHeading("字族樹", undefined, 3)).toBe(false);
  });

  it("puts an empty saved-trivia section under 冷知識's block", () => {
    const text = renderEntryFile("trivia");
    expect(text.indexOf("```vocab-trivia")).toBeLessThan(text.indexOf("%% vt:begin trivia-favorites %%"));
    expect(text).toContain("%% vt:end trivia-favorites %%");
  });
});

describe("files settings", () => {
  it("fills in defaults", () => {
    expect(resolveFilesSettings(undefined)).toEqual({ folder: "vocab-list", wordsFolder: "單字", threadsFolder: "討論串" });
    expect(resolveFilesSettings({ folder: "  " }).folder).toBe("vocab-list");
  });

  it("cleans folder paths", () => {
    expect(cleanFolder("/英文/vocab/")).toBe("英文/vocab");
    expect(cleanFolder("a\\b//./c")).toBe("a/b/c");
    expect(cleanFolder("../x")).toBe("x");
    expect(cleanFolder(42)).toBeNull();
  });

  it("derives the export folders, following a renamed 冷知識.md", async () => {
    const { vault, files } = setup({ settings: () => ({ folder: "英文" }) });
    expect(files.exportFolders()).toEqual({ words: "英文/單字", threads: "英文/討論串", triviaFile: "英文/冷知識.md" });
    await files.ensure("trivia");
    vault.move("英文/冷知識.md", "我的冷知識.md");
    expect(files.exportFolders().triviaFile).toBe("我的冷知識.md");
  });
});

describe("EntryFilesService.ensure", () => {
  it("creates a missing entry file, waiting for the vault first", async () => {
    const { vault, seeds, files } = setup();
    expect(await files.ensure("flashcards")).toBe(FLASHCARDS);
    expect(vault.readyCalls).toBe(1);
    expect(vault.files.get(FLASHCARDS)).toBe(renderEntryFile("flashcards"));
    expect(seeds.ids.has("flashcards")).toBe(true);
  });

  it("never overwrites an existing file, with or without our id", async () => {
    const { vault, files } = setup();
    const mine = "# 單字卡\n\n我自己的筆記\n";
    vault.files.set(FLASHCARDS, mine);
    expect(await files.ensure("flashcards")).toBe(FLASHCARDS);
    expect(vault.files.get(FLASHCARDS)).toBe(mine);
    expect(vault.log).toEqual([]);
  });

  it("finds a renamed or moved entry file by its id", async () => {
    const { vault, files } = setup();
    await files.ensure("families");
    const moved = "notes/我的字族.md";
    vault.move("vocab-list/字族樹.md", moved);
    vault.files.set(moved, vault.files.get(moved) + "\n手寫的內容\n");
    const before = vault.files.get(moved);
    vault.log = [];
    expect(await files.ensure("families")).toBe(moved);
    expect(files.entryFilePath("families")).toBe(moved);
    expect(vault.files.has("vocab-list/字族樹.md")).toBe(false);
    expect(vault.files.get(moved)).toBe(before);
    expect(vault.log).toEqual([]);
  });

  it("creates once when called twice at the same time", async () => {
    const { vault, files } = setup();
    const [a, b] = await Promise.all([files.ensure("verbs"), files.ensure("verbs")]);
    expect(a).toBe(b);
    expect(vault.log).toEqual(["create vocab-list/動詞用法.md"]);
  });

  it("uses a file that appeared while it was creating one (sync)", async () => {
    const { vault, files } = setup();
    const synced = "---\nvocab-tracker: entry\nvocab-tracker-id: verbs\n---\nfrom the other device\n";
    vault.beforeCreate = (path) => vault.files.set(path, synced);
    expect(await files.ensure("verbs")).toBe("vocab-list/動詞用法.md");
    expect(vault.files.get("vocab-list/動詞用法.md")).toBe(synced);
  });

  it("rethrows a create failure when nothing is there", async () => {
    const { vault, files } = setup();
    vault.create = async () => {
      throw new Error("disk full");
    };
    await expect(files.ensure("verbs")).rejects.toThrow("disk full");
  });

  it("moves an older file into a custom folder instead of making a second one", async () => {
    const { vault, files } = setup({ settings: () => ({ folder: "英文/vocab" }) });
    const legacy = "# 單字卡\n\n```vocab-flashcards\n```\n";
    vault.files.set(FLASHCARDS, legacy);
    expect(await files.ensure("flashcards")).toBe("英文/vocab/單字卡.md");
    expect(vault.files.get("英文/vocab/單字卡.md")).toBe(legacy);
    expect(vault.files.has(FLASHCARDS)).toBe(false);
  });

  it("asks for the saved trivia list to be filled in after creating 冷知識.md", async () => {
    const log: string[] = [];
    const { files, vault } = setup({ export: fakeExport(log) });
    await files.ensure("trivia");
    expect(log).toEqual(["export.trivia"]);
    expect(vault.files.has(TRIVIA)).toBe(true);
  });
});

describe("EntryFilesService.ensureAll", () => {
  it("creates every missing entry file the first time", async () => {
    const { vault, files } = setup();
    const created = await files.ensureAll();
    expect(created).toEqual([
      "vocab-list/單字卡.md",
      "vocab-list/字族樹.md",
      "vocab-list/動詞用法.md",
      "vocab-list/冷知識.md",
      "vocab-list/Word DNA.md",
    ]);
    expect([...vault.files.keys()].sort()).toEqual([...created].sort());
  });

  it("doesn't bring back a file the user deleted, but ensure() still makes it on demand", async () => {
    const { vault, files } = setup();
    await files.ensureAll();
    vault.files.delete(FLASHCARDS);
    vault.log = [];
    expect(await files.ensureAll()).toEqual([]);
    expect(vault.files.has(FLASHCARDS)).toBe(false);
    expect(await files.ensure("flashcards")).toBe(FLASHCARDS);
    expect(vault.files.has(FLASHCARDS)).toBe(true);
  });

  it("adopts existing files without touching them", async () => {
    const { vault, seeds, files } = setup();
    vault.files.set(FLASHCARDS, "mine");
    await files.ensureAll();
    expect(vault.files.get(FLASHCARDS)).toBe("mine");
    expect(seeds.ids.has("flashcards")).toBe(true);
    expect(vault.log).not.toContain(`create ${FLASHCARDS}`);
  });

  it("keeps going when one file fails", async () => {
    const { vault, files } = setup();
    const create = vault.create.bind(vault);
    vault.create = async (path, content) => {
      if (path === FLASHCARDS) throw new Error("nope");
      return create(path, content);
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await files.ensureAll()).toHaveLength(4);
    err.mockRestore();
  });
});

describe("renames and deletes (§4.6)", () => {
  const ARTICLE = "eng/Speech.md";

  function withLog() {
    const log: string[] = [];
    const paragraphs = {
      renameParagraphPath: vi.fn(async (a: string, b: string) => {
        log.push(`threads.rename ${a} → ${b}`);
        return 1;
      }),
    };
    const exp = fakeExport(log);
    const { vault, files } = setup({ paragraphs, export: exp });
    return { log, vault, files, paragraphs, exp };
  }

  it("moves an article's anchors first, then its .ai.md", async () => {
    const { log, files } = withLog();
    await files.handleRename(ARTICLE, "eng/Speech 2.md");
    expect(log).toEqual(["threads.rename eng/Speech.md → eng/Speech 2.md", "export.rename eng/Speech.md → eng/Speech 2.md"]);
  });

  it("moves anchors under a renamed folder; each note's .ai.md follows its own event", async () => {
    const { log, files } = withLog();
    await files.handleRename("eng", "english", true);
    expect(log).toEqual(["threads.rename eng → english"]);
  });

  it("ignores the plugin's own notes and non-Markdown files", async () => {
    const { log, files } = withLog();
    await files.handleRename("vocab-list/單字/glittery.md", "vocab-list/單字/閃亮.md");
    await files.handleRename("vocab-list/討論串/Speech.ai.md", "Speech.ai.md");
    await files.handleRename("eng/a.png", "eng/b.png");
    await files.handleRename(ARTICLE, ARTICLE);
    expect(log).toEqual([]);
  });

  it("uses the caller's article test when given", async () => {
    const log: string[] = [];
    const { files } = setup({ export: fakeExport(log), isArticle: (p) => p.startsWith("eng/") });
    await files.handleRename("other/x.md", "other/y.md");
    await files.handleRename("eng/x.md", "eng/y.md");
    expect(log).toEqual(["export.rename eng/x.md → eng/y.md"]);
  });

  it("keeps the discussions of a deleted article and re-renders its .ai.md as orphaned", () => {
    const { log, vault, files, paragraphs } = withLog();
    vault.files.set("vocab-list/討論串/Speech.ai.md", "keep me");
    files.handleDelete(ARTICLE);
    files.handleDelete("eng", true);
    files.handleDelete("vocab-list/單字/glittery.md");
    expect(log).toEqual(["export.changed eng/Speech.md never"]);
    expect(paragraphs.renameParagraphPath).not.toHaveBeenCalled();
    expect(vault.files.get("vocab-list/討論串/Speech.ai.md")).toBe("keep me");
  });
});

describe("word pages", () => {
  it("opens through ExportService once the vault is ready", async () => {
    const log: string[] = [];
    const exp = fakeExport(log);
    const { vault, files } = setup({ export: exp });
    expect(await files.openWordPage("42")).toBe("vocab-list/單字/42.md");
    expect(vault.readyCalls).toBe(1);
    expect(exp.openWordPage).toHaveBeenCalledWith("42");
  });

  it("returns null without an exporter", async () => {
    const { files } = setup();
    expect(await files.openWordPage("42")).toBeNull();
  });

  // M6 acceptance: a page the user renamed is found by its id, and the
  // export never changes what's outside its markers.
  it("keeps updating a word page the user renamed, leaving their notes alone", async () => {
    const vault = new MemoryVault();
    const entry: VocabEntry = {
      id: "1721900000000",
      word: "glittery",
      level: "",
      synonyms: "",
      antonyms: "",
      example: "",
      definition: "",
      definitionZh: "",
      phonetic: "",
      partOfSpeech: "adjective",
      grammar: "",
      source: null,
      added: "",
      lastReviewed: "",
      reviews: 0,
    };
    const state: { thread?: Thread } = {};
    const data: ExportDataPort = {
      entry: (id) => (id === entry.id ? entry : undefined),
      entries: () => [entry],
      wordThread: () => state.thread,
      paragraphThreads: async () => [],
      families: () => [],
      usages: () => ({}),
      trivia: () => [],
    };
    // Wired as in main.ts: ExportService's folders come from the files
    // service, which hands word pages to ExportService.
    const exp: ExportService = new ExportService({ vault, data, folders: () => files.exportFolders(), debounceMs: 0 });
    const files = new EntryFilesService({ vault, settings: () => ({ folder: "英文" }), export: exp });

    const page = await files.openWordPage(entry.id);
    expect(page).toBe("英文/單字/glittery.md");

    const renamed = "我的單字/閃亮亮.md";
    vault.move("英文/單字/glittery.md", renamed);
    const userNotes = "\n## 我的筆記\n\n想到 Eras Tour 的舞台服裝。\n";
    vault.files.set(renamed, vault.files.get(renamed) + userNotes);
    const before = vault.files.get(renamed) as string;

    state.thread = {
      id: `word:${entry.id}`,
      anchor: { kind: "word", entryId: entry.id },
      createdAt: "2026-10-02T03:00:00.000Z",
      turns: [
        { id: "q", role: "user", content: "比較 glittery 和 sparkly", at: "2026-10-02T03:00:00.000Z", status: "done" },
        { id: "a", role: "assistant", content: "glittery 偏亮片感。", at: "2026-10-02T03:00:05.000Z", status: "done" },
      ],
    };
    exp.wordChanged(entry.id, "ifContent");
    await exp.flush();

    expect(vault.files.has("英文/單字/glittery.md")).toBe(false);
    const after = vault.files.get(renamed) as string;
    expect(after).toContain("glittery 偏亮片感。");
    expect(after.endsWith(userNotes)).toBe(true);
    // Everything before the discussion section is unchanged too.
    const cut = before.indexOf("%% vt:begin discussion %%");
    expect(after.slice(0, cut)).toBe(before.slice(0, cut));
    exp.dispose();
  });
});
