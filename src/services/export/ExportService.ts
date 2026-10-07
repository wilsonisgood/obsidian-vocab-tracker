import type { Thread } from "../../core/model/thread";
import { joinPath, linkTarget, MAX_NAME_BYTES, noteBasename, slugify, utf8Bytes, wordSlug } from "../../core/text/slug";
import { exportLabels } from "./labels";
import { applyManagedBlocks, type ManagedSection } from "./managedBlock";
import type { CreateMode, VaultPort } from "../../core/ports";
import { DEFAULT_EXPORT_FOLDERS, type ExportDataPort, type ExportFolders } from "./ports";
import {
  AI_NOTE_KIND,
  aiNoteOwner,
  claimAiNote,
  hasAiNoteContent,
  renderAiNoteFile,
  renderAiNoteSections,
  retargetAiNote,
  type AiNoteInput,
  type AiNoteOwner,
} from "./renderers/aiNote";
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
import type { ExportFamily, ExportLabels, ExportTrivia, ExportVerbFavorite, RenderContext } from "./types";

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
// - An article's note is 討論串/<name>.ai.md. Articles with the same name
//   in different folders each get their own: the second one is
//   "<name> (<folder>).ai.md", then "<name> (<folder>) 2.ai.md"… The note's
//   frontmatter `vocab-tracker-id` (the article path) says whose it is,
//   and finds it again after the user renames or moves it.

export const EXPORT_DEBOUNCE_MS = 1000;

// Defined in core/ports.ts (FilesExportPort uses it too).
export type { CreateMode };
const CREATE_RANK: Record<CreateMode, number> = { never: 0, ifContent: 1, always: 2 };

type Job =
  | { kind: "word"; entryId: string; create: CreateMode }
  | { kind: "note"; articlePath: string; create: CreateMode }
  | { kind: "trivia" };

export type ExportKind = Job["kind"];

const AI_NOTE_EXT = ".ai.md";
// Names tried for one article's note before giving up.
const MAX_NOTE_NAMES = 20;
// The folder name in "<name> (<folder>).ai.md" is cut to this.
const FOLDER_LABEL_BYTES = 60;

// Thrown inside process() to leave another article's note untouched.
class NotThisArticle extends Error {}

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
  // An article's note queues under its first name (noteQueue).
  private queues = new Map<string, Promise<void>>();
  // Article path → its note, as last found or created.
  private notePaths = new Map<string, string>();
  // Family id → its learned members as last announced (familyChanged).
  private familyMemberIds = new Map<string, Set<string>>();
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

  // The names an article's note can have, in the order they're tried:
  // "Notes", "Notes (b)", "Notes (b) 2"… for "a/b/Notes.md" ("Notes 2"…
  // for an article at the vault root). The name is shortened, never the
  // suffix, so long names still differ.
  aiNoteNames(articlePath: string): string[] {
    const folder = this.folders().threads;
    const budget = MAX_NAME_BYTES - utf8Bytes(AI_NOTE_EXT);
    const base = noteBasename(articlePath);
    const name = (suffix: string) => joinPath(folder, `${slugify(base, "untitled", budget - utf8Bytes(suffix))}${suffix}${AI_NOTE_EXT}`);
    const dir = articlePath.slice(0, Math.max(0, articlePath.lastIndexOf("/")));
    const label = slugify(dir.slice(dir.lastIndexOf("/") + 1), "", FOLDER_LABEL_BYTES);
    const tag = label ? ` (${label})` : "";
    const names = [name("")];
    if (tag) names.push(name(tag));
    for (let n = 2; names.length < MAX_NOTE_NAMES; n++) names.push(name(`${tag} ${n}`));
    return names;
  }

  // The article's note, for opening it: a file that exists and belongs to
  // this article, or null when it has none. Waits for writes to it that
  // are in progress. Never creates a note; an older note without an id,
  // found by its name, gets its id (claimAiNote) as on the next export.
  async aiNotePath(articlePath: string): Promise<string | null> {
    const { vault } = this.deps;
    const managed = vault.findManaged(AI_NOTE_KIND, articlePath);
    if (managed) return managed;
    const known = this.notePaths.get(articlePath);
    if (known && vault.exists(known)) return known;
    let path = null as string | null;
    await this.enqueue(this.noteQueue(articlePath), async () => {
      path = await this.resolveNote(articlePath, (text, owner) => (owner === "id" ? text : claimAiNote(text, articlePath)), null);
    });
    return path;
  }

  // Writes for one article's note wait in the queue of its first name, so
  // same-name articles (which compete for it) also take turns.
  private noteQueue(articlePath: string): string {
    return this.aiNoteNames(articlePath)[0];
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

  // Every word in the family (learned members) shows it on its page — and
  // so did the words it had last time: a family 重新分群 renewed under its
  // id may have dropped some, and their pages must lose it.
  familyChanged(family: ExportFamily): void {
    const now = new Set<string>();
    for (const group of family.groups) {
      for (const m of group.members) if (m.entryId) now.add(m.entryId);
    }
    const before = this.familyMemberIds.get(family.id);
    for (const id of new Set([...(before ?? []), ...now])) this.wordChanged(id);
    if (family.deletedAt) this.familyMemberIds.delete(family.id);
    else this.familyMemberIds.set(family.id, now);
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

  // A verb's usage was saved (「寫入單字頁」) or unsaved: saving creates
  // the word page when it has none yet.
  verbFavoriteChanged(fav: ExportVerbFavorite): void {
    this.wordChanged(fav.entryId, fav.deletedAt ? "never" : "ifContent");
  }

  // wordMeta changed (09 §7.1, 決定 1): emoji alone doesn't move the word
  // page (A7 — it only ever shows in the header's own live block, never
  // in the managed sections), but a finished 拆字 does, so only this
  // updates an existing page — like usageChanged, never creates one.
  wordMetaChanged(entryId: string): void {
    this.wordChanged(entryId);
  }

  // ── Event wiring ─────────────────────────────────────────────────────

  watchThreads(source: Subscribable<{ "thread:upsert": Thread }>): void {
    this.track(source.on("thread:upsert", (thread) => this.threadChanged(thread)));
  }

  // LearnStore: families, saved trivia and saved verb usages (deletes arrive as upserts
  // carrying deletedAt). A sync merge ("learn:reloaded") isn't followed:
  // the device that made the change already exported it, and the files
  // sync on their own.
  watchLearn(
    source: Subscribable<{
      "family:upsert": ExportFamily;
      "trivia:upsert": ExportTrivia;
      "verbFavorite:upsert": ExportVerbFavorite;
      // 09 §7.1 (F's LearnEvents); only the id is read here.
      "wordMeta:upsert": { id: string };
    }>
  ): void {
    this.track(source.on("family:upsert", (family) => this.familyChanged(family)));
    this.track(source.on("trivia:upsert", (item) => this.triviaItemChanged(item)));
    this.track(source.on("verbFavorite:upsert", (fav) => this.verbFavoriteChanged(fav)));
    this.track(source.on("wordMeta:upsert", (meta) => this.wordMetaChanged(meta.id)));
  }

  // VerbUsageService: a usage block was (re)generated.
  watchUsage(source: Subscribable<{ "verb:usage": { entryId: string } }>): void {
    this.track(source.on("verb:usage", ({ entryId }) => this.usageChanged(entryId)));
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

  // An article was renamed or moved (規劃書 06 §4.6): its .ai.md's id and
  // source follow, and so does its name unless the user renamed or moved
  // the note themselves. The paragraph anchors are updated by their owner
  // first. An export still pending for the old path moves to the new one
  // with its create mode, so a note due to be created still is.
  async renameArticle(oldPath: string, newPath: string): Promise<void> {
    const oldKey = jobKey({ kind: "note", articlePath: oldPath, create: "never" });
    const pending = this.timers.get(oldKey);
    let create: CreateMode = "never";
    if (pending) {
      clearTimeout(pending.timer);
      this.timers.delete(oldKey);
      if (pending.job.kind === "note") create = pending.job.create;
    }
    if (oldPath !== newPath) await this.enqueue(this.noteQueue(oldPath), () => this.moveNote(oldPath, newPath));
    // Embeds point at the new path.
    this.articleChanged(newPath, create);
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
        let path = null as string | null;
        await this.enqueue(this.noteQueue(job.articlePath), async () => {
          path = await this.writeNote(job.articlePath, job.create);
        });
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
      usages: data.usages(entryId),
      verbFavorites: data.verbFavorites?.() ?? [],
      trivia: data.trivia(),
      thread: data.wordThread(entryId),
      breakdown: data.wordBreakdown?.(entryId),
    };
    const ctx = this.context();
    const allowed = create === "always" || (create === "ifContent" && hasWordPageContent(input));
    await this.write(path, renderWordPageSections(input, ctx), allowed ? () => renderWordPageFile(input, ctx) : null);
  }

  // Finds the article's note — where it was last seen, by its frontmatter
  // id, then under each of its names in turn — and, once process() has
  // confirmed it really is this article's note, runs `update` on it. The
  // first free name is where a new note goes, if `create` is given.
  // Resolves to the note's path, or null when there's none.
  private async resolveNote(
    articlePath: string,
    update: (text: string, owner: AiNoteOwner) => string,
    create: (() => string) | null,
    renamedTo?: string
  ): Promise<string | null> {
    const { vault } = this.deps;
    const others = new Set<string>();
    const tryUpdate = async (path: string): Promise<boolean> => {
      try {
        await vault.process(path, (text) => {
          const owner = aiNoteOwner(text, articlePath, renamedTo);
          if (owner === "other") throw new NotThisArticle();
          return update(text, owner);
        });
      } catch (e) {
        if (!(e instanceof NotThisArticle)) throw e;
        others.add(path);
        return false;
      }
      this.notePaths.set(articlePath, path);
      return true;
    };

    // First every note that exists under a name, so one further down the
    // list (after a gap left by a deleted note) is still found when
    // findManaged can't help yet (metadata cache not ready, older note).
    const names = this.aiNoteNames(articlePath);
    const known = [this.notePaths.get(articlePath), vault.findManaged(AI_NOTE_KIND, articlePath)];
    for (const path of [...known, ...names]) {
      if (path && !others.has(path) && vault.exists(path) && (await tryUpdate(path))) return path;
    }
    if (!create) return null;
    // Then a new note under the first free name.
    for (const path of names) {
      if (others.has(path)) continue;
      if (!vault.exists(path)) {
        try {
          await vault.create(path, create());
          this.notePaths.set(articlePath, path);
          return path;
        } catch (e) {
          if (!vault.exists(path)) throw e;
          // It appeared meanwhile (sync, a same-name article): whose is it?
        }
      }
      if (await tryUpdate(path)) return path;
    }
    return null;
  }

  private async moveNote(oldPath: string, newPath: string): Promise<void> {
    const found = await this.resolveNote(oldPath, (text) => retargetAiNote(text, newPath), null, newPath);
    this.notePaths.delete(oldPath);
    if (!found) return;
    this.notePaths.set(newPath, found);
    // A note the user renamed or moved stays where they put it.
    if (!this.aiNoteNames(oldPath).includes(found)) return;
    const { vault } = this.deps;
    for (const to of this.aiNoteNames(newPath)) {
      if (to === found) return;
      // Never clobber a note already at a name.
      if (vault.exists(to)) continue;
      await vault.rename(found, to);
      this.notePaths.set(newPath, to);
      return;
    }
  }

  private async writeNote(articlePath: string, create: CreateMode): Promise<string | null> {
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
    const sections = renderAiNoteSections(input, ctx);
    const allowed = create === "always" || (create === "ifContent" && hasAiNoteContent(input));
    return this.resolveNote(
      articlePath,
      (text, owner) => {
        const updated = applyManagedBlocks(text, sections);
        // An older note found by its name or source gets the id now.
        return owner === "id" ? updated : claimAiNote(updated, articlePath);
      },
      allowed ? () => renderAiNoteFile(input, ctx) : null
    );
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
      labels: this.deps.labels?.() ?? exportLabels(),
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
