import type { Record_ } from "./entry";

// Word DNA morphemes (規劃書 09 §2 決定 1-5, §3). Persisted in
// store/learn.json's wordMeta/morphemes arrays, owned by
// services/learn/LearnStore. A morpheme is a prefix/suffix/root shared by
// several words ("un-", "-tion", "spect"); VocabEntry never stores these —
// see learn.json's wordMeta[] (決定 1) for the per-word emoji/breakdown.

export type MorphemeType = "prefix" | "suffix" | "root";

export interface Morpheme extends Record_ {
  id: string;
  form: string;
  // Alternate spellings this morpheme also covers (e.g. "tion"/"sion"),
  // compared the same way as `form` by matchMorpheme().
  variants: string[];
  type: MorphemeType;
  meaningZh: string;
  // VocabEntry.origin-style tag for words added from this morpheme's
  // suggestions ("dna:<id>") — see morphemeOrigin()/originMorphemeId().
  origin: string;
  timeline: { stage: string; form: string }[];
  fact?: { title: string; body: string };
  suggested: { word: string; zh: string; emoji: string }[];
  source: "ai" | "manual";
  verified?: boolean;
  // Set when a multi-device merge found this morpheme is a duplicate of
  // another one (same type + form/variant) made on a different device:
  // this record becomes a redirect to the canonical id (dedupeMorphemes()
  // in learnMerge.ts). Readers use resolveMorphemeId() to follow it.
  mergedInto?: string;
}

export interface BreakdownPart {
  text: string;
  type: MorphemeType | "inflection";
  meaningZh: string;
  // Absent for an "inflection" part (and for a part no morpheme record
  // was ever made for).
  morphemeId?: string;
}

export interface WordBreakdown {
  // "none" = the word couldn't be split into morphemes (決定 5); `parts`
  // is then empty and `gloss` still holds the whole-word meaning.
  status: "ok" | "none";
  parts: BreakdownPart[];
  gloss: string;
  word: string;
  generatedAt: string;
  model: string;
}

// Lowercases and strips hyphens/whitespace so "un-", "Un", " un " and
// "un" all compare equal — the same normalization matchMorpheme() and
// dedupeMorphemes() (learnMerge.ts) key on.
export function normalizeForm(s: string): string {
  return s.toLowerCase().replace(/[-\s]/g, "");
}

export function morphemeKey(type: MorphemeType, form: string): string {
  return `${type}:${normalizeForm(form)}`;
}

// Finds a morpheme of the given type whose form or variants normalize to
// the same string. Skips tombstones and records already redirected by a
// merge (mergedInto) — callers should resolve through the live copy, not
// match a defunct duplicate.
export function matchMorpheme(list: readonly Morpheme[], type: MorphemeType, form: string): Morpheme | undefined {
  const key = normalizeForm(form);
  return list.find((m) => {
    if (m.deletedAt || m.mergedInto) return false;
    if (m.type !== type) return false;
    if (normalizeForm(m.form) === key) return true;
    return m.variants.some((v) => normalizeForm(v) === key);
  });
}

// Follows a chain of mergedInto redirects to the final (live) id — 決定 3:
// "breakdown 裡的 morphemeId 讀取時經 resolveMorphemeId() 轉址". Guards
// against a cycle (shouldn't happen, but two devices racing a merge could
// in principle produce one) by stopping as soon as an id repeats.
export function resolveMorphemeId(list: readonly Morpheme[], id: string): string {
  const byId = new Map(list.map((m) => [m.id, m]));
  const seen = new Set<string>();
  let current = id;
  while (!seen.has(current)) {
    seen.add(current);
    const next = byId.get(current)?.mergedInto;
    if (!next) return current;
    current = next;
  }
  return current;
}

// 決定 4: inflectional suffixes a word-breakdown part can be tagged
// "inflection" for, instead of a real morpheme (-s, -es, -ed, -d, -ing,
// -er, -est, 's). A plain whitelist, not a rule — these are the only
// endings DNA ever marks this way.
const INFLECTIONS: ReadonlySet<string> = new Set(["s", "es", "ed", "d", "ing", "er", "est", "'s"]);

export function isInflection(text: string): boolean {
  return INFLECTIONS.has(text.trim().toLowerCase());
}

// VocabEntry.origin for words added from a morpheme's suggestions (A9/GS
// addSuggested()). Mirrors core/model/family.ts's familyOrigin/originFamilyId.
export type DnaOrigin = `dna:${string}`;

export function morphemeOrigin(id: string): DnaOrigin {
  return `dna:${id}`;
}

export function originMorphemeId(origin: string | undefined): string | null {
  if (!origin?.startsWith("dna:")) return null;
  const id = origin.slice("dna:".length).trim();
  return id || null;
}

// One DNA discussion thread per morpheme (A9), the same way wordThreadId()
// gives one thread per word.
export const DNA_THREAD_PREFIX = "morpheme:";

export function morphemeThreadId(id: string): string {
  return `${DNA_THREAD_PREFIX}${id}`;
}
