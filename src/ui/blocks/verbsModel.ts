import type { VocabEntry } from "../../core/model/entry";
import { POS_KEYS, usagesOf, type PosKey, type UsageBlock } from "../../core/model/usage";
import { datesText, recordDates } from "../kit/dates";
import { parseBlockParams } from "./params";

// View-models for the vocab-verbs block (規劃書 06 §7.3, screen L6; wave 8
// U2 — 用法總表, any part of speech, 1006-2 回饋 #22). Pure — no "obsidian"
// import — so it's unit-tested.

export interface VerbsParams {
  // Single-verb mode (word page): just this verb's usage, no list.
  word?: string;
}

export function parseVerbsParams(source: string): VerbsParams {
  const p = parseBlockParams(source);
  const word = (p.word ?? p.verb ?? "").trim().replace(/^["']|["']$/g, "").trim();
  return word ? { word } : {};
}

// 「篩選動詞…」: substring match on the word or its Chinese gloss.
export function filterVerbs(verbs: readonly VocabEntry[], query: string): VocabEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...verbs];
  return verbs.filter((e) => e.word.toLowerCase().includes(q) || (e.definitionZh ?? "").toLowerCase().includes(q));
}

// Keeps the selection while it's still listed; otherwise the first row.
// Wave 8 U2 (1006-2 #22): the list itself is already filtered to entries
// with some usage (entriesWithUsage() below), so a "prefer one with
// usage" tie-break is no longer needed here.
export function pickVerb(verbs: readonly VocabEntry[], current: string | undefined): string | undefined {
  if (current && verbs.some((e) => e.id === current)) return current;
  return verbs[0]?.id;
}

// 「用法」總表's base list (1006-2 #22): only words with a usage block for
// some part of speech — not just verbs any more (usagesOf() merges the
// legacy single-block `usage` field under "v").
export function entriesWithUsage(entries: readonly VocabEntry[]): VocabEntry[] {
  return entries.filter((e) => Object.keys(usagesOf(e)).length > 0);
}

// The parts of speech actually present among `entries`' usage blocks, in
// POS_KEYS order — what the pos chip row offers (1006-2 #22: "只顯示目前
// 列表裡有出現的詞性").
export function posChipsIn(entries: readonly VocabEntry[]): PosKey[] {
  const present = new Set<PosKey>();
  for (const e of entries) for (const pos of Object.keys(usagesOf(e))) present.add(pos as PosKey);
  return POS_KEYS.filter((k) => present.has(k));
}

// Pos-chip filter (1006-2 #22): a word only needs one lit ("active") part
// of speech with a usage block to stay in the list — not all of them.
export function filterByActivePos(entries: readonly VocabEntry[], active: ReadonlySet<PosKey>): VocabEntry[] {
  return entries.filter((e) => Object.keys(usagesOf(e)).some((pos) => active.has(pos as PosKey)));
}

// "eng/Cadence_Gao_School_Speech_Transcript.md" → "Cadence_Gao_School_Speech_Transcript".
export function noteName(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "") || undefined;
}

// 「10/02」 in local time; undefined for an unparseable stamp.
export function shortDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// 「/ˈʃʊɡ.ə.kəʊt/ · verb」 — the phonetic gets slashes unless it has them.
export function phoneticLine(e: Pick<VocabEntry, "phonetic" | "partOfSpeech">): string {
  const parts: string[] = [];
  const ph = (e.phonetic ?? "").trim();
  if (ph) parts.push(/^[/[]/.test(ph) ? ph : `/${ph}/`);
  const pos = (e.partOfSpeech ?? "").trim();
  if (pos) parts.push(pos);
  return parts.join(" · ");
}

export interface UsageMeta {
  source?: string;
  date?: string;
}

// 「出自 Cadence_Gao_School_Speech_Transcript · 10/02 由 AI 產生」.
export function usageMeta(e: Pick<VocabEntry, "source">, usage: UsageBlock | undefined): UsageMeta {
  const out: UsageMeta = {};
  const source = noteName(e.source?.path);
  if (source) out.source = source;
  const date = shortDate(usage?.generatedAt);
  if (date) out.date = date;
  return out;
}

// Usage blocks from older AI output may lack pieces; keep only rows that
// say something.
export function usageRows(usage: UsageBlock): { patterns: UsageBlock["patterns"]; related: UsageBlock["related"] } {
  return {
    patterns: (usage.patterns ?? []).filter((p) => p.pattern?.trim() || p.meaningZh?.trim() || p.example?.trim()),
    related: (usage.related ?? []).filter((r) => r.phrase?.trim()),
  };
}

// 「加入 10/02 · 更新 10/05」: when the verb first got usage, and the latest
// 重新產生 (only when it's another day). "" without usage.
export function usageDates(usage: Pick<UsageBlock, "createdAt" | "generatedAt"> | undefined, now: Date = new Date()): string {
  if (!usage) return "";
  return datesText(recordDates({ createdAt: usage.createdAt ?? usage.generatedAt, updatedAt: usage.generatedAt }, now));
}
