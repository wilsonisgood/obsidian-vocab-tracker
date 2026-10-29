import { TypedEmitter } from "../../core/events";
import { migrateGrammar } from "../../core/learner/migrateGrammar";
import type { GrammarAttempt, GrammarQuestion } from "../../core/model/grammar";
import { localDayOf, normalizePickKey, readingId, sortKinds } from "../../core/learner/reading";
import { asksFromThreads } from "../../core/learner/asks";
import type { Thread } from "../../core/model/thread";
import type { AskEvent, DiaryPick, DiaryPickKind, LearnEvent, LearnerShard, MistakeItem, ParagraphGloss, PoolItem, ReadingKind, ReadingVisit, Track, WordTouch } from "../../core/model/learner";
import type { PracticeQuestion, ScenarioTrack } from "../../core/model/practice";
import { isCefrTier, type CefrTier } from "../../core/wordlists/cefr";
import type { StoragePort } from "../../core/ports";
import { laneItems, livePool } from "../../core/practice/pool";
import { openMistakes } from "../../core/practice/mistakes";
import {
  emptyLearnerShard,
  learnerFingerprint,
  mergeLearner,
  normalizeLearnerShard,
  pruneLearner,
  sortEvents,
} from "./learnerMerge";

// store/learner.json — learn events, the waiting-question pools, the shared
// mistake area and per-track filters (規劃書 12 §1). Same shape as
// GrammarStore: read lazily, writes debounced 500 ms, read-merge-write.

export const LEARNER_SHARD = "learner";
const WRITE_DEBOUNCE_MS = 500;

export interface LearnerEvents {
  "event:add": LearnEvent;
  "pool:change": Track;
  "mistake:change": MistakeItem;
  "filter:change": Track;
  "question:upsert": PracticeQuestion[];
  "gloss:change": ParagraphGloss;
  // The in-memory data was replaced by a merge with the disk copy (sync).
  "learner:reloaded": void;
}

export interface LearnerStoreDeps {
  storage: StoragePort;
  clock?: () => Date;
}

export class LearnerStore {
  readonly events = new TypedEmitter<LearnerEvents>();
  private data: LearnerShard = emptyLearnerShard();
  private loading: Promise<void> | null = null;
  private ready = false;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  private clock: () => Date;

  constructor(private deps: LearnerStoreDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  ensureLoaded(): Promise<void> {
    if (!this.loading) {
      this.loading = this.readDisk().then((disk) => {
        this.data = mergeLearner(this.data, disk);
        this.ready = true;
      });
    }
    return this.loading;
  }

  get loaded(): boolean {
    return this.loading !== null;
  }

  async reload(): Promise<void> {
    if (!this.loading) return;
    await this.loading;
    const disk = await this.readDisk();
    this.data = mergeLearner(this.data, disk);
    this.events.emit("learner:reloaded", undefined);
    if (learnerFingerprint(this.data) !== learnerFingerprint(disk)) this.scheduleWrite();
  }

  private async readDisk(): Promise<LearnerShard> {
    try {
      return normalizeLearnerShard(await this.deps.storage.readShard<LearnerShard>(LEARNER_SHARD));
    } catch (e) {
      console.error("Vocab Tracker: couldn't read learner data", e);
      return emptyLearnerShard();
    }
  }

  // ── Events (append-only) ──────────────────────────────────────

  // Ignored when an event with the same id is already stored.
  addEvent(e: LearnEvent): void {
    if (this.data.events.some((x) => x.id === e.id)) return;
    this.data.events = sortEvents([...this.data.events, e]);
    this.events.emit("event:add", e);
    this.scheduleWrite();
  }

  // Oldest first.
  learnEvents(opts: { track?: Track; focusId?: string } = {}): LearnEvent[] {
    return this.data.events.filter(
      (e) => (opts.track === undefined || e.track === opts.track) && (opts.focusId === undefined || e.focus.id === opts.focusId)
    );
  }

  // ── Pool ──────────────────────────────────────────────────────

  pool(track: Track, lane?: string): PoolItem[] {
    return livePool(laneItems(this.data.pool, lane), track);
  }

  // Every stored pool item (removed ones included), for addToPool's de-dupe.
  allPool(): PoolItem[] {
    return [...this.data.pool];
  }

  upsertPool(items: readonly PoolItem[]): void {
    if (items.length === 0) return;
    const tracks = new Set<Track>();
    for (const it of items) {
      this.upsert(this.data.pool, it);
      tracks.add(it.track);
    }
    for (const t of tracks) this.events.emit("pool:change", t);
    this.scheduleWrite();
  }

  // ── Scenario questions (常用字 / 單字情境 / 混合) ──────────────

  // Retired ones included (events and mistakes may still point at them).
  practiceQuestions(track?: ScenarioTrack): PracticeQuestion[] {
    return this.data.questions.filter((q) => track === undefined || q.track === track);
  }

  practiceQuestion(id: string): PracticeQuestion | undefined {
    return this.data.questions.find((q) => q.id === id);
  }

  upsertPracticeQuestions(qs: readonly PracticeQuestion[]): void {
    if (qs.length === 0) return;
    for (const q of qs) this.upsert(this.data.questions, q);
    this.events.emit("question:upsert", [...qs]);
    this.scheduleWrite();
  }

  // ── Mistakes ──────────────────────────────────────────────────

  mistakes(track?: Track): MistakeItem[] {
    return openMistakes(this.data.mistakes, track);
  }

  // Resolved ones included.
  mistake(id: string): MistakeItem | undefined {
    return this.data.mistakes.find((m) => m.id === id);
  }

  upsertMistake(m: MistakeItem): void {
    this.upsert(this.data.mistakes, m);
    this.events.emit("mistake:change", m);
    this.scheduleWrite();
  }

  // ── Filters ───────────────────────────────────────────────────

  filter(track: Track): unknown {
    return this.data.filters.find((f) => f.id === track)?.value;
  }

  setFilter(track: Track, value: unknown): void {
    this.upsert(this.data.filters, { id: track, value, updatedAt: this.clock().toISOString() });
    this.events.emit("filter:change", track);
    this.scheduleWrite();
  }

  // ── Reading log (第十九波 D1) ──────────────────────────────────

  // One row per local day + path + heading; repeats add kinds and bump updatedAt.
  recordReading(input: { path: string; title: string; heading?: string; kind: ReadingKind }): void {
    const now = this.clock();
    const iso = now.toISOString();
    const day = localDayOf(now);
    const id = readingId(day, input.path, input.heading);
    const list = (this.data.reading ??= []);
    const cur = list.find((r) => r.id === id);
    if (cur) {
      cur.kinds = sortKinds([...cur.kinds, input.kind]);
      cur.updatedAt = iso;
      if (input.title) cur.title = input.title;
    } else {
      const v: ReadingVisit = { id, day, at: iso, updatedAt: iso, path: input.path, title: input.title, kinds: [input.kind] };
      if (input.heading) v.heading = input.heading;
      list.push(v);
    }
    this.scheduleWrite();
  }

  readingOn(day: string): ReadingVisit[] {
    return this.readingBetween(day, day);
  }

  // Both ends included; oldest first.
  readingBetween(fromDay: string, toDay: string): ReadingVisit[] {
    return (this.data.reading ?? [])
      .filter((r) => r.day >= fromDay && r.day <= toDay)
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }

  recordDiaryPick(p: { kind: DiaryPickKind; key: string; day: string }): void {
    const key = normalizePickKey(p.key);
    if (!key) return;
    const id = `${p.kind}|${key}`;
    const list = (this.data.diaryPicks ??= []);
    if (list.some((x) => x.id === id)) return;
    list.push({ id, kind: p.kind, key, day: p.day, at: this.clock().toISOString() });
    this.scheduleWrite();
  }

  diaryPicks(): DiaryPick[] {
    return [...(this.data.diaryPicks ?? [])];
  }

  // ── AI asks & word touches (規劃書 15 §2) ──────────────────────

  // Same id already recorded → ignored (the event itself never changes).
  recordAsk(e: AskEvent): void {
    const list = (this.data.asks ??= []);
    if (list.some((x) => x.id === e.id)) return;
    list.push(e);
    this.scheduleWrite();
  }

  asks(): AskEvent[] {
    return [...(this.data.asks ?? [])];
  }

  // One row per local day + lowercased word; `saved` is fixed by the first touch.
  recordWordTouch(input: { word: string; kind: "lookup" | "pronounce"; saved: boolean }): void {
    const word = input.word.trim().toLowerCase();
    if (!word) return;
    const now = this.clock();
    const day = localDayOf(now);
    const id = `${day}|${word}`;
    const list = (this.data.wordTouches ??= []);
    let cur = list.find((w) => w.id === id);
    if (!cur) {
      cur = { id, day, word, lookup: 0, pronounce: 0, saved: input.saved, updatedAt: "" };
      list.push(cur);
    }
    cur[input.kind]++;
    cur.updatedAt = now.toISOString();
    this.scheduleWrite();
  }

  wordTouches(): WordTouch[] {
    return [...(this.data.wordTouches ?? [])];
  }

  // ── AI-tagged word levels (第二十三波 R7) ──────────────────────

  wordCefr(): Map<string, CefrTier> {
    return new Map((this.data.wordCefr ?? []).map((w) => [w.id, w.level]));
  }

  // Words outside the CEFR-J list that the AI gave a level; kept for good so
  // they aren't asked again. A level already stored is replaced only when it differs.
  setWordCefr(entries: readonly { word: string; level: CefrTier }[]): void {
    const list = (this.data.wordCefr ??= []);
    const at = this.clock().toISOString();
    let changed = false;
    for (const e of entries) {
      const id = e.word.trim().toLowerCase();
      if (!id || !isCefrTier(e.level)) continue;
      const cur = list.find((w) => w.id === id);
      if (cur?.level === e.level) continue;
      if (cur) {
        cur.level = e.level;
        cur.at = at;
      } else list.push({ id, level: e.level, at });
      changed = true;
    }
    if (changed) this.scheduleWrite();
  }

  // ── 語境意思 (1030 #3) ─────────────────────────────────────────

  // id = paragraphHash of the paragraph's text.
  gloss(id: string): ParagraphGloss | undefined {
    return (this.data.glosses ?? []).find((g) => g.id === id);
  }

  glosses(): readonly ParagraphGloss[] {
    return this.data.glosses ?? [];
  }

  upsertGloss(g: ParagraphGloss): void {
    this.upsert((this.data.glosses ??= []), g);
    this.events.emit("gloss:change", g);
    this.scheduleWrite();
  }

  // ── Migration ─────────────────────────────────────────────────

  // Call after ensureLoaded() (and after the GrammarStore has loaded).
  // Returns false — doing nothing — when it already ran, or the store isn't
  // loaded yet (so a missing disk copy can't be mistaken for "never ran").
  migrateFromGrammar(questions: readonly GrammarQuestion[], attempts: readonly GrammarAttempt[]): boolean {
    if (!this.ready || this.data.meta.grammarMigratedAt) return false;
    const now = this.clock();
    const m = migrateGrammar(questions, attempts, now, this.data.pool);
    const known = new Set(this.data.events.map((e) => e.id));
    this.data.events = sortEvents([...this.data.events, ...m.events.filter((e) => !known.has(e.id))]);
    for (const x of m.mistakes) if (!this.data.mistakes.some((y) => y.id === x.id)) this.data.mistakes.push(x);
    this.data.pool.push(...m.pool);
    this.data.meta = { ...this.data.meta, grammarMigratedAt: now.toISOString() };
    if (m.pool.length) this.events.emit("pool:change", "grammar");
    for (const x of m.mistakes) this.events.emit("mistake:change", x);
    this.scheduleWrite();
    return true;
  }

  // Backfills asks[] from threads.json once (tombstoned turns included).
  // Returns false — doing nothing — when it already ran or isn't loaded.
  migrateAsksFromThreads(threads: readonly Thread[], surfaceOf?: (taskId: string) => string | undefined): boolean {
    if (!this.ready || this.data.meta.asksMigratedAt) return false;
    const list = (this.data.asks ??= []);
    const known = new Set(list.map((a) => a.id));
    for (const a of asksFromThreads(threads, surfaceOf)) if (!known.has(a.id)) list.push(a);
    this.data.meta = { ...this.data.meta, asksMigratedAt: this.clock().toISOString() };
    this.scheduleWrite();
    return true;
  }

  // ── Persistence ───────────────────────────────────────────────

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
      const merged = mergeLearner(this.data, await this.readDisk());
      this.data = pruneLearner(merged, this.clock().getTime());
      await this.deps.storage.writeShard<LearnerShard>(LEARNER_SHARD, this.data);
    } catch (e) {
      console.error("Vocab Tracker: couldn't save learner data", e);
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
