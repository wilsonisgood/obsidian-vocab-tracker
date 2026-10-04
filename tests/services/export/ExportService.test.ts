import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypedEmitter } from "../../../src/core/events";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Thread } from "../../../src/core/model/thread";
import { ExportService, shortDate } from "../../../src/services/export/ExportService";
import { findManagedBlock } from "../../../src/services/export/managedBlock";
import type { ExportDataPort, ParagraphThread, VaultPort } from "../../../src/services/export/ports";
import type { ExportFamily, ExportTrivia, ExportUsage } from "../../../src/services/export/types";
import { ARTICLE, entry, FAMILIES, GLITTERY, GLITTERY_THREAD, LEOTARD, TRIVIA, turn, USAGE, wordThread } from "./fixtures";

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
  usages = new Map<string, ExportUsage>();
  triviaList: ExportTrivia[] = [];
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
  usage(entryId: string): ExportUsage | undefined {
    return this.usages.get(entryId);
  }
  trivia(): readonly ExportTrivia[] {
    return this.triviaList;
  }
}

function paragraph(blockId: string, snapshot: string, index: number | null, turns = [turn("user", "?"), turn("assistant", "答案")]): ParagraphThread {
  return { index, thread: { id: `p:${blockId}`, anchor: { kind: "paragraph", path: ARTICLE, blockId, hash: "h", snapshot }, turns } };
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
    data.usages.set(GLITTERY.id, USAGE);
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

    data.usages.set(GLITTERY.id, USAGE);
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
    expect(svc.aiNotePath("a/b/Speech.md")).toBe("Vocab/Threads/Speech.ai.md");
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
    expect(vault.files.get(AI_NOTE)!.startsWith("my header\n")).toBe(true);
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
  });

  it("rename never overwrites a note already at the new name", async () => {
    vault.files.set(AI_NOTE, "old\n");
    vault.files.set("vocab-list/討論串/New.ai.md", "someone else's\n");
    await svc.renameArticle(ARTICLE, "New.md");
    expect(vault.files.get("vocab-list/討論串/New.ai.md")).toBe("someone else's\n");
    expect(vault.files.get(AI_NOTE)).toBe("old\n");
  });

  it("rename drops a pending export for the old path", async () => {
    data.paragraphs.set(ARTICLE, [paragraph("vt-aaaaaa", "p", 0)]);
    svc.articleChanged(ARTICLE);
    await svc.renameArticle(ARTICLE, "eng/New.md");
    await vi.advanceTimersByTimeAsync(2000);
    expect(vault.exists(AI_NOTE)).toBe(false);
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
