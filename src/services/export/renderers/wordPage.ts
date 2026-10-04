import type { Thread } from "../../../core/model/thread";
import { buildManagedFile, type ManagedSection } from "../managedBlock";
import type { ExportFamily, ExportTrivia, ExportUsage, RenderContext } from "../types";
import { frontmatter, inlineCode, italic, normalizeNewlines, oneLine, renderRounds, threadRounds, wordRef } from "./common";

// 單字/<word>.md (規劃書 06 §8.1–§8.2, screen W1): a `vocab-word` header
// block (rendered live by the plugin), then four managed sections, then
// the user's own notes.

export const WORD_PAGE_KIND = "word";

export interface WordPageInput {
  entry: { id: string; word: string };
  // Every family; the ones this word belongs to are picked here.
  families: readonly ExportFamily[];
  usage?: ExportUsage;
  // Every saved trivia item; this word's own and the ones mentioning it
  // are picked here.
  trivia: readonly ExportTrivia[];
  thread?: Thread;
}

export function familiesOf(families: readonly ExportFamily[], entry: { id: string; word: string }): ExportFamily[] {
  const word = entry.word.toLowerCase();
  return families.filter(
    (f) => !f.deletedAt && f.groups.some((g) => g.members.some((m) => m.entryId === entry.id || (!m.entryId && m.word.toLowerCase() === word)))
  );
}

function liveTrivia(items: readonly ExportTrivia[]): ExportTrivia[] {
  return items.filter((t) => !t.deletedAt).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export function triviaAbout(items: readonly ExportTrivia[], entryId: string): ExportTrivia[] {
  return liveTrivia(items).filter((t) => t.entryId === entryId);
}

export function mentionsEntry(item: ExportTrivia, entry: { id: string; word: string }): boolean {
  const word = entry.word.toLowerCase();
  return item.entryId !== entry.id && item.mentions.some((m) => m === entry.id || m.toLowerCase() === word);
}

export function triviaMentioning(items: readonly ExportTrivia[], entry: { id: string; word: string }): ExportTrivia[] {
  return liveTrivia(items).filter((t) => mentionsEntry(t, entry));
}

// Only pages with a discussion or saved trivia are created on their own
// (§8.2); otherwise the page waits until the user opens it.
export function hasWordPageContent(input: WordPageInput): boolean {
  return threadRounds(input.thread).length > 0 || triviaAbout(input.trivia, input.entry.id).length > 0;
}

function section(name: string, heading: string, body: string): ManagedSection {
  return { name, body: `## ${heading}\n\n${body}` };
}

function renderFamilies(input: WordPageInput, ctx: RenderContext): string {
  const families = familiesOf(input.families, input.entry);
  if (!families.length) return italic(ctx.labels.familiesEmpty);
  const self = input.entry.word.toLowerCase();
  return families
    .map((f) => {
      const heading = `### ${[...new Set([f.topic, f.label].map(oneLine).filter(Boolean))].join(" · ")}`;
      const groups = f.groups
        .filter((g) => g.members.length)
        .map((g) => {
          const members = g.members
            .map((m) => {
              const isSelf = m.entryId === input.entry.id || m.word.toLowerCase() === self;
              const word = isSelf ? `**${m.word}**` : wordRef(ctx, m.word, m.entryId);
              return [word, isSelf ? "" : oneLine(m.zh)].filter(Boolean).join(" ");
            })
            .join(" · ");
          return g.label.trim() ? `- **${oneLine(g.label)}**：${members}` : `- ${members}`;
        });
      return [heading, "", ...groups].join("\n");
    })
    .join("\n\n");
}

function renderUsage(usage: ExportUsage | undefined, ctx: RenderContext): string {
  if (!usage || (!usage.patterns.length && !usage.related.length)) return italic(ctx.labels.usageEmpty);
  const lines = usage.patterns.map((p) => {
    const item = [`- ${inlineCode(p.pattern)}`, oneLine(p.meaningZh)].filter(Boolean).join(" ");
    return p.example.trim() ? `${item}\n  - ${italic(oneLine(p.example))}` : item;
  });
  if (usage.related.length) {
    if (lines.length) lines.push("");
    const related = usage.related.map((r) => (r.zh.trim() ? `${oneLine(r.phrase)}（${oneLine(r.zh)}）` : oneLine(r.phrase)));
    lines.push(`**${ctx.labels.usageRelated}**：${related.join(" · ")}`);
  }
  return lines.join("\n");
}

function renderTrivia(input: WordPageInput, ctx: RenderContext): string {
  const own = triviaAbout(input.trivia, input.entry.id);
  const mentioned = triviaMentioning(input.trivia, input.entry);
  const parts: string[] = [];
  if (!own.length) parts.push(italic(ctx.labels.triviaEmpty));
  for (const item of own) {
    const lines = [`### ${oneLine(item.title)}`, "", normalizeNewlines(item.body).trim()];
    if (item.createdAt) lines.push("", italic(ctx.formatDate(item.createdAt)));
    parts.push(lines.join("\n"));
  }
  if (mentioned.length) {
    const list = mentioned.map((t) => {
      const subject = ctx.entryWord(t.entryId);
      return subject ? `- ${oneLine(t.title)}（${wordRef(ctx, subject, t.entryId)}）` : `- ${oneLine(t.title)}`;
    });
    parts.push([`**${ctx.labels.triviaMentionedIn}**`, "", ...list].join("\n"));
  }
  return parts.join("\n\n");
}

function renderDiscussion(input: WordPageInput, ctx: RenderContext): string {
  const rounds = threadRounds(input.thread);
  return rounds.length ? renderRounds(rounds, ctx, "###") : italic(ctx.labels.discussionEmpty);
}

export function renderWordPageSections(input: WordPageInput, ctx: RenderContext): ManagedSection[] {
  return [
    section("families", ctx.labels.families, renderFamilies(input, ctx)),
    section("usage", ctx.labels.usage, renderUsage(input.usage, ctx)),
    section("trivia", ctx.labels.trivia, renderTrivia(input, ctx)),
    section("discussion", ctx.labels.discussion, renderDiscussion(input, ctx)),
  ];
}

// The whole file, for when the page doesn't exist yet. Later exports only
// touch the managed sections.
export function renderWordPageFile(input: WordPageInput, ctx: RenderContext): string {
  const head = [
    frontmatter({ "vocab-tracker": WORD_PAGE_KIND, "vocab-tracker-id": input.entry.id }),
    "```vocab-word",
    "```",
  ].join("\n");
  return buildManagedFile(head, renderWordPageSections(input, ctx), `%% ${ctx.labels.userNotesHint} %%\n`);
}
