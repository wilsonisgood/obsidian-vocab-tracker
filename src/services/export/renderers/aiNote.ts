import type { Turn } from "../../../core/model/thread";
import { linkTarget, noteBasename } from "../../../core/text/slug";
import { editFrontmatter, readFrontmatter } from "../frontmatter";
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

// `vocab-tracker-id` is the article's path: how the note is found again
// after the user renames or moves it, and how two articles with the same
// name in different folders tell their notes apart.
export function renderAiNoteFile(input: AiNoteInput, ctx: RenderContext): string {
  const head = frontmatter({
    "vocab-tracker": AI_NOTE_KIND,
    "vocab-tracker-id": input.articlePath,
    source: `[[${linkTarget(input.articlePath)}]]`,
  });
  return buildManagedFile(head, renderAiNoteSections(input, ctx), `%% ${ctx.labels.userNotesHint} %%\n`);
}

// ── Whose note is it ─────────────────────────────────────────────────

// How a .ai.md relates to an article:
// - "id": its `vocab-tracker-id` is the article's path.
// - "source": an older note without the id whose `source` links to the
//   article.
// - "unclaimed": nothing says whose it is (no frontmatter, or neither
//   field) — taken by the first article that writes it under one of its
//   names, which marks it with its id at once (claimAiNote).
// - "other": another article's note, or not an AI note at all.
export type AiNoteOwner = "id" | "source" | "unclaimed" | "other";

// "[[eng/Speech|alias]]" → "eng/Speech".
function sourceTarget(source: string): string {
  const m = /^\[\[([^\]|#]*)/.exec(source.trim());
  return (m ? m[1] : source).trim().replace(/\.md$/i, "");
}

// `renamedTo`: during a rename, the article's new path counts as the same
// article. Obsidian may already have rewritten the source link to it,
// possibly in its shortest form ("[[Speech]]").
export function aiNoteOwner(text: string, articlePath: string, renamedTo?: string): AiNoteOwner {
  const fm = readFrontmatter(text);
  if (!fm) return "unclaimed";
  const kind = fm["vocab-tracker"];
  if (kind !== undefined && kind !== AI_NOTE_KIND) return "other";
  const paths = renamedTo === undefined ? [articlePath] : [articlePath, renamedTo];
  const id = fm["vocab-tracker-id"];
  if (id) return paths.includes(id) ? "id" : "other";
  if (!fm.source) return "unclaimed";
  const target = sourceTarget(fm.source);
  if (paths.some((p) => linkTarget(p) === target)) return "source";
  if (renamedTo !== undefined && target === noteBasename(renamedTo)) return "source";
  return "other";
}

// Marks a note as this article's (adds `vocab-tracker-id`, and the kind if
// missing), so findManaged finds it from now on and a same-name article
// sees it as "other". Only those frontmatter lines change. A note without
// frontmatter gets a minimal one inserted at the top; nothing else in it
// changes — without it, same-name articles would take turns overwriting
// an "unclaimed" note.
export function claimAiNote(text: string, articlePath: string): string {
  const fields: Record<string, string> = {};
  if (readFrontmatter(text)?.["vocab-tracker"] === undefined) fields["vocab-tracker"] = AI_NOTE_KIND;
  fields["vocab-tracker-id"] = articlePath;
  return editFrontmatter(text, fields, { add: true, after: "vocab-tracker", create: true });
}

// After the article was renamed: points the id and the source link (when
// the note has one) at the new path. Nothing else in the note changes
// (an unclaimed note gets the minimal frontmatter, as in claimAiNote).
export function retargetAiNote(text: string, newPath: string): string {
  return editFrontmatter(claimAiNote(text, newPath), { source: `[[${linkTarget(newPath)}]]` });
}
