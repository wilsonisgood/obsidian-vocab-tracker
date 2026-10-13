import type { GrammarSighting } from "../model/grammar";
import { topicById } from "./catalog";

// Real sentences for question writing (wave 15 R2, 1013 §3.4): where the
// learner asked 文法解析 about a paragraph and the answer named this topic,
// pick the one sentence of it that most likely shows the topic, so the AI
// can adapt it into a question. Pure; the note text only ever reaches the
// AI through this (at most `max` sentences, each 8–40 English words).

export const MIN_WORDS = 8;
export const MAX_WORDS = 40;
export const DEFAULT_MAX_SENTENCES = 3;

export interface TopicSentence {
  path: string;
  sentence: string;
}

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;
const CJK_RE = /[぀-ヿ㐀-鿿가-힯]/g;

// Pattern words that stand for "some verb form", not for a word to look for.
const PLACEHOLDERS = new Set(["do", "doing", "done", "ing", "pp", "vs", "or", "and", "ed", "en", "v"]);

// Markdown that would only get in the way of a sentence.
function plain(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "\n\n")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "")
    .replace(/^[ \t]*>+[ \t]?/gm, "")
    .replace(/(\*\*|__|\*|~~|==)/g, "")
    .replace(/[ \t]+/g, " ");
}

// Sentences of a text: cut at . ! ? (and their closing quotes) followed by a
// capital, and at blank lines; a line break inside a paragraph is a space.
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const block of plain(text).split(/\n\s*\n/)) {
    const flat = block.replace(/\s*\n\s*/g, " ").trim();
    if (!flat) continue;
    for (const part of flat.split(/(?<=[.!?…]["'”’)\]]?)\s+(?=["'“‘([]?[A-Z0-9])/)) {
      const s = part.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

export function englishWords(s: string): string[] {
  return s.match(WORD_RE) ?? [];
}

// A sentence worth turning into a question: 8–40 English words, and mostly
// English (a Chinese gloss line or a vocabulary list isn't one).
export function isUsableSentence(s: string): boolean {
  const n = englishWords(s).length;
  if (n < MIN_WORDS || n > MAX_WORDS) return false;
  const cjk = (s.match(CJK_RE) ?? []).length;
  return cjk <= s.length * 0.1;
}

const key = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// The words of the topic's pattern to look for ("have done / did" →
// have, did). Placeholders for a verb form and one-letter bits are left out.
export function patternWords(pattern: string): string[] {
  const out: string[] = [];
  for (const w of pattern.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (w.length < 2 || PLACEHOLDERS.has(w) || out.includes(w)) continue;
    out.push(w);
  }
  return out;
}

function score(sentence: string, words: readonly string[]): number {
  if (!words.length) return 0;
  const have = new Set(englishWords(sentence).map((w) => w.toLowerCase().replace(/’/g, "'")));
  return words.reduce((n, w) => n + (have.has(w) ? 1 : 0), 0);
}

// The best sentence of the candidates: the one that matches most of the
// topic's pattern words, the longest among equals — and when none matches
// (or the topic is unknown) simply the longest usable one.
export function pickSentence(candidates: readonly string[], pattern: string): string | undefined {
  const words = patternWords(pattern);
  let best: { s: string; score: number; len: number } | undefined;
  for (const s of candidates) {
    if (!isUsableSentence(s)) continue;
    const cur = { s, score: score(s, words), len: englishWords(s).length };
    if (!best || cur.score > best.score || (cur.score === best.score && cur.len > best.len)) best = cur;
  }
  return best?.s;
}

// What the learner was looking at: the sentence their highlight sits in, the
// highlight itself when it is a sentence or more, otherwise the paragraph.
function candidatesOf(s: GrammarSighting): string[] {
  const sel = s.selection?.trim();
  const all = splitSentences(s.snapshot);
  if (!sel) return all;
  const flatSel = key(plain(sel));
  const inside = all.filter((x) => key(x).includes(flatSel));
  if (inside.length) return inside;
  const own = splitSentences(sel);
  return own.some(isUsableSentence) ? own : all;
}

// At most `max` sentences for the topic, newest sighting first, one per
// sighting and no repeats.
export function topicSentences(
  sightings: readonly GrammarSighting[],
  topicId: string,
  max = DEFAULT_MAX_SENTENCES
): TopicSentence[] {
  const pattern = topicById(topicId)?.pattern ?? "";
  const out: TopicSentence[] = [];
  const seen = new Set<string>();
  for (const s of sightings) {
    if (out.length >= max) break;
    if (s.topicId !== topicId) continue;
    // The highlighted sentence first; if it can't be used, the paragraph.
    const sentence = pickSentence(candidatesOf(s), pattern) ?? pickSentence(splitSentences(s.snapshot), pattern);
    if (!sentence || seen.has(key(sentence))) continue;
    seen.add(key(sentence));
    out.push({ path: s.path, sentence });
  }
  return out;
}
