import { liveTurns, type Thread, type Turn } from "../../../core/model/thread";
import type { RenderContext } from "../types";

// Shared pieces of the Markdown renderers. Everything here is a pure
// string function.

export interface Round {
  question: Turn;
  answer: Turn;
}

// Question/answer pairs worth exporting: the answer finished (or was
// stopped) with some text. Failed and still-streaming rounds are skipped —
// the next export after they settle picks them up.
export function roundsOf(turns: readonly Turn[]): Round[] {
  const out: Round[] = [];
  let pending: Turn | null = null;
  for (const turn of turns) {
    if (turn.deletedAt) continue;
    if (turn.role === "user") {
      pending = turn;
      continue;
    }
    if (pending && turn.content.trim() && (turn.status === "done" || turn.status === "aborted")) {
      out.push({ question: pending, answer: turn });
    }
    pending = null;
  }
  return out;
}

export function threadRounds(thread: Thread | undefined): Round[] {
  return thread && !thread.deletedAt ? roundsOf(liveTurns(thread)) : [];
}

const FENCE = /^[ \t]*(`{3,}|~{3,})/;

// A stopped answer can end inside a code block; left open, the fence would
// swallow everything after it in the rendered note (end marker and the
// user's own notes included). Closes it.
export function balanceFences(markdown: string): string {
  let open: string | null = null;
  for (const line of markdown.split("\n")) {
    const m = FENCE.exec(line);
    if (!m) continue;
    const fence = m[1];
    if (open === null) open = fence;
    else if (fence[0] === open[0] && fence.length >= open.length && line.trim() === fence) open = null;
  }
  return open === null ? markdown : `${markdown.replace(/\n*$/, "")}\n${open}`;
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

// Every line prefixed with "> " (blank lines too, so the quote continues).
export function blockquote(text: string): string {
  return normalizeNewlines(text.trim())
    .split("\n")
    .map((l) => (l.trim() ? `> ${l}` : ">"))
    .join("\n");
}

// Text inside one line of Markdown (list items, headings): line breaks
// collapse to spaces.
export function oneLine(text: string): string {
  return normalizeNewlines(text).replace(/\s*\n\s*/g, " ").trim();
}

export function inlineCode(text: string): string {
  const s = oneLine(text);
  return s.includes("`") ? `\`\` ${s} \`\`` : `\`${s}\``;
}

export function italic(text: string): string {
  return `*${text}*`;
}

// [[target|word]] when the word has a page, otherwise just the word.
export function wordRef(ctx: RenderContext, word: string, entryId?: string): string {
  const target = ctx.pageLink(word, entryId);
  return target ? `[[${target}|${word}]]` : word;
}

// One exported Q&A round:
//
//   ### 10/01 · 文法
//   > 「selection」
//   > **Q** 為什麼用 was dancing？
//
//   answer…
export function renderRound(round: Round, ctx: RenderContext, heading: string): string {
  const { question, answer } = round;
  const label = question.taskId ? ctx.taskLabel(question.taskId) : undefined;
  const title = [ctx.formatDate(question.at), label].filter(Boolean).join(" · ");
  const quote: string[] = [];
  if (question.selection?.trim()) quote.push(`「${oneLine(question.selection)}」`);
  quote.push(`**Q** ${normalizeNewlines(question.content).trim()}`);
  const parts = [`${heading} ${title}`, blockquote(quote.join("\n")), "", balanceFences(normalizeNewlines(answer.content).trim())];
  if (answer.status === "aborted") parts.push("", italic(ctx.labels.aborted));
  return parts.join("\n");
}

export function renderRounds(rounds: readonly Round[], ctx: RenderContext, heading: string): string {
  return rounds.map((r) => renderRound(r, ctx, heading)).join("\n\n");
}

// "{n} 則討論" style templates.
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

// YAML frontmatter. Values are written as JSON strings (valid YAML) so ids
// stay strings and links keep their brackets.
const YAML_KEYWORDS = /^(true|false|yes|no|on|off|null|~)$/i;

export function frontmatter(fields: Record<string, string>): string {
  const value = (v: string) => (/^[a-z][\w-]*$/i.test(v) && !YAML_KEYWORDS.test(v) ? v : JSON.stringify(v));
  return ["---", ...Object.entries(fields).map(([k, v]) => `${k}: ${value(v)}`), "---"].join("\n");
}
