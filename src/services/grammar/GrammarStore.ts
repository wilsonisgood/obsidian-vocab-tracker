import { TypedEmitter } from "../../core/events";
import type { GrammarAttempt, GrammarProgress, GrammarQuestion, GrammarShard } from "../../core/model/grammar";
import type { StoragePort } from "../../core/ports";
import {
  emptyGrammarShard,
  grammarFingerprint,
  mergeGrammar,
  normalizeGrammarShard,
  pruneGrammar,
  sortAttempts,
} from "./grammarMerge";

// store/grammar.json — the question bank, every answer ever given, and
// per-topic progress (wave 15 rule 8). Managed like LearnStore: read lazily
// the first time a grammar surface needs it, writes debounced 500 ms, every
// write a read-merge-write so a copy synced in from another device is
// unioned in rather than overwritten.

export const GRAMMAR_SHARD = "grammar";
const WRITE_DEBOUNCE_MS = 500;

export interface GrammarEvents {
  "question:upsert": GrammarQuestion;
  "attempt:add": GrammarAttempt;
  "progress:upsert": GrammarProgress;
  // The in-memory data was replaced by a merge with the disk copy (sync).
  "grammar:reloaded": void;
}

export interface GrammarStoreDeps {
  storage: StoragePort;
  clock?: () => Date;
}

export class GrammarStore {
  readonly events = new TypedEmitter<GrammarEvents>();
  private data: GrammarShard = emptyGrammarShard();
  private loading: Promise<void> | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  private clock: () => Date;

  constructor(private deps: GrammarStoreDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // Memoized, so callers can await it freely.
  ensureLoaded(): Promise<void> {
    if (!this.loading) {
      this.loading = this.readDisk().then((disk) => {
        this.data = mergeGrammar(this.data, disk);
      });
    }
    return this.loading;
  }

  get loaded(): boolean {
    return this.loading !== null;
  }

  // Unions a synced copy from disk into memory. A no-op until something has
  // loaded the store — the first load reads the latest file anyway.
  async reload(): Promise<void> {
    if (!this.loading) return;
    await this.loading;
    const disk = await this.readDisk();
    this.data = mergeGrammar(this.data, disk);
    this.events.emit("grammar:reloaded", undefined);
    // When this device holds records the synced copy lacks (the other
    // device's file replaced ours), write the union back.
    if (grammarFingerprint(this.data) !== grammarFingerprint(disk)) this.scheduleWrite();
  }

  private async readDisk(): Promise<GrammarShard> {
    try {
      return normalizeGrammarShard(await this.deps.storage.readShard<GrammarShard>(GRAMMAR_SHARD));
    } catch (e) {
      console.error("Vocab Tracker: couldn't read grammar data", e);
      return emptyGrammarShard();
    }
  }

  // ── Questions ─────────────────────────────────────────────────

  // Every stored question of the topic (or all), retired ones included —
  // mistake history still points at them. Use activeQuestions() to pick
  // what to ask next.
  questions(topicId?: string): GrammarQuestion[] {
    return this.data.questions.filter((q) => !q.deletedAt && (topicId === undefined || q.topicId === topicId));
  }

  activeQuestions(topicId?: string): GrammarQuestion[] {
    return this.questions(topicId).filter((q) => !q.retiredAt);
  }

  question(id: string): GrammarQuestion | undefined {
    return this.data.questions.find((q) => q.id === id && !q.deletedAt);
  }

  // Inserts a new question or replaces the stored copy with the same id.
  // Retire one by upserting it with `retiredAt` set.
  upsertQuestion(q: GrammarQuestion): GrammarQuestion {
    const now = this.nowIso();
    q.createdAt = q.createdAt ?? now;
    q.updatedAt = now;
    q.rev = (q.rev ?? 0) + 1;
    this.upsert(this.data.questions, q);
    this.events.emit("question:upsert", q);
    this.scheduleWrite();
    return q;
  }

  // ── Attempts (append-only) ────────────────────────────────────

  // In time order, oldest first.
  attempts(topicId?: string): GrammarAttempt[] {
    return this.data.attempts.filter((a) => topicId === undefined || a.topicId === topicId);
  }

  // Ignored when an attempt with the same id is already stored.
  addAttempt(a: GrammarAttempt): GrammarAttempt {
    if (this.data.attempts.some((x) => x.id === a.id)) return a;
    this.data.attempts = sortAttempts([...this.data.attempts, a]);
    this.events.emit("attempt:add", a);
    this.scheduleWrite();
    return a;
  }

  // ── Progress ──────────────────────────────────────────────────

  progress(topicId: string): GrammarProgress | undefined {
    return this.data.progress.find((p) => p.id === topicId && !p.deletedAt);
  }

  allProgress(): GrammarProgress[] {
    return this.data.progress.filter((p) => !p.deletedAt);
  }

  upsertProgress(p: GrammarProgress): GrammarProgress {
    const now = this.nowIso();
    p.createdAt = p.createdAt ?? now;
    p.updatedAt = now;
    p.rev = (p.rev ?? 0) + 1;
    this.upsert(this.data.progress, p);
    this.events.emit("progress:upsert", p);
    this.scheduleWrite();
    return p;
  }

  // ── Persistence ───────────────────────────────────────────────

  private nowIso(): string {
    return this.clock().toISOString();
  }

  private upsert<T extends { id: string }>(list: T[], rec: T): void {
    const i = list.findIndex((x) => x.id === rec.id);
    if (i === -1) list.push(rec);
    else list[i] = rec;
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.pendingWrite = this.write();
    }, WRITE_DEBOUNCE_MS);
  }

  private async write(): Promise<void> {
    try {
      // Read-merge-write: grammar.json may have synced in from another
      // device since we last read it, and a plain write would drop its rows.
      const merged = mergeGrammar(this.data, await this.readDisk());
      this.data = pruneGrammar(merged, this.clock().getTime());
      await this.deps.storage.writeShard<GrammarShard>(GRAMMAR_SHARD, this.data);
    } catch (e) {
      console.error("Vocab Tracker: couldn't save grammar data", e);
    }
  }

  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      this.pendingWrite = this.write();
    }
    await this.pendingWrite;
  }
}
