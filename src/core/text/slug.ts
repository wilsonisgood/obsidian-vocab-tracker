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

// File systems cap a single file *name* (not the path) at 255 bytes
// (APFS, ext4; NTFS counts 255 UTF-16 units, which UTF-8 bytes never
// undercount). A CJK character is 3 bytes in UTF-8 and an emoji 4, so the
// cap is counted in bytes, not characters. 200 leaves room for what sync
// tools append on a conflict (" (conflicted copy 2026-10-04)"). Callers
// pass what's left after the extension, see wordSlug.
export const MAX_NAME_BYTES = 200;

// UTF-8 length of a string, without allocating the encoded bytes.
export function utf8Bytes(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

// The longest prefix of whole code points (Array.from, so an emoji's
// surrogate pair is never split) that fits in `maxBytes`. A zero-width
// joiner left dangling by the cut is dropped too.
function truncateBytes(s: string, maxBytes: number): string {
  if (utf8Bytes(s) <= maxBytes) return s;
  let out = "";
  let n = 0;
  for (const ch of Array.from(s)) {
    const size = utf8Bytes(ch);
    if (n + size > maxBytes) break;
    out += ch;
    n += size;
  }
  return out.replace(/\u200d+$/, "");
}

// `maxBytes` is the budget for the name without its extension.
export function slugify(name: string, fallback = "untitled", maxBytes = MAX_NAME_BYTES): string {
  let s = name.normalize("NFC").replace(CONTROL, "").replace(FORBIDDEN, "-");
  s = s.replace(/\s+/g, " ").trim();
  // Collapse the runs of "-" that replacements leave behind ("a / b" →
  // "a - b" is fine, "a//b" → "a-b" rather than "a--b").
  s = s.replace(/-{2,}/g, "-");
  // A leading "." hides the file; trailing dots and spaces are dropped by
  // Windows, which would make the name differ between synced devices.
  s = s.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  s = truncateBytes(s, Math.max(0, maxBytes)).replace(/[.\s]+$/, "");
  return s || fallback;
}

// Words that differ only in case share one page: "Glittery" and "glittery"
// both go to glittery.md (so do keys built from it for queues and maps).
export function wordSlug(word: string): string {
  return slugify(word.toLocaleLowerCase("en"), "word", MAX_NAME_BYTES - utf8Bytes(".md"));
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
