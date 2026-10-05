import type { FilesSettings } from "../../core/model/settings";
import { joinPath } from "../../core/text/slug";

export type { FilesSettings };

// Where the plugin's notes go (規劃書 06 §8.3「資料夾名稱可在設定改」).
// Stored as `settings.files` in data.json and merged section by section
// like the other settings; read here through resolveFilesSettings, which
// fills in the defaults, so a missing or half-filled object is fine. The
// section stamp isn't copied (as with resolveWordlistSettings).

export const DEFAULT_FILES_SETTINGS: FilesSettings = {
  folder: "vocab-list",
  wordsFolder: "單字",
  threadsFolder: "討論串",
};

// Folder path as typed by the user → vault path: no leading/trailing
// slashes, backslashes as "/", no empty or "."/".." segments. Empty after
// cleaning → null (the default applies).
export function cleanFolder(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const parts = raw
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p !== "" && p !== "." && p !== "..");
  return parts.length ? parts.join("/") : null;
}

export function resolveFilesSettings(raw?: Partial<FilesSettings> | null): FilesSettings {
  return {
    folder: cleanFolder(raw?.folder) ?? DEFAULT_FILES_SETTINGS.folder,
    wordsFolder: cleanFolder(raw?.wordsFolder) ?? DEFAULT_FILES_SETTINGS.wordsFolder,
    threadsFolder: cleanFolder(raw?.threadsFolder) ?? DEFAULT_FILES_SETTINGS.threadsFolder,
  };
}

export interface FilesPaths {
  folder: string;
  words: string;
  threads: string;
}

export function filesPaths(s: FilesSettings): FilesPaths {
  return {
    folder: s.folder,
    words: joinPath(s.folder, s.wordsFolder),
    threads: joinPath(s.folder, s.threadsFolder),
  };
}

// True when `path` is `folder` itself or anything inside it.
export function inFolderPath(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}
