import { stripSuggestions } from "./buddySuggestions";
import type { Digest } from "./buddyDigest";
import type { ArchivePair } from "./buddyGroups";
import { clip } from "./recentDiscussions";
import type { Turn } from "../model/thread";

// 對話整理成筆記: one note per day, every tidy-up of a conversation adds a
// section to it. Pure; ThreadService does the I/O.

export const SHARE_TASK_ID = "buddy.share";
export const CUSTOM_TASK_ID = "buddy.custom";
const ANSWER_FOR_AI_MAX = 1500;

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ── what the 「你」 line says ──

export type EntryKind = "typed" | "share" | "button";

// A quick button (not typed): a share, or a fixed topic without question text.
export function turnKind(turn: Turn): EntryKind {
  if (turn.taskId === SHARE_TASK_ID) return "share";
  if (turn.taskId !== CUSTOM_TASK_ID && !turn.question?.trim()) return "button";
  return "typed";
}

export interface ArchiveEntry {
  at: string;
  kind: EntryKind;
  // The learner's own words, or the parenthetical describing the button.
  you: string;
  // Share only: what the buddy picked (word, or 〈title〉 for a paragraph).
  subject?: string;
  skipped: boolean;
  answer: string;
}

function pickedText(subject: string | undefined, skipped: boolean): string {
  const tail = skipped ? " · 略過" : "";
  if (!subject) return "（夥伴邀他聊聊最近讀了什麼）";
  return subject.startsWith("〈") ? `（夥伴挑了${subject}那段${tail}）` : `（夥伴挑了 **${subject}**${tail}）`;
}

// `next`: the user turn right after the last pair (for the skip check).
export function buildEntries(
  pairs: readonly ArchivePair[],
  next: Turn | undefined,
  labelOf: (taskId: string) => string | undefined
): ArchiveEntry[] {
  return pairs.map((p, i) => {
    const turn = p.user;
    const kind = turnKind(turn);
    const following = i + 1 < pairs.length ? pairs[i + 1].user : next;
    // A pick the learner moved past with another button, never answering it.
    const skipped = kind === "share" && !!following && turnKind(following) !== "typed";
    const answer = stripSuggestions(p.assistant.content).trim();
    let you: string;
    if (kind === "share") you = pickedText(turn.shareSubject, skipped);
    else if (kind === "button") you = `（點了「${labelOf(turn.taskId ?? "") ?? turn.content}」）`;
    else you = turn.question?.trim() || turn.content;
    return { at: turn.at, kind, you, ...(turn.shareSubject ? { subject: turn.shareSubject } : {}), skipped, answer };
  });
}

// The conversation as the digest task reads it.
export function digestConversation(entries: readonly ArchiveEntry[]): string {
  return entries
    .map((e) => {
      const lines = [`你：${e.you}`];
      if (!e.skipped) lines.push(`夥伴：${clip(e.answer, ANSWER_FOR_AI_MAX)}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

// ── words ──

const BOLD_ENGLISH = /\*\*([A-Za-z][A-Za-z'-]{1,30})\*\*/g;

// Without the AI: words the buddy picked, plus single English words it put
// in bold, kept when they are in the learner's list.
export function fallbackWords(entries: readonly ArchiveEntry[], isSaved: (word: string) => boolean): string[] {
  const out: string[] = [];
  const add = (w: string) => {
    const word = w.trim();
    if (word && !out.some((x) => x.toLowerCase() === word.toLowerCase()) && isSaved(word)) out.push(word);
  };
  for (const e of entries) {
    if (e.subject && !e.subject.startsWith("〈")) add(e.subject);
    for (const m of e.answer.matchAll(BOLD_ENGLISH)) add(m[1]);
  }
  return out;
}

// ── note ──

export function archiveNoteId(day: string): string {
  return `buddy-day-${day}`;
}
export function archiveFileName(day: string): string {
  return `Buddy-${day}.md`;
}
export function archivePath(folder: string, day: string): string {
  const dir = folder.replace(/\/+$/, "");
  return `${dir ? `${dir}/` : ""}${archiveFileName(day)}`;
}
export function batchMarker(threadId: string, start: number): string {
  return `<!-- buddy-batch:${threadId}:${start} -->`;
}

export type WordLink = (word: string) => string | null;

function link(word: string, wordLink: WordLink | undefined): string {
  const path = wordLink?.(word);
  return path ? `[[${path.replace(/\.md$/i, "")}|${word}]]` : `**${word}**`;
}

function mdOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// The quoted, collapsed full conversation.
export function conversationCallout(entries: readonly ArchiveEntry[]): string {
  const lines = [`[!quote]- 完整對話（${entries.length} 則）`];
  for (const e of entries) {
    const time = hhmm(e.at);
    lines.push("", `**你**${time ? `（${time}）` : ""}：${e.you}`);
    if (!e.skipped) lines.push("", e.answer.includes("\n") ? `**夥伴**：\n\n${e.answer}` : `**夥伴**：${e.answer}`);
  }
  return lines.join("\n").split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
}

export interface BatchInput {
  threadId: string;
  start: number;
  entries: readonly ArchiveEntry[];
  digest: Digest | null;
  // Words listed as 聊過的字 (the digest's, else the fallback).
  words: readonly string[];
  now: Date;
  wordLink?: WordLink;
}

export function batchTopics(input: Pick<BatchInput, "digest" | "words">): string[] {
  const topics = input.digest?.topics ?? [];
  return topics.length ? topics.slice(0, 3) : input.words.slice(0, 3);
}

function harvest(input: BatchInput): string[] {
  const { digest, words, wordLink } = input;
  const out: string[] = [];
  if (digest?.corrections.length) {
    out.push("**你寫的 → 更自然的寫法**");
    for (const c of digest.corrections) out.push(`- ${c.yours} → ${c.better}${c.why ? `（${c.why}）` : ""}`);
    out.push("");
  }
  if (digest?.understandings.length) {
    out.push("**你的理解**");
    for (const u of digest.understandings) {
      out.push(`- ${link(u.subject, wordLink)}：${u.yours} ${u.ok ? "✓" : "再想想"}${u.feedback ? `；${u.feedback}` : ""}`);
    }
    out.push("");
  }
  if (words.length) {
    out.push("**聊過的字**", words.map((w) => link(w, wordLink)).join("、"), "");
  }
  return out;
}

// One batch's section: `## 11:44 · 第 1–8 則：topics`, the marker, 收穫, 完整對話.
export function renderBatchSection(input: BatchInput): string {
  const { threadId, start, entries, now } = input;
  const topics = batchTopics(input);
  const head = `## ${pad(now.getHours())}:${pad(now.getMinutes())} · 第 ${start + 1}–${start + entries.length} 則${topics.length ? `：${topics.join("、")}` : ""}`;
  const lines = [head, batchMarker(threadId, start), ""];
  const got = harvest(input);
  if (got.length) lines.push("### 這次的收穫", "", ...got);
  lines.push(conversationCallout(entries), "");
  return lines.join("\n");
}

function frontmatter(day: string, words: readonly string[]): string {
  return [
    "---",
    "vocab-tracker: ai-note",
    `vocab-tracker-id: ${JSON.stringify(archiveNoteId(day))}`,
    `date: ${day}`,
    `words: ${JSON.stringify(words)}`,
    "---",
  ].join("\n");
}

export function renderDayNote(day: string, words: readonly string[], section: string, now: Date): string {
  return `${frontmatter(day, words)}\n# 學習夥伴 · ${mdOf(now.toISOString())}\n\n${section}`.replace(/\n+$/, "\n");
}

const WORDS_LINE = /^words: (\[.*\])\s*$/m;

// Adds a batch to an existing day note; null when its marker is already there.
export function appendBatch(existing: string, marker: string, section: string, newWords: readonly string[]): string | null {
  if (existing.includes(marker)) return null;
  let text = existing;
  const m = WORDS_LINE.exec(text);
  if (m) {
    let old: string[] = [];
    try {
      const parsed: unknown = JSON.parse(m[1]);
      if (Array.isArray(parsed)) old = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      /* keep what's there */
    }
    const merged = [...old];
    for (const w of newWords) if (!merged.some((x) => x.toLowerCase() === w.toLowerCase())) merged.push(w);
    text = text.replace(WORDS_LINE, `words: ${JSON.stringify(merged)}`);
  }
  return `${text.replace(/\s+$/, "")}\n\n${section}`.replace(/\n+$/, "\n");
}

