import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TypedEmitter } from "../../../src/core/events";
import { getLocale, setLocale, type Locale } from "../../../src/core/i18n";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Family } from "../../../src/core/model/family";
import type { Thread } from "../../../src/core/model/thread";
import type { TriviaItem } from "../../../src/core/model/trivia";
import type { PosKey } from "../../../src/core/model/usage";
import type { LearnEvents } from "../../../src/services/learn/LearnStore";
import type { VerbUsageEvents } from "../../../src/services/learn/VerbUsageService";
import { ExportService, shortDate } from "../../../src/services/export/ExportService";
import { findManagedBlock } from "../../../src/services/export/managedBlock";
import type { VaultPort } from "../../../src/core/ports";
import type { ExportDataPort, ParagraphThread } from "../../../src/services/export/ports";
import type { ExportFamily, ExportTrivia, ExportUsage, ExportVerbFavorite } from "../../../src/services/export/types";
import { ARTICLE, entry, FAMILIES, GLITTERY, GLITTERY_THREAD, LEOTARD, TRIVIA, turn, USAGE, wordThread } from "./fixtures";

// The expectations below are written against the Chinese labels.
let previousLocale: Locale;
beforeAll(() => {
  previousLocale = getLocale();
  setLocale("zh-TW");
});
afterAll(() => setLocale(previousLocale));

const WORDS = "vocab-list/單字";
const GLITTERY_PAGE = `${WORDS}/glittery.md`;
const LEOTARD_PAGE = `${WORDS}/leotard.md`;
const AI_NOTE = "vocab-list/討論串/Taylor_Swift_NYU_Speech_Transcript.ai.md";
const TRIVIA_FILE = "vocab-list/冷知識.md";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

// In-memory vault. `gate` lets a test hold writes open to check that two
// writes to one file never overlap.
class FakeVault implements VaultPort {
  files = new Map<string, string>();
  log: string[] = [];
  active = new Map<string, number>();
  maxActive = 0;
  gate: (() => Promise<void>) | null = null;
  failNextProcess = false;

  exists(path: string): boolean {
    return this.files.has(path);
  }

  async create(path: string, content: string): Promise<void> {
    await this.enter(path);
    try {
      if (this.files.has(path)) throw new Error("File already exists");
      this.log.push(`create ${path}`);
      this.files.set(path, content);
    } finally {
      this.leave(path);
    }
  }

  async process(path: string, fn: (text: string) => string): Promise<void> {
    await this.enter(path);
    try {
      if (this.failNextProcess) {
        this.failNextProcess = false;
        throw new Error("disk full");
      }
      const text = this.files.get(path);
      if (text === undefined) throw new Error("missing");
      this.log.push(`process ${path}`);
      this.files.set(path, fn(text));
    } finally {
      this.leave(path);
    }
  }

  async rename(from: string, to: string): Promise<void> {
    const text = this.files.get(from);
    if (text === undefined) throw new Error("missing");
    this.log.push(`rename ${from} → ${to}`);
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

  private async enter(path: string): Promise<void> {
    const n = (this.active.get(path) ?? 0) + 1;
    this.active.set(path, n);
    this.maxActive = Math.max(this.maxActive, n);
    if (this.gate) await this.gate();
  }

  private leave(path: string): void {
    this.active.set(path, (this.active.get(path) ?? 1) - 1);
  }
}

class FakeData implements ExportDataPort {
  entriesList: VocabEntry[] = [GLITTERY, LEOTARD];
  threads: Thread[] = [];
  paragraphs = new Map<string, ParagraphThread[]>();
  familiesList: ExportFamily[] = [];
  usageMap = new Map<string, ExportUsage>();
  triviaList: ExportTrivia[] = [];
  verbFavoriteList: ExportVerbFavorite[] = [];
  readyCalls = 0;

  async ready(): Promise<void> {
    this.readyCalls++;
  }
  entry(id: string): VocabEntry | undefined {
    return this.entriesList.find((e) => e.id === id && !e.deletedAt);
  }
  entries(): readonly VocabEntry[] {
    return this.entriesList.filter((e) => !e.deletedAt);
  }
  wordThread(entryId: string): Thread | undefined {
    return this.threads.find((t) => t.id === `word:${entryId}`);
  }
  async paragraphThreads(path: string): Promise<ParagraphThread[]> {
    return this.paragraphs.get(path) ?? [];
  }
  families(): readonly ExportFamily[] {
    return this.familiesList;
  }
  // 1006-2 #19 #21: usage is per pos now; this fake still only ever keeps
  // one block per entry, stored under "v" (matching the old verb-only
  // behaviour every call site here exercises).
  usages(entryId: string): Partial<Record<PosKey, ExportUsage>> {
    const u = this.usageMap.get(entryId);
    return u ? { v: u } : {};
  }
  trivia(): readonly ExportTrivia[] {
    return this.triviaList;
  }
  verbFavorites(): readonly ExportVerbFavorite[] {
    return this.verbFavoriteList;
  }
}

function paragraph(blockId: string, snapshot: string, index: number | null, turns = [turn("user", "?"), turn("assistant", "答案")], path = ARTICLE): ParagraphThread {
  return { index, thread: { id: `p:${blockId}`, anchor: { kind: "paragraph", path, blockId, hash: "h", snapshot }, turns } };
}

const THREADS = "vocab-list/討論串";

// An existing .ai.md. `id: null` writes the older format without
// vocab-tracker-id (only the source link says whose it is).
function aiNoteFile(article: string, body: string, id: string | null = article, source = article.replace(/\.md$/, "")): string {
  const fm = ["---", "vocab-tracker: ai-note", ...(id === null ? [] : [`vocab-tracker-id: ${JSON.stringify(id)}`]), `source: "[[${source}]]"`, "---"];
  return `${fm.join("\n")}\n${body}`;
}

let vault: FakeVault;
let data: FakeData;
let svc: ExportService;

function make(extra: Partial<ConstructorParameters<typeof ExportService>[0]> = {}): ExportService {
  return new ExportService({ vault, data, formatDate: (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`, ...extra });
}

beforeEach(() => {
  vi.useFakeTimers();
  vault = new FakeVault();
  data = new FakeData();
  svc = make();
});

afterEach(() => {
  svc.dispose();
  vi.useRealTimers();
});

describe("debounce", () => {
  it("waits 1 s after the last change, then writes once", async () => {
    data.threads = [GLITTERY_THREAD];
    svc.wordChanged(GLITTERY.id, "ifContent");
    await vi.advanceTimersByTimeAsync(600);
    svc.wordChanged(GLITTERY.id, "ifContent");
    await vi.advanceTimersByTimeAsync(600);
    svc.wordChanged(GLITTERY.id, "ifContent");
    await vi.advanceTimersByTimeAsync(999);
    expect(vault.log).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(vault.log).toEqual([`create ${GLITTERY_PAGE}`]);
  });

  it("debounces each target separately", async () => {
    data.threads = [GLITTERY_THREAD, wordThread(LEOTARD.id, [turn("user", "q"), turn("assistant", "a")])];
    svc.wordChanged(GLITTERY.id, "ifContent");
    await vi.advanceTimersByTimeAsync(500);
    svc.wordChanged(LEOTARD.id, "ifContent");
    await vi.advanceTimersByTimeAsync(500);
    expect(vault.log).toEqual([`create ${GLITTERY_PAGE}`]);
    await vi.advanceTimersByTimeAsync(500);
    expect(vault.log).toEqual([`create ${GLITTERY_PAGE}`, `create ${LEOTARD_PAGE}`]);
  });

  it("keeps the strongest create mode of the merged changes", async () => {
    data.threads = [GLITTERY_THREAD];
    svc.wordChanged(GLITTERY.id, "ifContent");
    svc.wordChanged(GLITTERY.id, "never");
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.exists(GLITTERY_PAGE)).toBe(true);
  });

  it("honours a custom debounce", async () => {
    svc.dispose();
    svc = make({ debounceMs: 50 });
    data.triviaList = TRIVIA;
    svc.triviaChanged();
    await vi.advanceTimersByTimeAsync(50);
    expect(vault.exists(TRIVIA_FILE)).toBe(true);
  });

  it("reads data when the write runs, not when the change was announced", async () => {
    vault.files.set(GLITTERY_PAGE, "---\nvocab-tracker: word\n---\n");
    svc.wordChanged(GLITTERY.id);
    data.usageMap.set(GLITTERY.id, USAGE);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(GLITTERY_PAGE)).toContain("glittery + 抽象名詞");
    expect(data.readyCalls).toBe(1);
  });
});

describe("serialized writes", () => {
  it("never runs two writes to the same file at once", async () => {
    vault.files.set(GLITTERY_PAGE, "notes\n");
    const gates: Deferred[] = [];
    vault.gate = () => {
      const d = deferred();
      gates.push(d);
      return d.promise;
    };

    svc.wordChanged(GLITTERY.id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(gates).toHaveLength(1); // first write in progress, held open

    svc.wordChanged(GLITTERY.id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(gates).toHaveLength(1); // second one waits in the queue

    gates[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(gates).toHaveLength(2);
    gates[1].resolve();
    await svc.flush();
    expect(vault.maxActive).toBe(1);
    expect(vault.log).toEqual([`process ${GLITTERY_PAGE}`, `process ${GLITTERY_PAGE}`]);
  });

  it("writes to different files don't wait for each other", async () => {
    vault.files.set(GLITTERY_PAGE, "a\n");
    vault.files.set(LEOTARD_PAGE, "b\n");
    const gates: Deferred[] = [];
    vault.gate = () => {
      const d = deferred();
      gates.push(d);
      return d.promise;
    };
    svc.wordChanged(GLITTERY.id);
    svc.wordChanged(LEOTARD.id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(gates).toHaveLength(2);
    gates.forEach((g) => g.resolve());
    await svc.flush();
  });

  it("a failed write doesn't block the next one", async () => {
    vault.files.set(GLITTERY_PAGE, "notes\n");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vault.failNextProcess = true;
    svc.wordChanged(GLITTERY.id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(error).toHaveBeenCalledTimes(1);
    svc.wordChanged(GLITTERY.id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.log).toEqual([`process ${GLITTERY_PAGE}`]);
    error.mockRestore();
  });

  it("falls back to updating when the file appears between the check and the create", async () => {
    data.threads = [GLITTERY_THREAD];
    vault.gate = async () => {
      // Another device's copy synced in just before our create.
      if (!vault.files.has(GLITTERY_PAGE)) vault.files.set(GLITTERY_PAGE, "synced copy\n");
    };
    svc.wordChanged(GLITTERY.id, "ifContent");
    await vi.advanceTimersByTimeAsync(1000);
    const text = vault.files.get(GLITTERY_PAGE)!;
    expect(text.startsWith("synced copy\n")).toBe(true);
    expect(findManagedBlock(text, "discussion")).not.toBeNull();
  });
});

describe("word pages", () => {
  it("creates a page only once there's a discussion or saved trivia", async () => {
    svc.wordChanged(GLITTERY.id, "ifContent");
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.size).toBe(0);

    data.triviaList = TRIVIA;
    svc.wordChanged(GLITTERY.id, "ifContent");
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.exists(GLITTERY_PAGE)).toBe(true);
  });

  it("family or usage changes alone never create a page", async () => {
    data.familiesList = FAMILIES;
    data.threads = [GLITTERY_THREAD];
    svc.familyChanged(FAMILIES[0]);
    svc.usageChanged(GLITTERY.id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.size).toBe(0);
  });

  it("the 「單字頁」 button creates an empty page right away", async () => {
    const path = await svc.openWordPage(GLITTERY.id);
    expect(path).toBe(GLITTERY_PAGE);
    expect(vault.files.get(GLITTERY_PAGE)).toContain("*還沒有討論。*");
    expect(await svc.openWordPage("nope")).toBeNull();
  });

  it("openWordPage replaces a pending debounced write instead of writing twice", async () => {
    svc.wordChanged(GLITTERY.id);
    await svc.openWordPage(GLITTERY.id);
    await vi.advanceTimersByTimeAsync(2000);
    expect(vault.log).toEqual([`create ${GLITTERY_PAGE}`]);
  });

  it("updates only the managed blocks and keeps the user's notes", async () => {
    await svc.openWordPage(GLITTERY.id);
    const created = vault.files.get(GLITTERY_PAGE)!;
    const withNotes = created.replace("\n---\n", "\naliases: [Glittery]\n---\n") + "\n## 我的筆記\n\n想到 Eras Tour 的舞台服裝。\n";
    vault.files.set(GLITTERY_PAGE, withNotes);

    data.threads = [GLITTERY_THREAD];
    data.familiesList = FAMILIES;
    svc.wordChanged(GLITTERY.id);
    await vi.advanceTimersByTimeAsync(1000);

    const text = vault.files.get(GLITTERY_PAGE)!;
    expect(text).toContain("aliases: [Glittery]");
    expect(text.endsWith("\n## 我的筆記\n\n想到 Eras Tour 的舞台服裝。\n")).toBe(true);
    expect(text).toContain("glittery 和 sparkly 差在哪？");
    expect(text).toContain("### clothing · 服裝");
  });

  it("appends a section whose markers the user deleted, at the end", async () => {
    await svc.openWordPage(GLITTERY.id);
    const created = vault.files.get(GLITTERY_PAGE)!;
    const r = findManagedBlock(created, "usage")!;
    // Delete the whole usage block, markers included.
    const begin = created.lastIndexOf("%% vt:begin usage %%", r.contentStart);
    const end = created.indexOf("\n", r.contentEnd) + 1;
    const edited = created.slice(0, begin) + created.slice(end) + "my notes";
    vault.files.set(GLITTERY_PAGE, edited);

    data.usageMap.set(GLITTERY.id, USAGE);
    svc.usageChanged(GLITTERY.id);
    await vi.advanceTimersByTimeAsync(1000);
    const text = vault.files.get(GLITTERY_PAGE)!;
    expect(text.startsWith(edited)).toBe(true);
    expect(text.slice(edited.length)).toContain("glittery + 服裝 / 妝容");
  });

  it("follows a page the user renamed or moved, by its frontmatter id", async () => {
    await svc.openWordPage(GLITTERY.id);
    const moved = "My words/閃亮.md";
    vault.files.set(moved, vault.files.get(GLITTERY_PAGE)!);
    vault.files.delete(GLITTERY_PAGE);

    data.threads = [GLITTERY_THREAD];
    svc.wordChanged(GLITTERY.id, "ifContent");
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.exists(GLITTERY_PAGE)).toBe(false);
    expect(vault.files.get(moved)).toContain("glittery 和 sparkly 差在哪？");
  });

  it("words that differ only in case share one lowercase file", async () => {
    data.entriesList = [entry("cap", "Glittery")];
    expect(await svc.openWordPage("cap")).toBe(GLITTERY_PAGE);
  });

  it("skips deleted entries", async () => {
    data.entriesList = [{ ...GLITTERY, deletedAt: "2026-10-04T00:00:00.000Z" }];
    data.threads = [GLITTERY_THREAD];
    svc.wordChanged(GLITTERY.id, "ifContent");
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.size).toBe(0);
  });

  it("uses the configured folders", async () => {
    svc.dispose();
    svc = make({ folders: () => ({ words: "Vocab/Words", threads: "Vocab/Threads", triviaFile: "Vocab/Trivia.md" }) });
    expect(await svc.openWordPage(GLITTERY.id)).toBe("Vocab/Words/glittery.md");
    expect(svc.aiNoteNames("a/b/Speech.md")[0]).toBe("Vocab/Threads/Speech.ai.md");
  });

  it("links to other words' pages that exist", async () => {
    await svc.openWordPage(LEOTARD.id);
    data.familiesList = FAMILIES;
    await svc.openWordPage(GLITTERY.id);
    expect(vault.files.get(GLITTERY_PAGE)).toContain("[[vocab-list/單字/leotard|leotard]] 緊身衣");
    // sequin / tulle have no page: plain text.
    expect(vault.files.get(GLITTERY_PAGE)).toContain("· sequin 亮片 ·");
  });
});

describe("AI notes", () => {
  it("creates the note with paragraphs in order and the words learned", async () => {
    data.paragraphs.set(ARTICLE, [paragraph("vt-bbbbbb", "Second paragraph.", 5), paragraph("vt-aaaaaa", "First paragraph.", 1)]);
    data.threads = [GLITTERY_THREAD];
    await svc.openWordPage(GLITTERY.id);
    svc.articleChanged(ARTICLE);
    await vi.advanceTimersByTimeAsync(1000);

    const text = vault.files.get(AI_NOTE)!;
    expect(text).toContain('source: "[[eng/Taylor_Swift_NYU_Speech_Transcript]]"');
    expect(text.indexOf("¶2 First")).toBeLessThan(text.indexOf("¶6 Second"));
    expect(text).toContain("- [[vocab-list/單字/glittery|glittery]] · 2 則討論");
    expect(text).toContain("- leotard\n");
  });

  it("doesn't create a note without exported rounds", async () => {
    data.paragraphs.set(ARTICLE, [paragraph("vt-x", "p", 0, [turn("user", "?"), turn("assistant", "", { status: "streaming" })])]);
    svc.articleChanged(ARTICLE);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.size).toBe(0);
  });

  it("a word thread change refreshes the note's word list, but never creates the note", async () => {
    data.threads = [GLITTERY_THREAD];
    svc.threadChanged(GLITTERY_THREAD);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.exists(AI_NOTE)).toBe(false);

    vault.files.set(AI_NOTE, "my header\n");
    svc.threadChanged(GLITTERY_THREAD);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(AI_NOTE)).toContain("glittery|glittery]] · 2 則討論");
    // Claimed: a minimal frontmatter goes on top, the rest is kept.
    expect(vault.files.get(AI_NOTE)!.startsWith(`---\nvocab-tracker: ai-note\nvocab-tracker-id: "${ARTICLE}"\n---\nmy header\n`)).toBe(true);
  });

  it("moves the .ai.md along when the article is renamed", async () => {
    data.paragraphs.set(ARTICLE, [paragraph("vt-aaaaaa", "First paragraph.", 0)]);
    svc.articleChanged(ARTICLE);
    await vi.advanceTimersByTimeAsync(1000);
    vault.files.set(AI_NOTE, vault.files.get(AI_NOTE)! + "\nmy notes\n");

    const renamed = "eng/Swift NYU.md";
    data.paragraphs.set(renamed, [paragraph("vt-aaaaaa", "First paragraph.", 0)]);
    await svc.renameArticle(ARTICLE, renamed);
    await vi.advanceTimersByTimeAsync(1000);

    const to = "vocab-list/討論串/Swift NYU.ai.md";
    expect(vault.exists(AI_NOTE)).toBe(false);
    const text = vault.files.get(to)!;
    expect(text).toContain("![[eng/Swift NYU#^vt-aaaaaa]]");
    expect(text.endsWith("\nmy notes\n")).toBe(true);
    expect(text).toContain('vocab-tracker-id: "eng/Swift NYU.md"\nsource: "[[eng/Swift NYU]]"\n');
    expect(vault.findManaged("ai-note", renamed)).toBe(to);
  });

  it("rename never overwrites a note already at the new name", async () => {
    const theirs = aiNoteFile("other/New.md", "someone else's\n");
    vault.files.set(AI_NOTE, aiNoteFile(ARTICLE, "old\n"));
    vault.files.set(`${THREADS}/New.ai.md`, theirs);
    await svc.renameArticle(ARTICLE, "New.md");
    expect(vault.files.get(`${THREADS}/New.ai.md`)).toBe(theirs);
    // At the vault root there's no folder to tell them apart: a number.
    expect(vault.exists(AI_NOTE)).toBe(false);
    expect(vault.files.get(`${THREADS}/New 2.ai.md`)).toBe(aiNoteFile("New.md", "old\n"));
  });

  it("rename drops a pending export for the old path", async () => {
    data.paragraphs.set(ARTICLE, [paragraph("vt-aaaaaa", "p", 0)]);
    svc.articleChanged(ARTICLE);
    await svc.renameArticle(ARTICLE, "eng/New.md");
    await vi.advanceTimersByTimeAsync(2000);
    expect(vault.exists(AI_NOTE)).toBe(false);
  });
});

describe("AI notes: articles with the same name", () => {
  const A = "a/Notes.md";
  const B = "b/Notes.md";
  const NOTES = `${THREADS}/Notes.ai.md`;
  const NOTES_B = `${THREADS}/Notes (b).ai.md`;

  function discuss(path: string, snapshot: string): void {
    data.paragraphs.set(path, [paragraph(`vt-${path.length}`, snapshot, 0, undefined, path)]);
  }

  it("gives each article its own note; neither overwrites the other", async () => {
    discuss(A, "Paragraph from a.");
    svc.articleChanged(A);
    await vi.advanceTimersByTimeAsync(1000);
    discuss(B, "Paragraph from b.");
    svc.articleChanged(B);
    await vi.advanceTimersByTimeAsync(1000);

    expect([...vault.files.keys()]).toEqual([NOTES, NOTES_B]);
    const a = vault.files.get(NOTES)!;
    const b = vault.files.get(NOTES_B)!;
    expect(a).toContain('vocab-tracker-id: "a/Notes.md"\nsource: "[[a/Notes]]"');
    expect(a).toContain("Paragraph from a.");
    expect(a).not.toContain("Paragraph from b.");
    expect(b).toContain('vocab-tracker-id: "b/Notes.md"\nsource: "[[b/Notes]]"');
    expect(b).toContain("Paragraph from b.");

    // Later writes keep going to each article's own note.
    discuss(A, "Edited a.");
    discuss(B, "Edited b.");
    svc.articleChanged(B);
    svc.articleChanged(A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.size).toBe(2);
    expect(vault.files.get(NOTES)).toContain("Edited a.");
    expect(vault.files.get(NOTES)).not.toContain("Edited b.");
    expect(vault.files.get(NOTES_B)).toContain("Edited b.");
    expect(vault.files.get(NOTES_B)).not.toContain("Edited a.");
  });

  it("numbers further clashes, and a fresh service finds each note again by its id", async () => {
    const C = "x/b/Notes.md"; // same folder name as B
    const ROOT = "Notes.md";
    for (const p of [A, B, C, ROOT]) discuss(p, `Paragraph from ${p}.`);
    for (const p of [A, B, C, ROOT]) svc.articleChanged(p);
    await vi.advanceTimersByTimeAsync(1000);
    // Root-level Notes.md has no folder name to add: a number instead.
    expect([...vault.files.keys()].sort()).toEqual([NOTES, NOTES_B, `${THREADS}/Notes (b) 2.ai.md`, `${THREADS}/Notes 2.ai.md`].sort());
    for (const path of vault.files.keys()) {
      const id = /vocab-tracker-id: "(.*)"/.exec(vault.files.get(path)!)![1];
      expect(vault.files.get(path)).toContain(`Paragraph from ${id}.`);
    }

    // Restarted: nothing remembered, the ids lead the way.
    svc.dispose();
    svc = make();
    discuss(C, "Edited c.");
    svc.articleChanged(C, "never");
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(vault.findManaged("ai-note", C)!)).toContain("Edited c.");
    expect(vault.files.size).toBe(4);
  });

  it("an older note without an id belongs to the article its source links to", async () => {
    const blocks = "%% vt:begin paragraphs %%\nold\n%% vt:end paragraphs %%\n%% vt:begin words %%\n%% vt:end words %%\n";
    const legacy = aiNoteFile(A, `${blocks}\nmy notes on a\n`, null);
    vault.files.set(NOTES, legacy);

    discuss(B, "Paragraph from b.");
    svc.articleChanged(B);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(NOTES)).toBe(legacy);
    expect(vault.files.get(NOTES_B)).toContain("Paragraph from b.");

    discuss(A, "Paragraph from a.");
    svc.articleChanged(A, "never");
    await vi.advanceTimersByTimeAsync(1000);
    const a = vault.files.get(NOTES)!;
    expect(a).toContain("Paragraph from a.");
    expect(a.endsWith("\nmy notes on a\n")).toBe(true);
    // Claimed: the id is added right after the kind, the rest kept.
    expect(a.startsWith('---\nvocab-tracker: ai-note\nvocab-tracker-id: "a/Notes.md"\nsource: "[[a/Notes]]"\n---\n')).toBe(true);
    expect(vault.findManaged("ai-note", A)).toBe(NOTES);
  });

  it("an older note whose source is another article is left alone", async () => {
    const legacy = aiNoteFile(B, "b's\n", null);
    vault.files.set(NOTES, legacy);
    discuss(A, "Paragraph from a.");
    svc.articleChanged(A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(NOTES)).toBe(legacy);
    expect(vault.files.get(`${THREADS}/Notes (a).ai.md`)).toContain("Paragraph from a.");
  });

  it("a note that appears at the name just before the create isn't taken over", async () => {
    const theirs = aiNoteFile(B, "synced from another device\n");
    vault.gate = async () => {
      if (!vault.files.has(NOTES)) vault.files.set(NOTES, theirs);
    };
    discuss(A, "Paragraph from a.");
    svc.articleChanged(A);
    await vi.advanceTimersByTimeAsync(1000);
    vault.gate = null;
    expect(vault.files.get(NOTES)).toBe(theirs);
    expect(vault.files.get(`${THREADS}/Notes (a).ai.md`)).toContain("Paragraph from a.");
  });

  it("finds a note the user renamed or moved, by its id", async () => {
    vault.files.set("Study/a 的討論.md", aiNoteFile(A, "mine\n"));
    vault.files.set(NOTES, aiNoteFile(B, "b's\n"));
    discuss(A, "Paragraph from a.");
    svc.articleChanged(A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.size).toBe(2);
    expect(vault.files.get("Study/a 的討論.md")).toContain("Paragraph from a.");
    expect(await svc.aiNotePath(A)).toBe("Study/a 的討論.md");
  });

  it("renaming updates only the id and source lines; the note is found under the new path", async () => {
    discuss(A, "Paragraph from a.");
    svc.articleChanged(A);
    await vi.advanceTimersByTimeAsync(1000);
    const before = vault.files.get(NOTES)!.replace("\n---\n\n", "\naliases: [n]\n---\n\n") + "\nmy notes\n";
    vault.files.set(NOTES, before);
    vault.log = [];

    await svc.renameArticle(A, "c/Notes.md");
    // Same name: the file stays, its frontmatter follows the article.
    expect(vault.log).toEqual([`process ${NOTES}`]);
    expect(vault.files.get(NOTES)).toBe(before.replace('"a/Notes.md"', '"c/Notes.md"').replace("[[a/Notes]]", "[[c/Notes]]"));
    expect(vault.findManaged("ai-note", "c/Notes.md")).toBe(NOTES);
    expect(vault.findManaged("ai-note", A)).toBeNull();
  });

  it("renaming leaves a note the user moved where it is", async () => {
    const moved = "Study/mine.md";
    vault.files.set(moved, aiNoteFile(A, "mine\n"));
    await svc.renameArticle(A, "a/Renamed.md");
    expect([...vault.files.keys()]).toEqual([moved]);
    expect(vault.files.get(moved)).toBe(aiNoteFile("a/Renamed.md", "mine\n"));
  });

  it("renaming finds an older note whose source Obsidian already pointed at the new path", async () => {
    // Obsidian updates links on rename, possibly to the shortest form.
    vault.files.set(NOTES, aiNoteFile(A, "old\n", null, "Renamed"));
    await svc.renameArticle(A, "a/Renamed.md");
    expect(vault.exists(NOTES)).toBe(false);
    expect(vault.files.get(`${THREADS}/Renamed.ai.md`)).toBe(
      '---\nvocab-tracker: ai-note\nvocab-tracker-id: "a/Renamed.md"\nsource: "[[a/Renamed]]"\n---\nold\n'
    );
  });

  it("a rename within the debounce still creates the note, under the new path", async () => {
    discuss("a/New.md", "Paragraph.");
    svc.articleChanged(A); // "ifContent", pending
    await vi.advanceTimersByTimeAsync(500);
    await svc.renameArticle(A, "a/New.md");
    await vi.advanceTimersByTimeAsync(1000);
    expect([...vault.files.keys()]).toEqual([`${THREADS}/New.ai.md`]);
    expect(vault.files.get(`${THREADS}/New.ai.md`)).toContain('vocab-tracker-id: "a/New.md"');
  });

  it("a rename without a pending change only updates an existing note", async () => {
    discuss("a/New.md", "Paragraph.");
    await svc.renameArticle(A, "a/New.md");
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.size).toBe(0);
  });

  it("a note without frontmatter is claimed by the first writer, then left to it", async () => {
    vault.files.set(NOTES, "my own header\n");
    discuss(A, "Paragraph from a.");
    svc.articleChanged(A);
    await vi.advanceTimersByTimeAsync(1000);
    const a = vault.files.get(NOTES)!;
    expect(a.startsWith('---\nvocab-tracker: ai-note\nvocab-tracker-id: "a/Notes.md"\n---\nmy own header\n')).toBe(true);
    expect(a).toContain("Paragraph from a.");

    discuss(B, "Paragraph from b.");
    svc.articleChanged(B);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(NOTES)).toBe(a);
    expect(vault.files.get(NOTES_B)).toContain("Paragraph from b.");

    // Also after a restart, with nothing remembered.
    svc.dispose();
    svc = make();
    svc.articleChanged(B);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(NOTES)).toBe(a);
  });

  it("a byte order mark at the top is kept, and frontmatter after it is read", async () => {
    vault.files.set(NOTES, "\ufeffmy own header\n");
    discuss(A, "Paragraph from a.");
    svc.articleChanged(A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(NOTES)!.startsWith('\ufeff---\nvocab-tracker: ai-note\nvocab-tracker-id: "a/Notes.md"\n---\nmy own header\n')).toBe(true);

  });

  it("an older note saved with a byte order mark is still recognized as another article's", async () => {
    const theirs = `\ufeff${aiNoteFile(B, "b's\n", null)}`;
    vault.files.set(NOTES, theirs);
    discuss(A, "Paragraph from a.");
    svc.articleChanged(A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(NOTES)).toBe(theirs);
    expect(vault.files.get(`${THREADS}/Notes (a).ai.md`)).toContain("Paragraph from a.");
  });

  describe("while findManaged can't help (metadata cache not ready)", () => {
    beforeEach(() => {
      vi.spyOn(vault, "findManaged").mockReturnValue(null);
    });

    it("updates a note under a later name instead of creating a duplicate", async () => {
      // b/Notes's note was deleted, a's sits under its second name.
      const later = `${THREADS}/Notes (a).ai.md`;
      vault.files.set(later, aiNoteFile(A, "mine\n"));
      discuss(A, "Paragraph from a.");
      svc.articleChanged(A);
      await vi.advanceTimersByTimeAsync(1000);
      expect([...vault.files.keys()]).toEqual([later]);
      expect(vault.files.get(later)).toContain("Paragraph from a.");
    });

    it("finds it past a gap, also when it may only be updated", async () => {
      const later = `${THREADS}/Notes (a) 2.ai.md`;
      vault.files.set(NOTES, aiNoteFile(B, "b's\n"));
      vault.files.set(later, aiNoteFile(A, "mine\n"));
      discuss(A, "Paragraph from a.");
      svc.articleChanged(A, "never");
      await vi.advanceTimersByTimeAsync(1000);
      expect(vault.files.get(later)).toContain("Paragraph from a.");
      expect(vault.files.get(NOTES)).toBe(aiNoteFile(B, "b's\n"));
      expect(vault.files.size).toBe(2);
      expect(await svc.aiNotePath(A)).toBe(later);
    });
  });

  it("aiNotePath gives only an existing note of this article, else null", async () => {
    expect(await svc.aiNotePath(A)).toBeNull();
    // Another article's note under a's first name isn't a's.
    vault.files.set(NOTES, aiNoteFile(B, "b's\n"));
    expect(await svc.aiNotePath(A)).toBeNull();
    expect(vault.files.get(NOTES)).toBe(aiNoteFile(B, "b's\n"));
    expect(await svc.aiNotePath(B)).toBe(NOTES);
    // An older note found by its name: returned, and given its id.
    vault.files.set(`${THREADS}/Notes (a).ai.md`, aiNoteFile(A, "old\n", null));
    expect(await svc.aiNotePath(A)).toBe(`${THREADS}/Notes (a).ai.md`);
    expect(vault.findManaged("ai-note", A)).toBe(`${THREADS}/Notes (a).ai.md`);
    // Never creates one.
    discuss("c/Other.md", "Paragraph.");
    expect(await svc.aiNotePath("c/Other.md")).toBeNull();
    expect(vault.files.size).toBe(2);
  });

  it("long names are shortened, never the suffix that tells them apart", () => {
    const long = "字".repeat(100);
    const names = svc.aiNoteNames(`${"夾".repeat(40)}/${long}.md`);
    const files = names.map((n) => n.slice(THREADS.length + 1));
    expect(new Set(files).size).toBe(names.length);
    for (const f of files) expect(new TextEncoder().encode(f).length).toBeLessThanOrEqual(200);
    expect(files[1].endsWith(` (${"夾".repeat(20)}).ai.md`)).toBe(true);
    expect(files[2].endsWith(` (${"夾".repeat(20)}) 2.ai.md`)).toBe(true);
  });
});

describe("trivia favourites", () => {
  it("creates 冷知識.md once something is saved and keeps the code block on update", async () => {
    svc.triviaChanged();
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.size).toBe(0);

    vault.files.set(TRIVIA_FILE, "# 冷知識\n\n```vocab-trivia\n```\n");
    data.triviaList = TRIVIA;
    svc.triviaItemChanged(TRIVIA[0]);
    await vi.advanceTimersByTimeAsync(1000);
    const text = vault.files.get(TRIVIA_FILE)!;
    expect(text.startsWith("# 冷知識\n\n```vocab-trivia\n```\n")).toBe(true);
    expect(text).toContain("### gl- 開頭的字常跟「光」有關");
    // Saving trivia about glittery creates its page too.
    expect(vault.exists(GLITTERY_PAGE)).toBe(true);
  });

  it("refreshes the pages of words a saved item mentions", async () => {
    vault.files.set(LEOTARD_PAGE, "notes\n");
    data.triviaList = TRIVIA;
    svc.triviaItemChanged(TRIVIA[0]); // about glittery, mentions leotard
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(LEOTARD_PAGE)).toContain("gl- 開頭的字常跟「光」有關（[[vocab-list/單字/glittery|glittery]]）");
  });
});

describe("events, flush and dispose", () => {
  it("follows ThreadService's thread:upsert", async () => {
    const events = new TypedEmitter<{ "thread:upsert": Thread }>();
    svc.watchThreads(events);
    data.threads = [GLITTERY_THREAD];
    events.emit("thread:upsert", GLITTERY_THREAD);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.exists(GLITTERY_PAGE)).toBe(true);
  });

  it("follows LearnStore's families / saved trivia and VerbUsageService's usage", () => {
    const learn = new TypedEmitter<LearnEvents>();
    const verbs = new TypedEmitter<VerbUsageEvents>();
    svc.watchLearn(learn);
    svc.watchUsage(verbs);
    const family = vi.spyOn(svc, "familyChanged");
    const trivia = vi.spyOn(svc, "triviaItemChanged");
    const usage = vi.spyOn(svc, "usageChanged");
    const f = { ...FAMILIES[0], source: "ai" } as Family;
    const item = TRIVIA[0] as TriviaItem;
    learn.emit("family:upsert", f);
    learn.emit("trivia:upsert", item);
    learn.emit("learn:reloaded", undefined);
    verbs.emit("verb:usage", { entryId: GLITTERY.id });
    verbs.emit("verb:busy", { entryId: GLITTERY.id, busy: true });
    expect(family).toHaveBeenCalledWith(f);
    expect(trivia).toHaveBeenCalledWith(item);
    expect(usage).toHaveBeenCalledWith(GLITTERY.id);
    expect(family).toHaveBeenCalledTimes(1);
    expect(trivia).toHaveBeenCalledTimes(1);
    expect(usage).toHaveBeenCalledTimes(1);

    svc.dispose();
    learn.emit("family:upsert", f);
    verbs.emit("verb:usage", { entryId: GLITTERY.id });
    expect(family).toHaveBeenCalledTimes(1);
    expect(usage).toHaveBeenCalledTimes(1);
  });

  it("a renewed family also updates the pages of members it dropped (1005 #14)", () => {
    const words = vi.spyOn(svc, "wordChanged");
    const f = FAMILIES[0];
    svc.familyChanged(f);
    expect(words.mock.calls.map((c) => c[0]).sort()).toEqual([GLITTERY.id, LEOTARD.id].sort());
    words.mockClear();
    // 重新分群 kept the id but leotard is no longer in it.
    svc.familyChanged({ ...f, groups: [{ label: "", members: [{ entryId: GLITTERY.id, word: "glittery", zh: "" }] }] });
    expect(words.mock.calls.map((c) => c[0]).sort()).toEqual([GLITTERY.id, LEOTARD.id].sort());
    words.mockClear();
    svc.familyChanged({ ...f, groups: [{ label: "", members: [{ entryId: GLITTERY.id, word: "glittery", zh: "" }] }] });
    expect(words.mock.calls.map((c) => c[0])).toEqual([GLITTERY.id]);
  });

  it("a saved verb usage (「寫入單字頁」) creates the word page; unsaving only updates it (1005 #4)", async () => {
    const learn = new TypedEmitter<LearnEvents>();
    svc.watchLearn(learn);
    data.usageMap.set(GLITTERY.id, { ...USAGE, generatedAt: "2026-10-02T03:00:00.000Z" });
    const fav = { id: `verb:${GLITTERY.id}`, entryId: GLITTERY.id, word: "glittery", createdAt: "2026-10-05T03:00:00.000Z" };
    data.verbFavoriteList = [fav];
    learn.emit("verbFavorite:upsert", fav);
    await vi.advanceTimersByTimeAsync(1000);
    const page = vault.files.get(GLITTERY_PAGE)!;
    expect(page).toContain("glittery + 服裝 / 妝容");
    expect(page).toContain("*已收藏 10/05 · AI 產生於 10/02*");

    const gone = { ...fav, deletedAt: "2026-10-06T03:00:00.000Z" };
    data.verbFavoriteList = [gone];
    learn.emit("verbFavorite:upsert", gone);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.files.get(GLITTERY_PAGE)).toContain("*AI 產生於 10/02*");
    expect(vault.files.get(GLITTERY_PAGE)).not.toContain("已收藏");

    // Unsaving never creates a page.
    vault.files.delete(GLITTERY_PAGE);
    learn.emit("verbFavorite:upsert", gone);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.exists(GLITTERY_PAGE)).toBe(false);
  });

  it("paragraph threads export the article's note; trivia sessions export nothing", async () => {
    data.paragraphs.set(ARTICLE, [paragraph("vt-aaaaaa", "p", 0)]);
    svc.threadChanged(data.paragraphs.get(ARTICLE)![0].thread);
    svc.threadChanged({ id: "trivia", anchor: { kind: "trivia-session" }, turns: [] });
    await vi.advanceTimersByTimeAsync(1000);
    expect([...vault.files.keys()]).toEqual([AI_NOTE]);
  });

  it("flush() writes pending exports right away", async () => {
    data.threads = [GLITTERY_THREAD];
    svc.wordChanged(GLITTERY.id, "ifContent");
    await svc.flush();
    expect(vault.exists(GLITTERY_PAGE)).toBe(true);
  });

  it("dispose() unsubscribes and drops pending exports", async () => {
    const events = new TypedEmitter<{ "thread:upsert": Thread }>();
    svc.watchThreads(events);
    data.threads = [GLITTERY_THREAD];
    svc.wordChanged(GLITTERY.id, "ifContent");
    svc.dispose();
    events.emit("thread:upsert", GLITTERY_THREAD);
    svc.wordChanged(GLITTERY.id, "ifContent");
    await vi.advanceTimersByTimeAsync(5000);
    expect(vault.files.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("track() after dispose unsubscribes immediately", () => {
    svc.dispose();
    const unsubscribe = vi.fn();
    svc.track(unsubscribe);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("a disabled kind of export is skipped", async () => {
    svc.dispose();
    svc = make({ enabled: (kind) => kind !== "word" });
    data.threads = [GLITTERY_THREAD];
    data.triviaList = TRIVIA;
    svc.wordChanged(GLITTERY.id, "ifContent");
    svc.triviaChanged();
    await vi.advanceTimersByTimeAsync(1000);
    expect([...vault.files.keys()]).toEqual([TRIVIA_FILE]);
  });
});

describe("shortDate", () => {
  it("formats month/day in local time", () => {
    const d = new Date(2026, 9, 3, 12);
    expect(shortDate(d.toISOString())).toBe("10/03");
  });

  it("passes through unparseable input", () => {
    expect(shortDate("not a date")).toBe("not a date");
  });
});
