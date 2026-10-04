import { CARD_MODES, type CardMode } from "../../core/model/srs";

// Code-block bodies double as parameters (規劃書 06 §9.6): one `key: value`
// per line, e.g.
//
//   ```vocab-flashcards
//   mode: cloze
//   source: eng/
//   limit: 30
//   ```
//
// Kept free of "obsidian" imports so it's unit-testable in Node.

export type BlockParams = Record<string, string>;

// Keys are case-insensitive; blank lines and `#` / `//` comments are
// ignored; a later duplicate key wins. Values keep inner colons
// ("source: a:b/" → "a:b/").
export function parseBlockParams(source: string): BlockParams {
  const out: BlockParams = {};
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export interface FlashcardParams {
  mode: CardMode;
  source?: string;
  limit?: number;
}

// Friendlier spellings people are likely to type, mapped to CardMode.
const MODE_ALIASES: Record<string, CardMode> = {
  "en-zh": "en-zh",
  "en→zh": "en-zh",
  "英→中": "en-zh",
  "zh-en": "zh-en",
  "zh→en": "zh-en",
  "中→英": "zh-en",
  cloze: "cloze",
  "例句填空": "cloze",
  listen: "listen",
  "聽音拼字": "listen",
};

// Unknown or malformed values fall back to defaults rather than erroring:
// a typo in a note shouldn't turn the whole block into an error message.
export function parseFlashcardParams(source: string): FlashcardParams {
  const p = parseBlockParams(source);
  const mode = MODE_ALIASES[(p.mode ?? "").toLowerCase()] ?? CARD_MODES[0];
  const out: FlashcardParams = { mode };

  // Strip a leading "/" and wrapping quotes so `source: "/eng/"` and
  // `source: eng/` both match vault paths like "eng/note.md".
  const src = (p.source ?? "").replace(/^["']|["']$/g, "").replace(/^\/+/, "");
  if (src) out.source = src;

  const limit = Number(p.limit);
  if (p.limit !== undefined && Number.isInteger(limit) && limit > 0) out.limit = limit;
  return out;
}
