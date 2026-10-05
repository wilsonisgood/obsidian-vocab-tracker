import { TypedEmitter } from "../../core/events";
import type { Family } from "../../core/model/family";
import type { TriviaItem } from "../../core/model/trivia";
import { verbFavoriteId, type VerbFavorite } from "../../core/model/usage";
import type { StoragePort } from "../../core/ports";
import {
  dropOldTombstones,
  emptyLearnShard,
  learnFingerprint,
  mergeLearn,
  normalizeLearnShard,
  type LearnShard,
} from "./learnMerge";

// store/learn.json — families, saved trivia and saved verb usages
// (規劃書 06 §4.2). Managed
// the way ThreadService manages threads.json: read lazily the first time a
// learning page opens, writes debounced 500 ms, and every write is a
// read-merge-write so a copy synced in from another device is unioned in
// instead of overwritten.

export const LEARN_SHARD = "learn";
const WRITE_DEBOUNCE_MS = 500;

export interface LearnEvents {
  // Also fired for deletes: the record then carries deletedAt.
  "family:upsert": Family;
  "trivia:upsert": TriviaItem;
  "verbFavorite:upsert": VerbFavorite;
  // Families/trivia were replaced by a merge with the disk copy (sync).
  "learn:reloaded": void;
}

export interface LearnStoreDeps {
  storage: StoragePort;
  clock?: () => Date;
}

export class LearnStore {
  readonly events = new TypedEmitter<LearnEvents>();
  private data: LearnShard = emptyLearnShard();
  private loading: Promise<void> | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  private clock: () => Date;

  constructor(private deps: LearnStoreDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // Memoized, so callers can await it freely.
  ensureLoaded(): Promise<void> {
    if (!this.loading) {
      this.loading = this.readDisk().then((disk) => {
        this.data = mergeLearn(this.data, disk);
      });
    }
    return this.loading;
  }

  get loaded(): boolean {
    return this.loading !== null;
  }

  // Unions a synced copy from disk into memory. A no-op until something
  // has opened a learning page — the first load reads the latest file anyway.
  async reload(): Promise<void> {
    if (!this.loading) return;
    await this.loading;
    const disk = await this.readDisk();
    this.data = mergeLearn(this.data, disk);
    this.events.emit("learn:reloaded", undefined);
    // §4.3: when this device has records the synced copy lacks (it was
    // overwritten by the other device's file), write the union back.
    if (learnFingerprint(this.data) !== learnFingerprint(disk)) this.scheduleWrite();
  }

  private async readDisk(): Promise<LearnShard> {
    try {
      return normalizeLearnShard(await this.deps.storage.readShard<LearnShard>(LEARN_SHARD));
    } catch (e) {
      console.error("Vocab Tracker: couldn't read learn data", e);
      return emptyLearnShard();
    }
  }

  // ── Families ──────────────────────────────────────────────────

  families(): Family[] {
    return this.data.families.filter((f) => !f.deletedAt);
  }

  family(id: string): Family | undefined {
    return this.data.families.find((f) => f.id === id && !f.deletedAt);
  }

  // Inserts a new family or replaces the stored copy with the same id.
  putFamily(f: Family): Family {
    this.stamp(f);
    this.upsert(this.data.families, f);
    this.events.emit("family:upsert", f);
    this.scheduleWrite();
    return f;
  }

  // `by: "regroup"` marks a tombstone 重新分群 wrote rather than the user
  // (see pickFamily in learnMerge.ts).
  deleteFamily(id: string, by?: "regroup"): void {
    const f = this.family(id);
    if (!f) return;
    f.deletedAt = this.nowIso();
    if (by) f.deletedBy = by;
    this.putFamily(f);
  }

  // ── Trivia favorites ──────────────────────────────────────────

  trivia(): TriviaItem[] {
    return this.data.trivia.filter((t) => !t.deletedAt);
  }

  triviaItem(id: string): TriviaItem | undefined {
    return this.data.trivia.find((t) => t.id === id && !t.deletedAt);
  }

  putTrivia(item: TriviaItem): TriviaItem {
    this.stamp(item);
    this.upsert(this.data.trivia, item);
    this.events.emit("trivia:upsert", item);
    this.scheduleWrite();
    return item;
  }

  deleteTrivia(id: string): void {
    const item = this.triviaItem(id);
    if (!item) return;
    item.deletedAt = this.nowIso();
    this.putTrivia(item);
  }

  // ── Saved verb usages (動詞用法收藏) ─────────────────────────────

  private get verbList(): VerbFavorite[] {
    return (this.data.verbs ??= []);
  }

  verbFavorites(): VerbFavorite[] {
    return this.verbList.filter((v) => !v.deletedAt);
  }

  verbFavorite(entryId: string): VerbFavorite | undefined {
    const id = verbFavoriteId(entryId);
    return this.verbList.find((v) => v.id === id && !v.deletedAt);
  }

  // Saves the verb (idempotent). Saving again after an unsave revives the
  // same id as a fresh record — a newer updatedAt than the tombstone, so
  // the save wins the merge on every device.
  favoriteVerb(entry: { id: string; word: string }): VerbFavorite {
    const live = this.verbFavorite(entry.id);
    if (live) return live;
    const id = verbFavoriteId(entry.id);
    const dead = this.verbList.find((v) => v.id === id);
    const rec: VerbFavorite = { id, entryId: entry.id, word: entry.word, rev: dead?.rev };
    this.stamp(rec);
    this.upsert(this.verbList, rec);
    this.events.emit("verbFavorite:upsert", rec);
    this.scheduleWrite();
    return rec;
  }

  unfavoriteVerb(entryId: string): void {
    const rec = this.verbFavorite(entryId);
    if (!rec) return;
    rec.deletedAt = this.nowIso();
    this.stamp(rec);
    this.events.emit("verbFavorite:upsert", rec);
    this.scheduleWrite();
  }

  // ── Persistence ───────────────────────────────────────────────

  private nowIso(): string {
    return this.clock().toISOString();
  }

  private stamp(rec: Family | TriviaItem | VerbFavorite): void {
    const now = this.nowIso();
    rec.createdAt = rec.createdAt ?? now;
    rec.updatedAt = now;
    rec.rev = (rec.rev ?? 0) + 1;
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
      // Read-merge-write: learn.json may have synced in from another device
      // since we last read it, and a plain write would drop its records.
      const merged = mergeLearn(this.data, await this.readDisk());
      const now = this.clock().getTime();
      this.data = {
        families: dropOldTombstones(merged.families, now),
        trivia: dropOldTombstones(merged.trivia, now),
        verbs: dropOldTombstones(merged.verbs ?? [], now),
      };
      await this.deps.storage.writeShard<LearnShard>(LEARN_SHARD, this.data);
    } catch (e) {
      console.error("Vocab Tracker: couldn't save learn data", e);
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
