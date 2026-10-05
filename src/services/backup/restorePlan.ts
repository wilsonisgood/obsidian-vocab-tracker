import type { Record_, VocabData, VocabEntry } from "../../core/model/entry";
import type { Family } from "../../core/model/family";
import type { ReviewLog } from "../../core/model/srs";
import type { Thread, Turn } from "../../core/model/thread";
import type { TriviaItem } from "../../core/model/trivia";
import { mergeReviewLogs, pruneReviewLogs } from "../../core/store/reviewLogs";
import type { LearnShard } from "../learn/learnMerge";
import type { Snapshot } from "./format";
import type { RestoreChanges } from "../../core/ports";

// What 從備份還原 writes, as a pure function of (current state, backup).
//
// Why not just copy the backup over the files: every shard merges across
// devices by id, keeping the copy with the newer updatedAt, and deletes are
// tombstones (core/store/merge.ts, core/store/threads.ts,
// services/learn/learnMerge.ts). A backup's records carry their *old*
// stamps, so the very next merge — this device's own in-memory services
// writing back (ThreadService / LearnStore read-merge-write), or any other
// device syncing — prefers the newer current copies and brings back every
// record the backup lacks. The restore would silently undo itself.
//
// So a restore is recorded as an edit made now ("rebase"):
// - a record whose backup content differs from the current one, or that is
//   deleted / missing now, gets the backup's content stamped updatedAt =
//   now, rev + 1, no deletedAt. Being the newest copy anywhere, it wins
//   every merge against copies written before the restore — on this device
//   and on every other one;
// - a record that is the same in both keeps its stamps, so an edit another
//   device made but hasn't synced yet still wins there (the restore didn't
//   touch that word, so it has no reason to undo that edit);
// - records only in the current state (added after the backup) are kept,
//   unless `removeExtras` — then they get a tombstone stamped now, which
//   deletes them on every device after sync (only the ones this device
//   knows about: another device's unsynced new records are not touched);
// - review logs are immutable and merge as a plain union, so the backup's
//   logs are added and none are removed; imports / files records only grow,
//   so they are unioned too.
//
// Edits made anywhere *after* the restore are newer still and win as usual.
// Settings and usage.json are never restored (see format.ts).
//
// The result dominates the current state: merging the current copy with
// it (in either order) gives it back. That's why the services can simply
// reload() — their union with the new files *is* the restored state.

export interface RestoreOptions {
  // Delete records added after the backup (tombstones) instead of keeping them.
  removeExtras: boolean;
  // ISO stamp for every record the restore writes.
  now: string;
}

export interface Counts {
  // In the backup and different now → back to the backup's content.
  changed: number;
  // In the backup, deleted (or gone) now → back.
  revived: number;
  // Live now, not in the backup: kept, or deleted with removeExtras.
  extra: number;
}

export interface RestoreCounts {
  words: Counts;
  // Discussions changed / revived / extra, and questions inside them.
  threads: Counts;
  questions: Counts;
  families: Counts;
  trivia: Counts;
  // Review logs the backup adds back.
  reviewsAdded: number;
}

export type PlannedShard = "data" | "threads" | "learn" | "reviews" | "imports" | "files";

export interface RestorePlan {
  // Shard name → content to write (only the shards the restore covers).
  shards: Partial<Record<PlannedShard, unknown>>;
  data?: VocabData;
  counts: RestoreCounts;
  // Parts the backup doesn't include, left as they are.
  missing: ("threads" | "learn" | "reviews")[];
  changes: RestoreChanges;
}

type Rec = Record_ & { id: string };

const META = new Set(["updatedAt", "rev", "deletedAt"]);

// Stable JSON with sorted keys, so two copies of the same record compare
// equal however their keys were ordered.
function canonical(value: unknown, skip: ReadonlySet<string> = META): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v, new Set())).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as object)
      .filter((k) => !skip.has(k) && (value as Record<string, unknown>)[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k], new Set())}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function zero(): Counts {
  return { changed: 0, revived: 0, extra: 0 };
}

// The backup's copy, live and stamped as the newest.
function restored<T extends Rec>(backup: T, current: T | undefined, now: string): T {
  const out = { ...backup, updatedAt: now, rev: Math.max(backup.rev ?? 0, current?.rev ?? 0) + 1 } as T;
  delete out.deletedAt;
  delete (out as { deletedBy?: unknown }).deletedBy;
  return out;
}

function tombstone<T extends Rec>(rec: T, now: string): T {
  // A plain delete: no deletedBy, so a 重新分群 exception (pickFamily)
  // can't bring it back.
  const out = { ...rec, deletedAt: now, updatedAt: now, rev: (rec.rev ?? 0) + 1 } as T;
  delete (out as { deletedBy?: unknown }).deletedBy;
  return out;
}

// Records with deletedAt / updatedAt / rev (entries, families, trivia).
export function rebaseRecords<T extends Rec>(
  current: readonly T[],
  backup: readonly T[],
  opts: RestoreOptions,
  counts: Counts,
  changed: T[]
): T[] {
  const live = new Map<string, T>();
  for (const b of backup) if (!b.deletedAt) live.set(b.id, b);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of current) {
    seen.add(c.id);
    const b = live.get(c.id);
    if (b) {
      if (!c.deletedAt && canonical(c) === canonical(b)) {
        out.push(c);
        continue;
      }
      out.push(restored(b, c, opts.now));
      if (c.deletedAt) counts.revived++;
      else counts.changed++;
    } else if (!c.deletedAt) {
      counts.extra++;
      if (!opts.removeExtras) {
        out.push(c);
        continue;
      }
      out.push(tombstone(c, opts.now));
    } else {
      out.push(c);
      continue;
    }
    changed.push(out[out.length - 1]);
  }
  for (const b of live.values()) {
    if (seen.has(b.id)) continue;
    out.push(restored(b, undefined, opts.now));
    counts.revived++;
    changed.push(out[out.length - 1]);
  }
  return out;
}

// ── Threads: thread fields and turns are merged separately ──────────────
// (core/store/threads.ts): thread fields by updatedAt / rev, each turn by
// max(updatedAt, deletedAt, at). So a turn is restored by stamping its
// updatedAt, and a thread by stamping the thread.

const THREAD_META = new Set([...META, "turns"]);
const TURN_META = new Set(["updatedAt", "deletedAt"]);

function restoredTurn(turn: Turn, now: string): Turn {
  const out: Turn = { ...turn, updatedAt: now };
  delete out.deletedAt;
  // Backed up mid-answer: nothing will finish it (as settleStaleTurns).
  if (out.status === "streaming") out.status = "aborted";
  return out;
}

function rebaseTurns(
  current: readonly Turn[],
  backup: readonly Turn[],
  opts: RestoreOptions,
  questions: Counts
): { turns: Turn[]; touched: boolean } {
  const live = new Map<string, Turn>();
  for (const b of backup) if (!b.deletedAt) live.set(b.id, b);
  const seen = new Set<string>();
  const turns: Turn[] = [];
  let touched = false;
  const isQ = (t: Turn) => t.role === "user";
  for (const c of current) {
    seen.add(c.id);
    const b = live.get(c.id);
    if (b) {
      if (!c.deletedAt && canonical(c, TURN_META) === canonical(b, TURN_META)) {
        turns.push(c);
        continue;
      }
      turns.push(restoredTurn(b, opts.now));
      touched = true;
      if (isQ(b)) {
        if (c.deletedAt) questions.revived++;
        else questions.changed++;
      }
    } else if (!c.deletedAt) {
      if (isQ(c)) questions.extra++;
      if (opts.removeExtras) {
        turns.push({ ...c, deletedAt: opts.now, updatedAt: opts.now });
        touched = true;
      } else turns.push(c);
    } else turns.push(c);
  }
  for (const b of live.values()) {
    if (seen.has(b.id)) continue;
    turns.push(restoredTurn(b, opts.now));
    touched = true;
    if (isQ(b)) questions.revived++;
  }
  // Same order mergeTurns keeps (by time, stable).
  turns.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
  return { turns, touched };
}

export function rebaseThreads(
  current: readonly Thread[],
  backup: readonly Thread[],
  opts: RestoreOptions,
  counts: { threads: Counts; questions: Counts },
  changed: Thread[]
): Thread[] {
  const live = new Map<string, Thread>();
  for (const b of backup) if (!b.deletedAt) live.set(b.id, b);
  const seen = new Set<string>();
  const out: Thread[] = [];
  for (const c of current) {
    seen.add(c.id);
    const b = live.get(c.id);
    if (b) {
      // A thread deleted now comes back with all of the backup's turns;
      // the current copy's turns still take part (as extras).
      const { turns, touched } = rebaseTurns(c.turns, b.turns, opts, counts.questions);
      const fieldsSame = !c.deletedAt && canonical(c, THREAD_META) === canonical(b, THREAD_META);
      if (fieldsSame && !touched) {
        out.push(c);
        continue;
      }
      out.push({ ...restored(b, c, opts.now), turns });
      if (c.deletedAt) counts.threads.revived++;
      else counts.threads.changed++;
    } else if (!c.deletedAt) {
      counts.threads.extra++;
      counts.questions.extra += c.turns.filter((t) => t.role === "user" && !t.deletedAt).length;
      if (!opts.removeExtras) {
        out.push(c);
        continue;
      }
      out.push(tombstone(c, opts.now));
    } else {
      out.push(c);
      continue;
    }
    changed.push(out[out.length - 1]);
  }
  for (const b of live.values()) {
    if (seen.has(b.id)) continue;
    // Its turns may exist as tombstones on another device: stamp them too.
    const turns = b.turns.filter((t) => !t.deletedAt).map((t) => restoredTurn(t, opts.now));
    out.push({ ...restored(b, undefined, opts.now), turns });
    counts.threads.revived++;
    counts.questions.revived += turns.filter((t) => t.role === "user").length;
    changed.push(out[out.length - 1]);
  }
  return out;
}

// ── The whole plan ───────────────────────────────────────────────────────

// A shard of the current state in the shape the plan writes it, so a
// restore can skip shards it wouldn't change (no needless sync traffic,
// and no empty files created for shards that never existed).
export function currentShard(current: Snapshot, shard: PlannedShard): unknown {
  switch (shard) {
    case "data":
      return current.data ?? emptyData();
    case "threads":
      return { threads: current.threads ?? [] };
    case "learn":
      return current.learn ?? { families: [], trivia: [] };
    case "reviews":
      return { logs: current.reviews ?? [] };
    case "imports":
      return { notes: current.imports ?? {} };
    case "files":
      return { seeded: current.files ?? {} };
  }
}

function newest(iso: string | undefined, acc: number): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? acc : Math.max(acc, t);
}

// The stamp a restore writes: now, or 1 ms past the newest stamp in the
// current state when that is ahead (another device's clock running fast),
// so the restored copies still beat every copy this device has seen.
export function restoreStamp(current: Snapshot, now: Date): string {
  let max = now.getTime();
  const recs: Rec[] = [
    ...(current.data?.entries ?? []),
    ...(current.learn?.families ?? []),
    ...(current.learn?.trivia ?? []),
    ...(current.threads ?? []),
  ];
  for (const r of recs) max = newest(r.deletedAt, newest(r.updatedAt, max));
  for (const th of current.threads ?? []) {
    for (const t of th.turns) max = newest(t.at, newest(t.deletedAt, newest(t.updatedAt, max)));
  }
  return new Date(max === now.getTime() ? max : max + 1).toISOString();
}

function emptyData(): VocabData {
  return { schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] };
}

export function planRestore(current: Snapshot, backup: Snapshot, opts: RestoreOptions): RestorePlan {
  const counts: RestoreCounts = {
    words: zero(),
    threads: zero(),
    questions: zero(),
    families: zero(),
    trivia: zero(),
    reviewsAdded: 0,
  };
  const changes: RestoreChanges = { entryIds: [], threads: [], families: [], trivia: [] };
  const changedEntries: VocabEntry[] = [];
  const shards: RestorePlan["shards"] = {};
  const missing: RestorePlan["missing"] = [];
  let data: VocabData | undefined;

  if (backup.data) {
    const cur = current.data ?? emptyData();
    // Settings stay as they are now (AI keys, flashcard options…).
    data = {
      ...cur,
      entries: rebaseRecords<VocabEntry>(cur.entries, backup.data.entries, opts, counts.words, changedEntries),
    };
    changes.entryIds = changedEntries.map((e) => e.id);
    shards.data = data;
  }

  if (backup.threads) {
    const threads = rebaseThreads(current.threads ?? [], backup.threads, opts, counts, changes.threads);
    shards.threads = { threads };
  } else missing.push("threads");

  if (backup.learn) {
    const cur: LearnShard = current.learn ?? { families: [], trivia: [] };
    shards.learn = {
      families: rebaseRecords<Family>(cur.families, backup.learn.families, opts, counts.families, changes.families),
      trivia: rebaseRecords<TriviaItem>(cur.trivia, backup.learn.trivia, opts, counts.trivia, changes.trivia),
    } satisfies LearnShard;
  } else missing.push("learn");

  if (backup.reviews) {
    const cur = current.reviews ?? [];
    // Logs older than the 90-day window would be pruned on the next load anyway.
    const logs: ReviewLog[] = pruneReviewLogs(mergeReviewLogs(cur, backup.reviews), new Date(opts.now));
    const had = new Set(cur.map((l) => l.id));
    counts.reviewsAdded = logs.filter((l) => !had.has(l.id)).length;
    shards.reviews = { logs };
  } else missing.push("reviews");

  if (backup.imports) shards.imports = { notes: { ...backup.imports, ...(current.imports ?? {}) } };
  if (backup.files) shards.files = { seeded: { ...backup.files, ...(current.files ?? {}) } };

  return { shards, data, counts, missing, changes };
}
