import type { Thread } from "../../../core/model/thread";
import { POS_KEYS, type PosKey } from "../../../core/model/usage";
import { buildManagedFile, type ManagedSection } from "../managedBlock";
import type { ExportFamily, ExportTrivia, ExportUsage, ExportVerbFavorite, RenderContext } from "../types";
import { fill, frontmatter, inlineCode, italic, normalizeNewlines, oneLine, renderRounds, threadRounds, wordRef } from "./common";

// 單字/<word>.md (規劃書 06 §8.1–§8.2, screen W1): a `vocab-word` header
// block (rendered live by the plugin), then four managed sections, then
// the user's own notes.

export const WORD_PAGE_KIND = "word";

export interface WordPageInput {
  entry: { id: string; word: string };
  // Every family; the ones this word belongs to are picked here.
  families: readonly ExportFamily[];
  // This word's usage blocks, by part of speech (1006-2 #19 #21): merges
  // any legacy single-block `usage` under "v" (see usagesOf() in
  // core/model/usage.ts — the adapter at ExportService.ts's writeWord()
  // uses it to build this).
  usages?: Partial<Record<PosKey, ExportUsage>>;
  // Every saved usage favorite (用法收藏), now per part of speech
  // (1006-2 #21); this word's are picked here.
  verbFavorites?: readonly ExportVerbFavorite[];
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

// A favorite for one specific part of speech (1006-2 #21: `verbFavoriteOf`
// used to match on entryId alone, which meant any part of speech's
// favorite looked like the verb's — fixed to also compare pos; absent
// `pos` on the record means "v").
export function usageFavoriteOf(
  input: Pick<WordPageInput, "verbFavorites" | "entry">,
  pos: PosKey
): ExportVerbFavorite | undefined {
  return input.verbFavorites?.find((v) => v.entryId === input.entry.id && !v.deletedAt && (v.pos ?? "v") === pos);
}

// Only pages with a discussion or something saved (trivia, a usage) are
// created on their own (§8.2); otherwise the page waits until the user
// opens it.
export function hasWordPageContent(input: WordPageInput): boolean {
  return (
    threadRounds(input.thread).length > 0 ||
    triviaAbout(input.trivia, input.entry.id).length > 0 ||
    !!input.verbFavorites?.some((v) => v.entryId === input.entry.id && !v.deletedAt)
  );
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

// 「已收藏 10/05 · AI 產生於 10/02」 under the usage (1005 回饋 #4, #14).
function usageMeta(usage: ExportUsage, saved: ExportVerbFavorite | undefined, ctx: RenderContext): string | null {
  const parts: string[] = [];
  if (saved?.createdAt) parts.push(fill(ctx.labels.usageSaved, { date: ctx.formatDate(saved.createdAt) }));
  if (usage.generatedAt) parts.push(fill(ctx.labels.usageGenerated, { date: ctx.formatDate(usage.generatedAt) }));
  return parts.length ? italic(parts.join(" · ")) : null;
}

// One part of speech's patterns/related/meta — the body under its own
// `### <詞性>用法` subheading (1006-2 #19).
function renderUsageBlock(usage: ExportUsage, favorite: ExportVerbFavorite | undefined, ctx: RenderContext): string {
  const lines = usage.patterns.map((p) => {
    const item = [`- ${inlineCode(p.pattern)}`, oneLine(p.meaningZh)].filter(Boolean).join(" ");
    return p.example.trim() ? `${item}\n  - ${italic(oneLine(p.example))}` : item;
  });
  if (usage.related.length) {
    if (lines.length) lines.push("");
    const related = usage.related.map((r) => (r.zh.trim() ? `${oneLine(r.phrase)}（${oneLine(r.zh)}）` : oneLine(r.phrase)));
    lines.push(`**${ctx.labels.usageRelated}**：${related.join(" · ")}`);
  }
  const meta = usageMeta(usage, favorite, ctx);
  if (meta) lines.push("", meta);
  return lines.join("\n");
}

// The whole 「用法」 section: one `### <詞性>用法` subsection per part of
// speech that has content, in POS_KEYS order (1006-2 #19). A legacy
// single-block entry (pre-#21) lands under "v" via usagesOf()'s merge,
// same as every other pos here — so it shows up under 動詞用法 like
// before, just now with its own subheading.
function renderUsage(input: WordPageInput, ctx: RenderContext): string {
  const usages = input.usages ?? {};
  const present = POS_KEYS.filter((pos) => {
    const u = usages[pos];
    return u && (u.patterns.length || u.related.length);
  });
  if (!present.length) return italic(ctx.labels.usageEmpty);
  return present
    .map((pos) => {
      const heading = `### ${ctx.labels.usagePosHeading[pos]}`;
      const body = renderUsageBlock(usages[pos]!, usageFavoriteOf(input, pos), ctx);
      return [heading, "", body].join("\n");
    })
    .join("\n\n");
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
    section("usage", ctx.labels.usage, renderUsage(input, ctx)),
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
