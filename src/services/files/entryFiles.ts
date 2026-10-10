import { joinPath } from "../../core/text/slug";
import { exportLabels } from "../export/labels";
import { buildManagedFile } from "../export/managedBlock";
import { frontmatter } from "../export/renderers/common";
import { renderTriviaFavoritesSections } from "../export/renderers/triviaFavorites";
import type { RenderContext } from "../export/types";

// The entry files (規劃書 06 §8.3, screen F1): one note per learning
// mode, holding that mode's code block. Created only when missing, never
// overwritten; found again by their frontmatter id when the user renames
// or moves them.

export const ENTRY_FILE_KIND = "entry";

export type EntryFileId = "flashcards" | "families" | "verbs" | "trivia" | "dna";

export interface EntryFileDef {
  id: EntryFileId;
  // File name without ".md". Fixed (not translated): switching the
  // interface language mustn't make a second set of files.
  name: string;
  // The code block the file is for.
  block: string;
  // Block body (`key: value` lines), if any.
  params?: string;
  // The default file name before the 1010 rename (第十二波 A), without
  // ".md". A file still carrying it is renamed to `name`.
  legacyName: string;
}

// One name per feature, the same in both interface languages (1010 A):
// Card, Galaxy, Usage, Eureka, DNA. The old code block names keep working
// (registry.ts); only new files use the new ones.
export const ENTRY_FILES: readonly EntryFileDef[] = [
  { id: "flashcards", name: "Card", block: "vocab-card", legacyName: "單字卡" },
  { id: "families", name: "Galaxy", block: "vocab-galaxy", legacyName: "字族樹" },
  { id: "verbs", name: "Usage", block: "vocab-usage", legacyName: "動詞用法" },
  // The saved list is the exported section under the block, so the block
  // itself doesn't list favorites a second time.
  { id: "trivia", name: "Eureka", block: "vocab-eureka", params: "favorites: off", legacyName: "冷知識" },
  // Word DNA (規劃書 09 §7).
  { id: "dna", name: "DNA", block: "vocab-dna", legacyName: "Word DNA" },
];

// The word list's starter note (main.ts) is not an entry file (no
// frontmatter id) but follows the same rename.
export const LIST_FILE_NAME = "List";
export const LIST_FILE_LEGACY_NAME = "vocab-list";

export interface RenameCandidate {
  // An EntryFileId, or "list" for the word list's starter note.
  id: EntryFileId | "list";
  // Where the file is now.
  path: string;
}

// The renames to do ([from, to] pairs): a file whose name is still the old
// default gets the new one, in the same folder. A name the user chose is
// left alone, and so is a file whose target is already taken.
export function planEntryRenames(
  files: readonly RenameCandidate[],
  exists: (path: string) => boolean
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const f of files) {
    const names =
      f.id === "list"
        ? { legacy: LIST_FILE_LEGACY_NAME, next: LIST_FILE_NAME }
        : { legacy: entryFileDef(f.id).legacyName, next: entryFileDef(f.id).name };
    const slash = f.path.lastIndexOf("/");
    const dir = slash < 0 ? "" : f.path.slice(0, slash);
    if (f.path.slice(slash + 1) !== `${names.legacy}.md`) continue;
    const to = joinPath(dir, `${names.next}.md`);
    if (to === f.path || exists(to)) continue;
    out.push([f.path, to]);
  }
  return out;
}

export const ENTRY_FILE_IDS: readonly EntryFileId[] = ENTRY_FILES.map((d) => d.id);

export function entryFileDef(id: EntryFileId): EntryFileDef {
  const def = ENTRY_FILES.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown entry file: ${id}`);
  return def;
}

export function isEntryFileId(id: string): id is EntryFileId {
  return (ENTRY_FILE_IDS as readonly string[]).includes(id);
}

// Where the file goes when it doesn't exist yet.
export function entryFilePath(folder: string, id: EntryFileId): string {
  return joinPath(folder, `${entryFileDef(id).name}.md`);
}

// Only the labels are read when there are no items to render.
function emptyContext(): RenderContext {
  return {
    labels: exportLabels(),
    formatDate: (iso) => iso.slice(0, 10),
    taskLabel: () => undefined,
    entryWord: () => undefined,
    pageLink: () => null,
  };
}

// A new entry file. Eureka.md also gets the (empty) saved-trivia section
// right under its block, so ExportService fills it in place instead of
// appending it after whatever the user writes below.
//
// No 「# Galaxy」 heading: Obsidian already shows the file name as the
// inline title right above, so the heading only repeated it (1005 回饋 #4).
// Files created before keep theirs — the plugin never edits an existing
// entry file; PluginNoteChrome hides the inline title on those instead
// (legacyTitleHeading below tells it when).
export function renderEntryFile(id: EntryFileId): string {
  const def = entryFileDef(id);
  const head = [
    frontmatter({ "vocab-tracker": ENTRY_FILE_KIND, "vocab-tracker-id": def.id }),
    "```" + def.block,
    ...(def.params ? [def.params] : []),
    "```",
  ].join("\n");
  const sections = id === "trivia" ? renderTriviaFavoritesSections({ items: [] }, emptyContext()) : [];
  return buildManagedFile(head, sections);
}

// The 「# 字族樹」 an entry file made before 1005 starts with: the note's
// first heading, an H1 repeating the file name, right after the
// frontmatter (a blank line or two in between is fine). False for a new
// file, a renamed one (the heading no longer repeats the inline title) or
// a heading further down. Takes Obsidian's metadata cache shapes.
export interface HeadingCacheLike {
  heading: string;
  level: number;
  position: { start: { line: number } };
}

const LEGACY_HEADING_SLACK = 3;

export function legacyTitleHeading(
  basename: string,
  headings: readonly HeadingCacheLike[] | undefined,
  // 0-based line of the frontmatter's closing "---"; undefined without one.
  frontmatterEndLine: number | undefined
): boolean {
  const h = headings?.[0];
  if (!h || h.level !== 1 || h.heading.trim() !== basename.trim()) return false;
  const first = frontmatterEndLine === undefined ? 0 : frontmatterEndLine + 1;
  return h.position.start.line >= first && h.position.start.line < first + LEGACY_HEADING_SLACK;
}
