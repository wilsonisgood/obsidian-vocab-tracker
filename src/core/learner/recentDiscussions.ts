import { liveTurns, type Thread } from "../model/thread";
import { noteTitle } from "../practice/paraphrase";
import { taskName } from "./reportMarkdown";

// The learner's latest AI discussions (words, paragraphs, trivia, DNA) for
// the learning buddy's background: what was asked and highlighted, never
// the answers. Buddy chats themselves and deleted rounds are left out.

export const RECENT_DISCUSSION_DAYS = 14;
export const RECENT_DISCUSSION_MAX = 20;
const TEXT_MAX = 120;
const DAY_MS = 86_400_000;

const flat = (s: string) => s.replace(/\s+/g, " ").trim();
function clip(s: string): string {
  const chars = [...flat(s)];
  return chars.length > TEXT_MAX ? `${chars.slice(0, TEXT_MAX).join("")}…` : chars.join("");
}
function mmdd(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function subjectOf(th: Thread, subjectEntryId: string | undefined, wordOf: (entryId: string) => string | undefined): string {
  const a = th.anchor;
  if (a.kind === "word") return wordOf(a.entryId) ?? "";
  if (a.kind === "paragraph") return `「${noteTitle(a.path)}」的段落`;
  if (a.kind === "trivia-session") return subjectEntryId ? (wordOf(subjectEntryId) ?? "") : "";
  return "";
}

// One line per question, newest first; [] when nothing in the window.
export function recentDiscussions(
  threads: readonly Thread[],
  wordOf: (entryId: string) => string | undefined,
  now: Date,
  opts: { days?: number; max?: number } = {}
): string[] {
  const since = now.getTime() - (opts.days ?? RECENT_DISCUSSION_DAYS) * DAY_MS;
  const rows: { at: number; line: string }[] = [];
  for (const th of threads) {
    if (th.deletedAt || th.anchor.kind === "buddy") continue;
    for (const turn of liveTurns(th)) {
      if (turn.role !== "user") continue;
      const at = Date.parse(turn.at);
      if (Number.isNaN(at) || at < since) continue;
      const subject = subjectOf(th, turn.subjectEntryId, wordOf);
      const parts = [`${mmdd(turn.at)} ${turn.taskId ? taskName(turn.taskId) : "提問"}${subject ? `｜${subject}` : ""}`];
      if (turn.selection?.trim()) parts.push(`選了「${clip(turn.selection)}」`);
      if (turn.question?.trim()) parts.push(`問：${clip(turn.question)}`);
      rows.push({ at, line: `- ${parts.join("｜")}` });
    }
  }
  rows.sort((a, b) => b.at - a.at);
  return rows.slice(0, opts.max ?? RECENT_DISCUSSION_MAX).map((r) => r.line);
}
