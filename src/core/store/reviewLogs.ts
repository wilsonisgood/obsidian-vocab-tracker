import type { ReviewLog } from "../model/srs";

// store/reviews.json keeps a rolling window, not full history: the logs
// only feed the daily new-card cap and the "done" summary, and an
// unbounded log would grow forever on a synced vault (規劃書 06 §4.2).
export const REVIEW_LOG_RETENTION_DAYS = 90;

// ReviewLogs are immutable, so merging two devices' copies is a plain
// union by id (規劃書 06 §4.3) — no updatedAt/rev resolution like entries.
// Sorted by time so "today's logs" and pruning can scan in order.
export function mergeReviewLogs(a: readonly ReviewLog[], b: readonly ReviewLog[]): ReviewLog[] {
  const byId = new Map<string, ReviewLog>();
  for (const log of a) byId.set(log.id, log);
  for (const log of b) if (!byId.has(log.id)) byId.set(log.id, log);
  return [...byId.values()].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
}

export function pruneReviewLogs(
  logs: readonly ReviewLog[],
  now: Date,
  days = REVIEW_LOG_RETENTION_DAYS
): ReviewLog[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return logs.filter((log) => new Date(log.at).getTime() >= cutoff);
}

// Logs never change once written, so which ones exist is all a merge can
// change. SrsService.reloadLogs() writes back only when this differs from
// the synced copy's.
export function reviewLogsFingerprint(logs: readonly ReviewLog[]): string {
  return logs
    .map((l) => l.id)
    .sort()
    .join("\n");
}
