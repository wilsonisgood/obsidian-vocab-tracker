// File names for exported notes (規劃書 06 §8.2): 單字/<word>.md,
// 討論串/<文章>.ai.md.
//
// Strips what the OS or Obsidian can't have in a file name — the
// spec's `/ \ : * ? " < > |` plus a leading "." (hidden file) — and the
// link syntax characters `# ^ [ ]`, which Obsidian also rejects in names
// because they'd break [[wikilinks]] to the file.

const FORBIDDEN = /[/\\:*?"<>|#^[\]]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

// Long enough for any real word or article title; keeps the full path well
// under the 255-byte limit some file systems have even with CJK names.
const MAX_LENGTH = 100;

export function slugify(name: string, fallback = "untitled"): string {
  let s = name.normalize("NFC").replace(CONTROL, "").replace(FORBIDDEN, "-");
  s = s.replace(/\s+/g, " ").trim();
  // Collapse the runs of "-" that replacements leave behind ("a / b" →
  // "a - b" is fine, "a//b" → "a-b" rather than "a--b").
  s = s.replace(/-{2,}/g, "-");
  // A leading "." hides the file; trailing dots and spaces are dropped by
  // Windows, which would make the name differ between synced devices.
  s = s.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  if (s.length > MAX_LENGTH) s = s.slice(0, MAX_LENGTH).replace(/[.\s]+$/, "");
  return s || fallback;
}

// Words that differ only in case share one page: "Glittery" and "glittery"
// both go to glittery.md (so do keys built from it for queues and maps).
export function wordSlug(word: string): string {
  return slugify(word.toLocaleLowerCase("en"), "word");
}

export function joinPath(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter((p) => p !== "")
    .join("/");
}

// The note's name without folders or extension: "eng/Speech.md" → "Speech".
export function noteBasename(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

// Path without the ".md" extension, the form [[wikilinks]] and embeds use.
export function linkTarget(path: string): string {
  return path.replace(/\.md$/i, "");
}
