import type { VocabData } from "../../core/model/entry";
import type { ReviewLog } from "../../core/model/srs";
import type { Thread } from "../../core/model/thread";
import { migrate } from "../../core/migrations";
import { normalizeLearnShard, type LearnShard } from "../learn/learnMerge";

// Backup files in the plugin's backup/ folder.
//
// Two kinds exist:
// - "data": a bare data.json. The v1 → v2 migration writes these once
//   (`data-v1-<time>.json`, core/migrations/loadMigrated.ts →
//   ObsidianStorage.backup) — the only backups older versions ever made,
//   so they hold the word list only (v1 had no store/ shards). A copy of
//   data.json dropped into the folder by hand reads the same way.
// - "full": written by this service (立即備份, and automatically right
//   before every restore): data.json plus every store/ shard, in one file
//   so a half-synced backup can't pair one moment's words with another
//   moment's threads.

export const FULL_BACKUP_FORMAT = 1;

// Shards a restore knows how to bring back. usage.json (AI token use per
// device and day) is backed up but never restored: rolling it back would
// only hide money already spent from the usage cap.
export const RESTORABLE_SHARDS = ["threads", "learn", "reviews", "imports", "files"] as const;
export type RestorableShard = (typeof RESTORABLE_SHARDS)[number];

export type BackupReason = "manual" | "before-restore" | "migration" | "unknown";

export interface FullBackupFile {
  vocabTrackerBackup: typeof FULL_BACKUP_FORMAT;
  createdAt: string;
  reason: Exclude<BackupReason, "migration" | "unknown">;
  // The backup being restored, for a "before-restore" one.
  restoring?: string;
  // Shard name → its parsed content; null = the file didn't exist then
  // (so it was empty, which a restore treats as "nothing", not "unknown").
  shards: Record<string, unknown>;
}

// What a backup (or the current disk) holds, normalized. For a backup, an
// undefined field means "this backup doesn't include it" — a restore then
// leaves that part as it is now.
export interface Snapshot {
  data?: VocabData;
  threads?: Thread[];
  learn?: LearnShard;
  reviews?: ReviewLog[];
  imports?: Record<string, string>;
  files?: Record<string, string>;
}

export interface ParsedBackup {
  kind: "full" | "data";
  createdAt: string | null;
  reason: BackupReason;
  snapshot: Snapshot;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function stringMap(v: unknown): Record<string, string> {
  if (!isObject(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
  return out;
}

function arrayField<T>(shard: unknown, key: string): T[] {
  const v = isObject(shard) ? shard[key] : undefined;
  return Array.isArray(v) ? (v as T[]) : [];
}

// A data.json shape (v1 or v2) → v2. Null for anything else.
export function parseData(raw: unknown): VocabData | null {
  if (!isObject(raw) || !Array.isArray(raw.entries)) return null;
  return migrate(raw).data;
}

// Shards as they sit on disk (StoragePort names) → Snapshot. A name in
// `shards` with a null / unreadable value counts as present but empty.
export function snapshotOf(shards: Record<string, unknown>): Snapshot {
  const out: Snapshot = {};
  if ("data" in shards) out.data = parseData(shards.data) ?? { schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] };
  if ("threads" in shards) out.threads = arrayField<Thread>(shards.threads, "threads");
  if ("learn" in shards) out.learn = normalizeLearnShard(shards.learn);
  if ("reviews" in shards) out.reviews = arrayField<ReviewLog>(shards.reviews, "logs");
  if ("imports" in shards) out.imports = stringMap(isObject(shards.imports) ? shards.imports.notes : undefined);
  if ("files" in shards) out.files = stringMap(isObject(shards.files) ? shards.files.seeded : undefined);
  return out;
}

// ── File names ──────────────────────────────────────────────────────────

// "2026-10-05T12:34:56.789Z" → "2026-10-05T12-34-56.789Z": no colons, so
// the name is valid on Windows / iOS too (same as the migration backup).
export function fileStamp(iso: string): string {
  return iso.replace(/:/g, "-");
}

export function fullBackupName(iso: string, reason: FullBackupFile["reason"]): string {
  return `full-${fileStamp(iso)}-${reason}.json`;
}

// The time in a backup's file name, as ISO; null when there is none.
export function stampFromName(name: string): string | null {
  const m = /(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)(\.\d+)?Z/.exec(name);
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}${m[5] ?? ""}Z`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

// Only plain file names: no folders, no "..".
export function isBackupName(name: string): boolean {
  return /^[\w.-]+\.json$/.test(name) && !name.includes("..");
}

// ── Parsing ─────────────────────────────────────────────────────────────

function isFullBackup(raw: unknown): raw is FullBackupFile {
  return isObject(raw) && raw.vocabTrackerBackup === FULL_BACKUP_FORMAT && isObject(raw.shards);
}

export function parseBackup(name: string, raw: unknown): ParsedBackup | null {
  if (isFullBackup(raw)) {
    const reason = raw.reason === "manual" || raw.reason === "before-restore" ? raw.reason : "unknown";
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : stampFromName(name);
    // A full backup without data.json would restore nothing worth having.
    if (!("data" in raw.shards)) return null;
    return { kind: "full", createdAt, reason, snapshot: snapshotOf(raw.shards) };
  }
  const data = parseData(raw);
  if (!data) return null;
  return {
    kind: "data",
    createdAt: stampFromName(name),
    reason: name.startsWith("data-v1-") ? "migration" : "unknown",
    snapshot: { data },
  };
}

// The file a full backup writes: current shards, with every restorable
// shard that has no file recorded as null (= empty then).
export function fullBackupFile(
  shards: Record<string, unknown>,
  createdAt: string,
  reason: FullBackupFile["reason"],
  restoring?: string
): FullBackupFile {
  const all: Record<string, unknown> = { data: null };
  for (const name of RESTORABLE_SHARDS) all[name] = null;
  Object.assign(all, shards);
  const file: FullBackupFile = { vocabTrackerBackup: FULL_BACKUP_FORMAT, createdAt, reason, shards: all };
  if (restoring) file.restoring = restoring;
  return file;
}

// ── Summary (the list in settings) ──────────────────────────────────────

export interface BackupSummary {
  words: number;
  // Discussions with at least one question, and the questions in them.
  threads?: number;
  questions?: number;
  families?: number;
  trivia?: number;
  reviews?: number;
  // Live word-DNA morphemes (規劃書 09 §2 決定 1) — excludes tombstones and
  // records a multi-device merge redirected (mergedInto) to a canonical
  // duplicate, so this counts distinct morphemes, not raw records.
  morphemes?: number;
}

export function liveQuestions(thread: Thread): number {
  if (thread.deletedAt) return 0;
  return thread.turns.filter((t) => t.role === "user" && !t.deletedAt).length;
}

export function summarize(s: Snapshot): BackupSummary {
  const out: BackupSummary = { words: (s.data?.entries ?? []).filter((e) => !e.deletedAt).length };
  if (s.threads) {
    const asked = s.threads.map(liveQuestions).filter((n) => n > 0);
    out.threads = asked.length;
    out.questions = asked.reduce((a, b) => a + b, 0);
  }
  if (s.learn) {
    out.families = s.learn.families.filter((f) => !f.deletedAt).length;
    out.trivia = s.learn.trivia.filter((t) => !t.deletedAt).length;
    out.morphemes = (s.learn.morphemes ?? []).filter((m) => !m.deletedAt && !m.mergedInto).length;
  }
  if (s.reviews) out.reviews = s.reviews.length;
  return out;
}
