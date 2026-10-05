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

// Decides what a note's scan adds to the vocab list. `entries` must include
// tombstones: a word the user deleted stays deleted rather than coming back
// the next time a note mentions it.
export function planImport(
  hits: readonly ScanHit[],
  entries: readonly VocabEntry[],
  labelsOf: (tags: readonly string[]) => string[]
): ImportPlan {
  const byWord = new Map<string, VocabEntry>();
  for (const e of entries) {
    const key = e.word.toLowerCase();
    // Prefer a live entry over a tombstone for the same word.
    if (!byWord.has(key) || byWord.get(key)!.deletedAt) byWord.set(key, e);
  }

  const plan: ImportPlan = { create: [], retag: [] };
  for (const hit of hits) {
    const labels = labelsOf(hit.tags);
    if (labels.length === 0) continue;
    const existing = byWord.get(hit.word);
    if (!existing) {
      plan.create.push({ word: hit.word, level: labels.join(", "), line: hit.line, example: cleanSentence(hit.sentence) });
      continue;
    }
    if (existing.deletedAt) continue;
    const level = mergeLevel(existing.level, labels);
    if (level !== existing.level) plan.retag.push({ entry: existing, level });
  }
  return plan;
}
