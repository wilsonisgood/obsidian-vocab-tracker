import type { Record_ } from "./entry";

// Usage blocks (規劃書 06 §4.1, §7.3, screen L6; wave 8 U1 — all parts of
// speech, not just verbs, 1006-2 回饋 #17 #18 #20 #21). Stored per part of
// speech on the entry (`VocabEntry.usages`), generated together by one
// 「產生」 button and regenerated one part of speech at a time.

export interface UsagePattern {
  // e.g. "sugarcoat + 名詞"
  pattern: string;
  meaningZh: string;
  example: string;
}

export interface UsageRelated {
  // e.g. "gloss over"
  phrase: string;
  zh: string;
}

export interface UsageBlock {
  patterns: UsagePattern[];
  related: UsageRelated[];
  // When this part of speech first got a usage block (加入日期); kept
  // across 重新產生. Absent on blocks from before it existed: generatedAt
  // stands in.
  createdAt?: string;
  // The latest (re)generation (更新日期).
  generatedAt: string;
  model: string;
}

// The fixed set of parts of speech the usage feature understands (1006-2
// #17: 名、動、形容、副、介係、連接詞…), in the order every UI list and
// formatPos() use.
export type PosKey = "n" | "v" | "adj" | "adv" | "prep" | "conj" | "pron" | "interj";

export const POS_KEYS: readonly PosKey[] = ["n", "v", "adj", "adv", "prep", "conj", "pron", "interj"];

const POS_LABEL: Record<PosKey, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  conj: "conjunction",
  pron: "pronoun",
  interj: "interjection",
};

// partOfSpeech is free text from the dictionary ("verb", "Verb, noun",
// "transitive verb", "v.", "動詞") or the AI's own pos labels. Order
// matters: a rule whose pattern is a substring of another word (verb ⊂
// adverb, noun ⊂ pronoun) must come after it, and uses a letter-boundary
// guard so it doesn't fire inside that longer word either.
interface PosRule {
  key: PosKey;
  re: RegExp;
}

const POS_RULES: readonly PosRule[] = [
  { key: "adv", re: /adverb|(?<![a-z])adv\.(?![a-z])|副詞/i },
  { key: "pron", re: /pronoun|(?<![a-z])pron\.(?![a-z])|代名詞|代詞/i },
  { key: "v", re: /(?<![a-z])verb\b|(?<![a-z])v\.(?![a-z])|動詞/i },
  { key: "n", re: /(?<![a-z])noun\b|(?<![a-z])n\.(?![a-z])|名詞/i },
  { key: "adj", re: /adjective|(?<![a-z])adj\.(?![a-z])|形容詞/i },
  { key: "prep", re: /preposition|(?<![a-z])prep\.(?![a-z])|介係詞|介詞/i },
  { key: "conj", re: /conjunction|(?<![a-z])conj\.(?![a-z])|連接詞/i },
  { key: "interj", re: /interjection|(?<![a-z])interj\.(?![a-z])|感嘆詞|驚嘆詞/i },
];

// isVerb() kept standalone (rather than `parsePos(x).includes("v")`) so
// VerbUsageService's existing "only verbs get the old verbs.ts/L6 block"
// behaviour doesn't shift if POS_RULES ever grows new synonyms.
const VERB_RE = /(?<![a-z])verb\b|(?<![a-z])v\.(?![a-z])|動詞/i;

export function isVerb(partOfSpeech: string | undefined): boolean {
  return !!partOfSpeech && VERB_RE.test(partOfSpeech);
}

const POS_KEY_SET: ReadonlySet<string> = new Set(POS_KEYS);

// Splits the free text on the usual list separators and resolves each
// piece to a pos key, deduped and returned in the fixed POS_KEYS order
// (not the order they appeared in the text). Two readings, tried in
// order: an exact match to one of our own codes (what the AI is asked to
// answer with — verbUsage.ts's schema has it reply with bare "n"/"v"/
// "adj"/… — too short/ambiguous for the free-text rules below: "v" or
// "n" alone would never safely match "verb"/"noun" as a substring rule
// without also matching inside "adverb"/"pronoun"); otherwise the
// dictionary's free-text spelling via POS_RULES.
export function parsePos(text: string | undefined): PosKey[] {
  const parts = (text ?? "")
    .split(/[,;/、]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const found = new Set<PosKey>();
  for (const part of parts) {
    const code = part.toLowerCase();
    if (POS_KEY_SET.has(code)) {
      found.add(code as PosKey);
      continue;
    }
    for (const rule of POS_RULES) {
      if (rule.re.test(part)) found.add(rule.key);
    }
  }
  return POS_KEYS.filter((k) => found.has(k));
}

// Writes a set of pos keys back out as readable, comma-separated English
// labels (fixed POS_KEYS order), the format partOfSpeech already uses for
// dictionary data ("noun", "verb"). Used after the #20 union.
export function formatPos(keys: readonly PosKey[]): string {
  const set = new Set(keys);
  return POS_KEYS.filter((k) => set.has(k))
    .map((k) => POS_LABEL[k])
    .join(", ");
}

// A word's usage saved (收藏) to its word page — the L6 「寫入單字頁」
// button (1005 回饋 #4), now per part of speech (1006-2 #21). Persisted in
// store/learn.json beside the saved trivia (LearnStore). One per
// entry+pos: the id is derived from the entry, so two devices that save
// the same word's same part of speech end up with one record, and an
// unsave is a tombstone that merges like any other edit (learnMerge.ts).
// The usage itself stays on the entry (VocabEntry.usages); the word
// page's 用法 section shows whatever is there now.
export interface VerbFavorite extends Record_ {
  id: string;
  entryId: string;
  // The word as it was spelled when saved, for when the entry is gone.
  word: string;
  // The part of speech favorited. Absent = legacy record from before pos
  // tracking existed (id "verb:${entryId}") — always means "v".
  pos?: PosKey;
}

// Legacy id (pre-1006-2 #21): always means pos "v". Kept as its own
// function — and as the id favoriteUsage()/unfavoriteUsage() still use
// for pos "v" — so old devices' synced records keep resolving to the same
// id instead of forking into a parallel "usage:${id}:v" record.
export function verbFavoriteId(entryId: string): string {
  return `verb:${entryId}`;
}

// New-format id for every other part of speech.
export function usageFavoriteId(entryId: string, pos: PosKey): string {
  return pos === "v" ? verbFavoriteId(entryId) : `usage:${entryId}:${pos}`;
}

// Reads a favorite's pos back out of its id/pos field for callers that
// only have the raw record (e.g. a bulk scan of learn.json). Legacy
// "verb:${id}" records (no `pos` field, and id doesn't start with
// "usage:") mean "v".
export function usageFavoritePos(fav: Pick<VerbFavorite, "pos">): PosKey {
  return fav.pos ?? "v";
}

interface UsageCarrier {
  usage?: UsageBlock;
  usages?: Partial<Record<PosKey, UsageBlock>>;
}

function ms(iso: string | undefined): number {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

// Reads an entry's usage blocks, merging the legacy single `usage` field
// in under "v" (1006-2 #21): a device that hasn't picked up the new
// format yet keeps writing `usage` on 重新產生, so whichever of the two
// has the newer generatedAt wins — otherwise a sync merge (which compares
// the whole entry's updatedAt, not per-field) could pick a copy whose
// `usage` is newer than the other copy's `usages.v` and silently drop it.
export function usagesOf(entry: UsageCarrier): Partial<Record<PosKey, UsageBlock>> {
  const out = { ...(entry.usages ?? {}) };
  const legacy = entry.usage;
  if (legacy) {
    const current = out.v;
    if (!current || ms(legacy.generatedAt) > ms(current.generatedAt)) out.v = legacy;
  }
  return out;
}
