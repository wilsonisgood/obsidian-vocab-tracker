import { liveTurns, type Thread } from "../../core/model/thread";
import { plainParagraph, splitParagraphSpans, type ParagraphSpan } from "../../core/text/paragraphs";
import { resolveIn, type ParagraphAnchor } from "../../services/anchors/ParagraphAnchorService";
import { questionCount } from "../../services/anchors/ParagraphIndex";

// Rows of the This note tab's 「段落討論（n）」 list (規劃書 06 §9.4, D1):
// in the order the paragraphs appear in the note, orphans last. Pure, so
// ordering and orphan marking are unit-tested; ParagraphThreadList.ts
// draws them.

export interface ParagraphRow {
  threadId: string;
  // 1-based ¶ number, counted the way prompts and 「出自 ¶12」 count
  // (core/text/paragraphs.ts). Null for an orphan.
  number: number | null;
  // The paragraph as it reads now (orphans: the text saved when the
  // discussion started).
  preview: string;
  // Distinct quick-action labels used, in first-use order (task label keys,
  // translated by the caller).
  labels: string[];
  count: number;
  // When the last turn was added.
  lastAt?: string;
  createdAt?: string;
  orphan: boolean;
  // The paragraph was edited since the discussion started (「原文已修改」).
  edited: boolean;
  // Anchored by text hash only (hash mode, or a failed block id write):
  // editing the paragraph will orphan it.
  hashOnly: boolean;
  // Sort key: the paragraph's first line, -1 for orphans.
  line: number;
}

// Index of the span a section starts in — the same count paragraphInput
// uses for the prompt's ¶ number (spans entirely before the section).
export function paragraphNumberAt(spans: readonly ParagraphSpan[], lineStart: number): number {
  return spans.filter((s) => s.lineEnd < lineStart).length + 1;
}

export function lastTurnAt(thread: Thread): string | undefined {
  const turns = liveTurns(thread);
  return turns.length ? turns[turns.length - 1].at : thread.createdAt;
}

export function taskLabelKeys(thread: Thread, labelOf: (taskId: string) => string | undefined): string[] {
  const out: string[] = [];
  for (const turn of liveTurns(thread)) {
    if (turn.role !== "user" || !turn.taskId) continue;
    const label = labelOf(turn.taskId);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

// `content` is the note's current text; null when the note is gone (every
// thread is then an orphan).
export function paragraphRows(
  threads: readonly Thread[],
  content: string | null,
  labelOf: (taskId: string) => string | undefined
): ParagraphRow[] {
  const spans = content === null ? [] : splitParagraphSpans(content);
  const rows: ParagraphRow[] = [];
  for (const thread of threads) {
    if (thread.deletedAt || thread.anchor.kind !== "paragraph") continue;
    const anchor = thread.anchor as ParagraphAnchor;
    const where = content === null ? null : resolveIn(content, anchor);
    const base = {
      threadId: thread.id,
      labels: taskLabelKeys(thread, labelOf),
      count: questionCount(thread),
      lastAt: lastTurnAt(thread),
      createdAt: thread.createdAt,
      hashOnly: !anchor.blockId,
    };
    if (where?.status === "found") {
      rows.push({
        ...base,
        number: paragraphNumberAt(spans, where.section.lineStart),
        preview: plainParagraph(where.section.text),
        orphan: false,
        edited: where.edited,
        line: where.section.lineStart,
      });
    } else {
      rows.push({ ...base, number: null, preview: anchor.snapshot, orphan: true, edited: false, line: -1 });
    }
  }
  return rows.sort(compareRows);
}

// Found rows by position in the note (ties: older discussion first), then
// orphans, most recently active first.
export function compareRows(a: ParagraphRow, b: ParagraphRow): number {
  if (a.orphan !== b.orphan) return a.orphan ? 1 : -1;
  if (!a.orphan && a.line !== b.line) return a.line - b.line;
  if (a.orphan) return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
  return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.threadId.localeCompare(b.threadId);
}

// Paragraph threads whose note no longer exists — listed under the All tab
// (§4.6: a deleted article's discussions stay until the user decides).
export function threadsWithMissingNote(threads: readonly Thread[], exists: (path: string) => boolean): Thread[] {
  return threads
    .filter((th) => !th.deletedAt && th.anchor.kind === "paragraph" && !exists(th.anchor.path))
    .sort((a, b) => (lastTurnAt(b) ?? "").localeCompare(lastTurnAt(a) ?? ""));
}

// "10/03" — the same short date ChatPanel's meta line uses.
export function shortDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
