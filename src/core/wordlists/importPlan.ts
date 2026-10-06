import type { VocabEntry } from "../model/entry";
import type { ScanHit } from "./scan";

// Adds labels to a VocabEntry.level string (comma-separated, free-form —
// "多益中級, TOEFL") without duplicating ones already there, in any case.
export function mergeLevel(level: string, labels: readonly string[]): string {
  const parts = level.split(",").map((t) => t.trim()).filter(Boolean);
  const have = new Set(parts.map((p) => p.toLowerCase()));
  for (const label of labels) {
    if (!have.has(label.toLowerCase())) {
      parts.push(label);
      have.add(label.toLowerCase());
    }
  }
  return parts.join(", ");
}

// Markdown syntax that rides along on a raw note line ("- **Data** is…").
export function cleanSentence(text: string): string {
  return text
    .replace(/^\s*(#{1,6}\s+|>\s*)+/, "")
    .replace(/^\s*([-*+]\s+(\[.\]\s+)?|\d+[.)]\s+)/, "")
    .replace(/(\*\*|__|==|~~|\*|_)(?=\S)|(?<=\S)(\*\*|__|==|~~|\*|_)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface NewWord {
  word: string;
  level: string;
  line: number;
  example: string;
}

export interface ImportPlan {
  create: NewWord[];
  // Entries already tracked that get the exam labels added to their level.
  retag: { entry: VocabEntry; level: string }[];
}

// What planImport() needs to know about the vocab list for one word, without
// caring how that lookup is built: a plain one-shot Map (buildEntryLookup(),
// for tests and anything not scan-hot) or a cached, incrementally-rebuilt
// index (services/wordlists/EntryWordIndex, for the real "scan every note
// open" path — see #25 below).
export interface EntryLookup {
  // The live (non-deleted) entry for a word, case-insensitive.
  live(word: string): VocabEntry | undefined;
  // The most recently deleted entry for a word (deletedAt compares as
  // ISO strings), if nothing live exists for it. Undefined when the word
  // has never been tracked at all.
  latestTombstone(word: string): VocabEntry | undefined;
}

// Builds a plain, one-shot EntryLookup — O(entries) once, then O(1) per
// word. Fine for tests or a one-off call; the real per-note-scan path
// (main.ts importExamWords(), run on every note open) uses
// services/wordlists/EntryWordIndex instead so it isn't rebuilding this
// Map from potentially thousands of entries on every scan (#25 below).
export function buildEntryLookup(entries: readonly VocabEntry[]): EntryLookup {
  const byWord = new Map<string, VocabEntry[]>();
  for (const e of entries) {
    const key = e.word.trim().toLowerCase();
    if (!key) continue;
    const list = byWord.get(key);
    if (list) list.push(e);
    else byWord.set(key, [e]);
  }
  const forWord = (word: string) => byWord.get(word.trim().toLowerCase());
  return {
    live: (word) => forWord(word)?.find((e) => !e.deletedAt),
    latestTombstone: (word) => {
      let latest: VocabEntry | undefined;
      for (const e of forWord(word) ?? []) {
        if (!e.deletedAt) continue;
        if (!latest || e.deletedAt > (latest.deletedAt ?? "")) latest = e;
      }
      return latest;
    },
  };
}

// 刪掉過的考試字重新加回單字庫前，要給 R 的「取消 like 刪除」留一段復原的
// 空檔——那個刪除走 ui/kit/undoable.ts 的 runUndoable()，大約 6 秒內使用者
// 可能按「復原」。在那個視窗內把字重建成新 entry，使用者按下復原時，
// VocabStore.restoreEntry() 把舊 entry 救回來，加上剛剛重建的那筆，就會
// 冒出兩筆同一個字（1006report.md #25，跟 R 的約定）。6 秒再加一點餘裕。
export const REIMPORT_UNDO_WINDOW_MS = 10_000;

export interface PlanImportOptions {
  // Date.now() 風格的毫秒時間戳；跟 tombstone 的 deletedAt 比較用。
  now: number;
  undoWindowMs?: number;
}

// Decides what a note's scan adds to the vocab list (規格 #25 改版):
// - A word with a live entry just gets retagged (existing #behaviour).
// - A word with no live entry, and either never tracked or only tombstoned
//   well outside the undo window, gets a brand-new entry created — even if
//   it was deleted before. The tombstone is left alone (不復活), so a
//   user who deliberately deleted it can delete the recreated one again.
// - A word whose only tombstone is still inside the undo window is left
//   alone this pass (see REIMPORT_UNDO_WINDOW_MS above) — the next scan
//   (next time the note is opened, or a manual rescan) will pick it up if
//   it's still missing by then.
export function planImport(
  hits: readonly ScanHit[],
  lookup: EntryLookup,
  labelsOf: (tags: readonly string[]) => string[],
  opts: PlanImportOptions
): ImportPlan {
  const plan: ImportPlan = { create: [], retag: [] };
  for (const hit of hits) {
    const labels = labelsOf(hit.tags);
    if (labels.length === 0) continue;

    const live = lookup.live(hit.word);
    if (live) {
      const level = mergeLevel(live.level, labels);
      if (level !== live.level) plan.retag.push({ entry: live, level });
      continue;
    }

    const dead = lookup.latestTombstone(hit.word);
    if (dead) {
      const deletedMs = Date.parse(dead.deletedAt ?? "");
      if (!Number.isNaN(deletedMs) && opts.now - deletedMs < (opts.undoWindowMs ?? REIMPORT_UNDO_WINDOW_MS)) continue;
    }
    plan.create.push({ word: hit.word, level: labels.join(", "), line: hit.line, example: cleanSentence(hit.sentence) });
  }
  return plan;
}
