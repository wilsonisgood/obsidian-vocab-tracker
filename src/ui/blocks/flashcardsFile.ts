import { TFile, type App } from "obsidian";

// Entry note for the flashcard block, next to vocab-list.md (F1 layout).
// Stopgap until EntryFilesService (M6) owns entry files and finds them by
// frontmatter id instead of a fixed path.
export const FLASHCARDS_FILE = "vocab-list/單字卡.md";
const FLASHCARDS_CONTENT = "# 單字卡\n\n```vocab-flashcards\n```\n";

// Created on demand (dashboard button / command), never at startup: a
// user who deletes the note shouldn't have it reappear on every launch.
// Never overwrites an existing file.
export async function openFlashcardsFile(app: App): Promise<void> {
  let file = app.vault.getAbstractFileByPath(FLASHCARDS_FILE);
  if (!file) {
    const folder = FLASHCARDS_FILE.slice(0, FLASHCARDS_FILE.lastIndexOf("/"));
    if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
    file = await app.vault.create(FLASHCARDS_FILE, FLASHCARDS_CONTENT);
  }
  if (file instanceof TFile) await app.workspace.getLeaf(false).openFile(file);
}
