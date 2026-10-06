import type { VocabEntry } from "../../core/model/entry";
import type { Thread, Turn } from "../../core/model/thread";
import { entryAddedMs } from "../ai/context/triviaContext";

// Which word the next trivia is about (規劃書 06 §7.4): words added in the
// last 14 days first, never one of the last 30 subjects, otherwise random.
// Pure; `random` is injected so tests are deterministic.

export const RECENT_DAYS = 14;
export const EXCLUDE_LAST = 30;
// 「優先」 as a weight rather than a hard filter: with hundreds of words
// imported from a word list in one go, a hard filter would keep older
// words out of trivia for two weeks.
export const RECENT_WEIGHT = 0.7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PickOptions {
  now: Date;
  random: () => number;
  recentDays?: number;
  excludeLast?: number;
  recentWeight?: number;
}

// Trivia rounds (not follow-ups, not failed answers), newest first, as
// [assistant turn, its question].
export function triviaRounds(thread: Thread | undefined): { answer: Turn; question?: Turn }[] {
  if (!thread) return [];
  const live = thread.turns.filter((t) => !t.deletedAt);
  const out: { answer: Turn; question?: Turn }[] = [];
  for (let i = live.length - 1; i >= 0; i--) {
    const t = live[i];
    if (t.role !== "assistant" || t.status === "error") continue;
    if (!t.taskId?.startsWith("trivia.") || t.taskId === "trivia.followup") continue;
    const q = live[i - 1];
    out.push({ answer: t, question: q?.role === "user" ? q : undefined });
  }
  return out;
}

// The subject of an assistant turn: stored on the answer, or on its question.
export function subjectOf(thread: Thread | undefined, turn: Turn): string | undefined {
  if (turn.subjectEntryId) return turn.subjectEntryId;
  if (!thread) return undefined;
  const i = thread.turns.indexOf(turn);
  for (let j = i - 1; j >= 0; j--) {
    const prev = thread.turns[j];
    if (prev.deletedAt) continue;
    return prev.role === "user" ? prev.subjectEntryId : undefined;
  }
  return undefined;
}

// Subjects of the last `n` trivia rounds, newest first (may repeat).
export function recentSubjects(thread: Thread | undefined, n = EXCLUDE_LAST): string[] {
  const out: string[] = [];
  for (const r of triviaRounds(thread).slice(0, n)) {
    const id = r.answer.subjectEntryId ?? r.question?.subjectEntryId;
    if (id) out.push(id);
  }
  return out;
}

// 規格 #24: 隨機挑字只從 like 的字挑 — 否則一個考試字表匯進幾百個還沒學的
// 字，大多數時候都在講使用者根本沒在學的字。`ask(kind, { entryId })` 明確
// 指定某個字時不經過這裡（見 TriviaService.ask），所以「從單字頁來一則」
// 不受影響。
export function pickSubject(
  entries: readonly VocabEntry[],
  recent: readonly string[],
  opts: PickOptions
): VocabEntry | undefined {
  const live = entries.filter((e) => !e.deletedAt && e.word.trim() && e.liked === true);
  if (!live.length) return undefined;

  const excluded = new Set(recent.slice(0, opts.excludeLast ?? EXCLUDE_LAST));
  const candidates = live.filter((e) => !excluded.has(e.id));
  if (!candidates.length) {
    // Every word was a recent subject (a small list): take the one told
    // longest ago.
    const lastTold = (e: VocabEntry) => recent.indexOf(e.id);
    return [...live].sort((a, b) => lastTold(b) - lastTold(a))[0];
  }

  const since = opts.now.getTime() - (opts.recentDays ?? RECENT_DAYS) * DAY_MS;
  const fresh = candidates.filter((e) => entryAddedMs(e) >= since);
  const older = candidates.filter((e) => entryAddedMs(e) < since);
  let pool: VocabEntry[];
  if (!fresh.length) pool = older;
  else if (!older.length) pool = fresh;
  else pool = opts.random() < (opts.recentWeight ?? RECENT_WEIGHT) ? fresh : older;

  const i = Math.min(pool.length - 1, Math.floor(opts.random() * pool.length));
  return pool[i];
}
