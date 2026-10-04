import type { Thread } from "../../core/model/thread";
import { joinPath, linkTarget, noteBasename, slugify, wordSlug } from "../../core/text/slug";
import { EXPORT_LABELS_ZH } from "./labels";
import { applyManagedBlocks, type ManagedSection } from "./managedBlock";
import { DEFAULT_EXPORT_FOLDERS, type ExportDataPort, type ExportFolders, type VaultPort } from "./ports";
import { hasAiNoteContent, renderAiNoteFile, renderAiNoteSections, type AiNoteInput } from "./renderers/aiNote";
import { threadRounds } from "./renderers/common";
import { renderTriviaFavoritesFile, renderTriviaFavoritesSections } from "./renderers/triviaFavorites";
import {
  WORD_PAGE_KIND,
  hasWordPageContent,
  mentionsEntry,
  renderWordPageFile,
  renderWordPageSections,
  type WordPageInput,
} from "./renderers/wordPage";
import type { ExportFamily, ExportLabels, ExportTrivia, RenderContext } from "./types";

// Keeps the exported Markdown notes (規劃書 06 §8) in step with the data:
// 單字/<word>.md, 討論串/<文章>.ai.md and the saved list in 冷知識.md.
//
// - Changes are announced per target (wordChanged / articleChanged /
//   triviaChanged, or the watch* helpers) and debounced 1 s per target, so
//   a burst of edits is one write.
// - Writes are serialized per file: a write waits for the previous one to
//   the same path to finish, so two never interleave.
// - Data is read and rendered when the write actually runs, not when the
//   change was announced.
// - Only managed blocks are replaced (managedBlock.ts); files are created
//   only when there's something to show (§8.2), never overwritten.

export const EXPORT_DEBOUNCE_MS = 1000;

// "never": only update a file that already exists. "ifContent": create it
// when there's something to put in it. "always": the user asked for it.
export type CreateMode = "never" | "ifContent" | "always";
const CREATE_RANK: Record<CreateMode, number> = { never: 0, ifContent: 1, always: 2 };

type Job =
  | { kind: "word"; entryId: string; create: CreateMode }
  | { kind: "note"; articlePath: string; create: CreateMode }
  | { kind: "trivia" };

export type ExportKind = Job["kind"];

export interface ExportServiceDeps {
  vault: VaultPort;
  data: ExportDataPort;
  folders?: () => ExportFolders;
  labels?: () => ExportLabels;
  formatDate?: (iso: string) => string;
  // Task id → quick-action label, e.g. "paragraph.grammar" → "文法".
  taskLabel?: (taskId: string) => string | undefined;
  // Settings switch per kind of export (e.g. "don't export word pages").
  enabled?: (kind: ExportKind) => boolean;
  debounceMs?: number;
}

// Anything with a TypedEmitter-style `on` that returns an unsubscribe.
export interface Subscribable<E> {
  on<K extends keyof E>(event: K, fn: (payload: E[K]) => void): () => void;
}

// "10/03" in local time, as on the design's W1/W4 screens.
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function jobKey(job: Job): string {
  switch (job.kind) {
    case "word":
      return `word:${job.entryId}`;
    case "note":
      return `note:${job.articlePath}`;
    case "trivia":
      return "trivia";
  }
}

function mergeJobs(a: Job, b: Job): Job {
  if ((a.kind === "word" && b.kind === "word") || (a.kind === "note" && b.kind === "note")) {
    return CREATE_RANK[a.create] >= CREATE_RANK[b.create] ? a : { ...a, create: b.create };
  }
  return a;
}

export class ExportService {
  private timers = new Map<string, { timer: ReturnType<typeof setTimeout>; job: Job }>();
  // File path → the latest write queued for it (each waits for the last).
  private queues = new Map<string, Promise<void>>();
  private subscriptions: (() => void)[] = [];
  private disposed = false;
  private readonly debounceMs: number;

  constructor(private deps: ExportServiceDeps) {
    this.debounceMs = deps.debounceMs ?? EXPORT_DEBOUNCE_MS;
  }

  // ── Paths ────────────────────────────────────────────────────────────

  private folders(): ExportFolders {
    return this.deps.folders?.() ?? DEFAULT_EXPORT_FOLDERS;
  }

  // Where a word's page goes when it doesn't exist yet.
  defaultWordPagePath(word: string): string {
    return joinPath(this.folders().words, `${wordSlug(word)}.md`);
  }

  // The word's page: found by its frontmatter id first (survives the user
  // renaming or moving it), else the default path.
  wordPagePath(entryId: string, word: string): string {
    return this.deps.vault.findManaged(WORD_PAGE_KIND, entryId) ?? this.defaultWordPagePath(word);
  }

  aiNotePath(articlePath: string): string {
    return joinPath(this.folders().threads, `${slugify(noteBasename(articlePath))}.ai.md`);
  }

  // ── Announcing changes ───────────────────────────────────────────────

  // A word's page content changed (its thread, families, usage, trivia).
  // `create: "ifContent"` lets this change create the page when it now has
  // a discussion or saved trivia; the default only updates an existing page.
  wordChanged(entryId: string, create: CreateMode = "never"): void {
    this.schedule({ kind: "word", entryId, create });
  }

  articleChanged(articlePath: string, create: CreateMode = "ifContent"): void {
    this.schedule({ kind: "note", articlePath, create });
  }

  triviaChanged(): void {
    this.schedule({ kind: "trivia" });
  }

  threadChanged(thread: Thread): void {
    const anchor = thread.anchor;
    if (anchor.kind === "paragraph") {
      this.articleChanged(anchor.path);
    } else if (anchor.kind === "word") {
      this.wordChanged(anchor.entryId, "ifContent");
      // The note's "words learned" list shows each word's question count.
      const source = this.deps.data.entry(anchor.entryId)?.source?.path;
      if (source) this.articleChanged(source, "never");
    }
  }

  // Every word in the family (learned members) shows it on its page.
  familyChanged(family: ExportFamily): void {
    for (const group of family.groups) {
      for (const m of group.members) if (m.entryId) this.wordChanged(m.entryId);
    }
  }

  // A trivia item was saved, edited or unsaved.
  triviaItemChanged(item: ExportTrivia): void {
    this.triviaChanged();
    this.wordChanged(item.entryId, "ifContent");
    // Words it mentions list it as a back-link.
    for (const entry of this.deps.data.entries()) {
      if (mentionsEntry(item, entry)) this.wordChanged(entry.id);
    }
  }

  usageChanged(entryId: string): void {
    this.wordChanged(entryId);
  }

  // ── Event wiring ─────────────────────────────────────────────────────

  watchThreads(source: Subscribable<{ "thread:upsert": Thread }>): void {
    this.track(source.on("thread:upsert", (thread) => this.threadChanged(thread)));
  }

  // Keeps an unsubscribe function to call on dispose().
  track(unsubscribe: () => void): void {
    if (this.disposed) unsubscribe();
    else this.subscriptions.push(unsubscribe);
  }

  // ── Immediate actions ────────────────────────────────────────────────

  // The 「單字頁」 button: creates the page now if needed (no debounce) and
  // returns its path, or null when the entry doesn't exist.
  async openWordPage(entryId: string): Promise<string | null> {
    const key = jobKey({ kind: "word", entryId, create: "always" });
    const pending = this.timers.get(key);
    if (pending) {
      clearTimeout(pending.timer);
      this.timers.delete(key);
    }
    return this.run({ kind: "word", entryId, create: "always" });
  }

  // An article was renamed or moved (規劃書 06 §4.6): its .ai.md follows.
  // The paragraph anchors themselves are updated by their owner first.
  async renameArticle(oldPath: string, newPath: string): Promise<void> {
    const oldKey = jobKey({ kind: "note", articlePath: oldPath, create: "never" });
    const pending = this.timers.get(oldKey);
    if (pending) {
      clearTimeout(pending.timer);
      this.timers.delete(oldKey);
    }
    const from = this.aiNotePath(oldPath);
    const to = this.aiNotePath(newPath);
    if (from !== to) {
      await this.enqueue(from, async () => {
        const { vault } = this.deps;
        // Never clobber a note already at the new name.
        if (!vault.exists(from) || vault.exists(to)) return;
        await vault.rename(from, to);
      });
    }
    // Embeds and the source link point at the new path.
    this.articleChanged(newPath, "never");
  }

  // Runs every pending export now and waits for all writes to land.
  async flush(): Promise<void> {
    for (const [key, { timer }] of [...this.timers]) {
      clearTimeout(timer);
      this.fire(key);
    }
    await Promise.all([...this.queues.values()]);
  }

  // Unsubscribes and drops pending (not yet started) exports. Call flush()
  // first to write them instead.
  dispose(): void {
    this.disposed = true;
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
    for (const { timer } of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  // ── Scheduling ───────────────────────────────────────────────────────

  private schedule(job: Job): void {
    if (this.disposed) return;
    if (this.deps.enabled && !this.deps.enabled(job.kind)) return;
    const key = jobKey(job);
    const pending = this.timers.get(key);
    if (pending) clearTimeout(pending.timer);
    const merged = pending ? mergeJobs(pending.job, job) : job;
    this.timers.set(key, { timer: setTimeout(() => this.fire(key), this.debounceMs), job: merged });
  }

  private fire(key: string): void {
    const pending = this.timers.get(key);
    if (!pending) return;
    this.timers.delete(key);
    void this.run(pending.job);
  }

  private enqueue(path: string, task: () => Promise<void>): Promise<void> {
    const prev = this.queues.get(path) ?? Promise.resolve();
    const next = prev.then(task).catch((e) => console.error(`Vocab Tracker: couldn't export ${path}`, e));
    this.queues.set(path, next);
    void next.then(() => {
      if (this.queues.get(path) === next) this.queues.delete(path);
    });
    return next;
  }

  // Resolves to the file's path once its write has finished (or failed).
  private async run(job: Job): Promise<string | null> {
    switch (job.kind) {
      case "word": {
        const entry = this.deps.data.entry(job.entryId);
        if (!entry) return null;
        const path = this.wordPagePath(entry.id, entry.word);
        await this.enqueue(path, () => this.writeWord(path, job.entryId, job.create));
        return path;
      }
      case "note": {
        const path = this.aiNotePath(job.articlePath);
        await this.enqueue(path, () => this.writeNote(path, job.articlePath, job.create));
        return path;
      }
      case "trivia": {
        const path = this.folders().triviaFile;
        await this.enqueue(path, () => this.writeTrivia(path));
        return path;
      }
    }
  }

  // ── Writing ──────────────────────────────────────────────────────────

  // Updates the managed sections of an existing file, or creates the file
  // when allowed. If the file appears between the check and the create
  // (another device's sync, the user), falls back to updating it.
  private async write(path: string, sections: ManagedSection[], create: (() => string) | null): Promise<void> {
    const { vault } = this.deps;
    if (!vault.exists(path)) {
      if (!create) return;
      try {
        await vault.create(path, create());
        return;
      } catch (e) {
        if (!vault.exists(path)) throw e;
      }
    }
    await vault.process(path, (text) => applyManagedBlocks(text, sections));
  }

  private async writeWord(path: string, entryId: string, create: CreateMode): Promise<void> {
    await this.deps.data.ready?.();
    const { data } = this.deps;
    const entry = data.entry(entryId);
    if (!entry) return;
    const input: WordPageInput = {
      entry,
      families: data.families(),
      usage: data.usage(entryId),
      trivia: data.trivia(),
      thread: data.wordThread(entryId),
    };
    const ctx = this.context();
    const allowed = create === "always" || (create === "ifContent" && hasWordPageContent(input));
    await this.write(path, renderWordPageSections(input, ctx), allowed ? () => renderWordPageFile(input, ctx) : null);
  }

  private async writeNote(path: string, articlePath: string, create: CreateMode): Promise<void> {
    await this.deps.data.ready?.();
    const { data } = this.deps;
    const paragraphs = (await data.paragraphThreads(articlePath)).flatMap(({ thread, index }) => {
      const anchor = thread.anchor;
      if (thread.deletedAt || anchor.kind !== "paragraph") return [];
      return [{ index, text: anchor.snapshot, blockId: anchor.blockId, turns: thread.turns, createdAt: thread.createdAt }];
    });
    const words = data
      .entries()
      .filter((e) => e.source?.path === articlePath)
      .sort((a, b) => (a.source?.line ?? 0) - (b.source?.line ?? 0) || a.word.localeCompare(b.word))
      .map((e) => ({
        word: e.word,
        entryId: e.id,
        // Rounds shown on the word page (failed / streaming ones excluded).
        questions: threadRounds(data.wordThread(e.id)).length,
      }));
    const input: AiNoteInput = { articlePath, paragraphs, words };
    const ctx = this.context();
    const allowed = create === "always" || (create === "ifContent" && hasAiNoteContent(input));
    await this.write(path, renderAiNoteSections(input, ctx), allowed ? () => renderAiNoteFile(input, ctx) : null);
  }

  private async writeTrivia(path: string): Promise<void> {
    await this.deps.data.ready?.();
    const input = { items: this.deps.data.trivia() };
    const ctx = this.context();
    const hasItems = input.items.some((t) => !t.deletedAt);
    await this.write(path, renderTriviaFavoritesSections(input, ctx), hasItems ? () => renderTriviaFavoritesFile(input, ctx) : null);
  }

  private context(): RenderContext {
    const { data, vault } = this.deps;
    return {
      labels: this.deps.labels?.() ?? EXPORT_LABELS_ZH,
      formatDate: this.deps.formatDate ?? shortDate,
      taskLabel: this.deps.taskLabel ?? (() => undefined),
      entryWord: (id) => data.entry(id)?.word,
      pageLink: (word, entryId) => {
        const found = entryId ? vault.findManaged(WORD_PAGE_KIND, entryId) : null;
        if (found) return linkTarget(found);
        const fallback = this.defaultWordPagePath(word);
        return vault.exists(fallback) ? linkTarget(fallback) : null;
      },
    };
  }
}
