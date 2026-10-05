import { joinPath } from "../../core/text/slug";
import { exportLabels } from "../export/labels";
import { buildManagedFile } from "../export/managedBlock";
import { frontmatter } from "../export/renderers/common";
import { renderTriviaFavoritesSections } from "../export/renderers/triviaFavorites";
import type { RenderContext } from "../export/types";

// The four entry files (規劃書 06 §8.3, screen F1): one note per learning
// mode, holding that mode's code block. Created only when missing, never
// overwritten; found again by their frontmatter id when the user renames
// or moves them.

export const ENTRY_FILE_KIND = "entry";

export type EntryFileId = "flashcards" | "families" | "verbs" | "trivia";

export interface EntryFileDef {
  id: EntryFileId;
  // File name without ".md". Fixed (not translated): switching the
  // interface language mustn't make a second set of files.
  name: string;
  // The code block the file is for.
  block: string;
  // Block body (`key: value` lines), if any.
  params?: string;
}

export const ENTRY_FILES: readonly EntryFileDef[] = [
  { id: "flashcards", name: "單字卡", block: "vocab-flashcards" },
  { id: "families", name: "字族樹", block: "vocab-families" },
  { id: "verbs", name: "動詞用法", block: "vocab-verbs" },
  // The saved list is the exported section under the block, so the block
  // itself doesn't list favorites a second time.
  { id: "trivia", name: "冷知識", block: "vocab-trivia", params: "favorites: off" },
];

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

// A new entry file. 冷知識.md also gets the (empty) saved-trivia section
// right under its block, so ExportService fills it in place instead of
// appending it after whatever the user writes below.
export function renderEntryFile(id: EntryFileId): string {
  const def = entryFileDef(id);
  const head = [
    frontmatter({ "vocab-tracker": ENTRY_FILE_KIND, "vocab-tracker-id": def.id }),
    `# ${def.name}`,
    "",
    "```" + def.block,
    ...(def.params ? [def.params] : []),
    "```",
  ].join("\n");
  const sections = id === "trivia" ? renderTriviaFavoritesSections({ items: [] }, emptyContext()) : [];
  return buildManagedFile(head, sections);
}
