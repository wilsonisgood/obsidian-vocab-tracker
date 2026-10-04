import { buildManagedFile, type ManagedSection } from "../managedBlock";
import type { ExportTrivia, RenderContext } from "../types";
import { italic, normalizeNewlines, oneLine, wordRef } from "./common";

// 冷知識.md (規劃書 06 §8.1): the `vocab-trivia` chat block, and below it
// the saved trivia, newest first.

export interface TriviaFavoritesInput {
  items: readonly ExportTrivia[];
}

function renderItem(item: ExportTrivia, ctx: RenderContext): string {
  const meta: string[] = [];
  const subject = ctx.entryWord(item.entryId);
  if (subject) meta.push(wordRef(ctx, subject, item.entryId));
  if (item.createdAt) meta.push(ctx.formatDate(item.createdAt));
  const lines = [`### ${oneLine(item.title)}`, "", normalizeNewlines(item.body).trim()];
  if (meta.length) lines.push("", italic(meta.join(" · ")));
  return lines.join("\n");
}

export function renderTriviaFavoritesSections(input: TriviaFavoritesInput, ctx: RenderContext): ManagedSection[] {
  const items = input.items.filter((t) => !t.deletedAt).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const body = items.length ? items.map((t) => renderItem(t, ctx)).join("\n\n") : italic(ctx.labels.favoritesEmpty);
  return [{ name: "trivia-favorites", body: `## ${ctx.labels.favorites}\n\n${body}` }];
}

// Normally 冷知識.md is created by EntryFilesService; this is the fallback
// when a favourite is saved before the file exists.
export function renderTriviaFavoritesFile(input: TriviaFavoritesInput, ctx: RenderContext): string {
  return buildManagedFile("```vocab-trivia\n```", renderTriviaFavoritesSections(input, ctx));
}
