import type { Record_, VocabEntry } from "./entry";
import { parsePos } from "./usage";
import type { WordBreakdown } from "./morpheme";

// Per-word DNA metadata (決定 1): emoji and word-breakdown, kept off
// VocabEntry and stored instead in learn.json's wordMeta[] (id = entryId)
// — see 09 §2 決定 1 for why (entry edits trigger auto-like/export, and
// sidebar order/merge treat the entry as one LWW record).

export interface WordMeta extends Record_ {
  id: string;
  emoji?: string;
  // "user" = picked by hand on the word page; "ai" = DNA's own guess.
  // Used by learnMerge.ts's pickWordMeta() to let a user's choice win over
  // an AI one from the other device regardless of which is newer.
  emojiSource?: "user" | "ai";
  breakdown?: WordBreakdown;
}

// Fallback emoji (A7) for a word with no wordMeta/emoji yet, keyed off the
// same free-text partOfSpeech dictionary entries already carry. 名詞📘
// 動詞🏃 形容詞🎨 其他🔤.
export function defaultEmoji(partOfSpeech: string): string {
  const pos = parsePos(partOfSpeech);
  if (pos.includes("n")) return "📘";
  if (pos.includes("v")) return "🏃";
  if (pos.includes("adj")) return "🎨";
  return "🔤";
}

// The emoji to show for a word (word page title, sidebar, galaxy, DNA —
// A7): the stored one if any, otherwise a default from its part of speech.
export function emojiOf(meta: WordMeta | undefined, entry: Pick<VocabEntry, "partOfSpeech">): string {
  return meta?.emoji ?? defaultEmoji(entry.partOfSpeech);
}
