import type { Turn } from "../../../core/model/thread";
import { linkTarget } from "../../../core/text/slug";
import { buildManagedFile, type ManagedSection } from "../managedBlock";
import type { RenderContext } from "../types";
import { blockquote, fill, frontmatter, italic, oneLine, renderRounds, roundsOf, wordRef } from "./common";

// 討論串/<文章>.ai.md (規劃書 06 §8.1, screen W4): the note's paragraph
// discussions in the note's own order, then the words learned from it.

export const AI_NOTE_KIND = "ai-note";

export interface AiNoteParagraph {
  // ¶ number's 0-based index in the note; null when the paragraph can't be
  // found any more (orphaned). Resolved by the caller (paragraph anchors).
  index: number | null;
  // The paragraph text when the discussion started (Anchor.snapshot).
  text: string;
  blockId?: string;
  turns: readonly Turn[];
  // Tie-breaker for paragraphs with the same index (and orphans).
  createdAt?: string;
}

export interface AiNoteWord {
  word: string;
  entryId?: string;
  // Questions asked in the word's own thread.
  questions: number;
}

export interface AiNoteInput {
  // The article the discussions belong to, e.g. "eng/Speech.md".
  articlePath: string;
  paragraphs: readonly AiNoteParagraph[];
  words: readonly AiNoteWord[];
}

const HEADING_PREVIEW = 40;

function preview(text: string): string {
  const line = oneLine(text);
  return line.length > HEADING_PREVIEW ? `${line.slice(0, HEADING_PREVIEW).trimEnd()}…` : line;
}

function byOrder(a: AiNoteParagraph, b: AiNoteParagraph): number {
  if (a.index !== b.index) {
    if (a.index === null) return 1;
    if (b.index === null) return -1;
    return a.index - b.index;
  }
  return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
}

function renderParagraph(p: AiNoteParagraph, article: string, ctx: RenderContext): string | null {
  const rounds = roundsOf(p.turns);
  if (!rounds.length) return null;
  const heading = p.index === null ? `## ${ctx.labels.paragraphOrphaned}` : `## ¶${p.index + 1} ${preview(p.text)}`;
  // A live paragraph with a block id is embedded, so the note shows the
  // current wording; otherwise the text as it was when asked.
  const quote = p.index !== null && p.blockId ? `![[${article}#^${p.blockId}]]` : blockquote(p.text);
  return [heading, "", quote, "", renderRounds(rounds, ctx, "###")].join("\n");
}

function renderParagraphs(input: AiNoteInput, ctx: RenderContext): string {
  const article = linkTarget(input.articlePath);
  const parts = [...input.paragraphs]
    .sort(byOrder)
    .map((p) => renderParagraph(p, article, ctx))
    .filter((p): p is string => p !== null);
  return parts.length ? parts.join("\n\n") : italic(ctx.labels.paragraphsEmpty);
}

function renderWords(input: AiNoteInput, ctx: RenderContext): string {
  const list = input.words.map((w) => {
    const ref = wordRef(ctx, w.word, w.entryId);
    return w.questions > 0 ? `- ${ref} · ${fill(ctx.labels.wordQuestions, { n: w.questions })}` : `- ${ref}`;
  });
  return [`## ${ctx.labels.wordsLearned}`, "", list.length ? list.join("\n") : italic(ctx.labels.wordsEmpty)].join("\n");
}

// Only notes with at least one exported round are created.
export function hasAiNoteContent(input: AiNoteInput): boolean {
  return input.paragraphs.some((p) => roundsOf(p.turns).length > 0);
}

export function renderAiNoteSections(input: AiNoteInput, ctx: RenderContext): ManagedSection[] {
  return [
    { name: "paragraphs", body: renderParagraphs(input, ctx) },
    { name: "words", body: renderWords(input, ctx) },
  ];
}

export function renderAiNoteFile(input: AiNoteInput, ctx: RenderContext): string {
  const head = frontmatter({ "vocab-tracker": AI_NOTE_KIND, source: `[[${linkTarget(input.articlePath)}]]` });
  return buildManagedFile(head, renderAiNoteSections(input, ctx), `%% ${ctx.labels.userNotesHint} %%\n`);
}
