import { ASK_SURFACES, ASK_TEXT_MAX } from "../model/learner";
import type { AskEvent, AskSurface } from "../model/learner";
import { pairTurns } from "../model/thread";
import type { Anchor, Thread, Turn } from "../model/thread";

// AI asks log (規劃書 15 §2.1). The same builder serves the live hook
// (ThreadService.ask) and the one-time backfill from threads.json, so both
// produce identical events. Pure.

export function truncateAsk(text: string | undefined): string | undefined {
  const s = text?.trim();
  if (!s) return undefined;
  return [...s].slice(0, ASK_TEXT_MAX).join("");
}

// `surface` is the task registry's surface when the caller has it; otherwise
// the task id's prefix ("paragraph.translate" → paragraph, "dna.*" → morpheme).
export function askSurfaceOf(taskId: string, surface?: string): AskSurface {
  const raw = surface ?? taskId.split(".")[0];
  if (ASK_SURFACES.includes(raw as AskSurface)) return raw as AskSurface;
  if (raw === "note") return "paragraph"; // 1030 #4: a whole-note discussion is reading too
  return raw === "dna" ? "morpheme" : "other";
}

export function buildAskEvent(user: Turn, answer: Turn | undefined, anchor: Anchor, surface?: string): AskEvent {
  const taskId = user.taskId ?? "";
  const e: AskEvent = {
    id: user.id,
    at: user.at,
    surface: askSurfaceOf(taskId, surface),
    taskId,
    custom: taskId.endsWith(".custom") || taskId.endsWith(".followup") || !!user.question?.trim(),
    ok: answer?.status === "done",
  };
  const entryId = user.subjectEntryId ?? (anchor.kind === "word" ? anchor.entryId : undefined);
  if (entryId) e.entryId = entryId;
  if (anchor.kind === "paragraph" || anchor.kind === "note") e.path = anchor.path;
  const selection = truncateAsk(user.selection);
  if (selection) e.selection = selection;
  const question = truncateAsk(user.question);
  if (question) e.question = question;
  return e;
}

// Every user turn, tombstoned ones included (a deleted Q&A was still asked).
export function asksFromThreads(threads: readonly Thread[], surfaceOf?: (taskId: string) => string | undefined): AskEvent[] {
  const out: AskEvent[] = [];
  for (const th of threads) {
    for (const pair of pairTurns(th.turns)) {
      const id = pair.user.taskId;
      out.push(buildAskEvent(pair.user, pair.assistant, th.anchor, id ? surfaceOf?.(id) : undefined));
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
}
