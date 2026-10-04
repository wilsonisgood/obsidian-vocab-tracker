import type { VocabEntry } from "../../../core/model/entry";
import { renderTemplate } from "../../../core/text/template";
import { buildWordRe } from "../../../core/text/wordRe";

// Context for word discussions (規劃書 06 §6.4): the word's own fields, the
// FULL paragraph it was captured from (not just the one sentence — a vague
// question like 「這句為什麼這樣用」 needs the surrounding sentences to be
// resolvable), plus example sentences from other notes.

export type WordFacts = Pick<VocabEntry, "word"> &
  Partial<
    Pick<
      VocabEntry,
      "phonetic" | "partOfSpeech" | "definition" | "definitionZh" | "synonyms" | "antonyms" | "example" | "grammar"
    >
  >;

export interface WordInput {
  entry: WordFacts;
  // Full paragraph from the source note where the word was captured.
  sourceParagraph?: string;
  sourceTitle?: string;
  // Sentences containing the word from other notes (最多幾句，由呼叫端挑).
  otherExamples?: string[];
  selection?: string;
  question?: string;
  // word.compare: the word to compare against; empty = let the model pick.
  compareWith?: string;
}

export interface WordContext {
  wordBlock: string;
  slots: {
    word: string;
    selection: string;
    question: string;
    compareWith: string;
    hasSource: string;
    // "yes" only when there IS a selection and it doesn't contain the word
    // (規劃書 06 §6.4): the template then tells the model to say so on the
    // first line instead of silently falling back to the source paragraph.
    selectionMissesWord: string;
  };
}

export const WORD_TEMPLATE = `〔單字〕{{word}}
{{#phonetic}}音標：{{phonetic}}
{{/phonetic}}{{#partOfSpeech}}詞性：{{partOfSpeech}}
{{/partOfSpeech}}{{#definitionZh}}中文：{{definitionZh}}
{{/definitionZh}}{{#definition}}英文定義：{{definition}}
{{/definition}}{{#synonyms}}同義詞：{{synonyms}}
{{/synonyms}}{{#antonyms}}反義詞：{{antonyms}}
{{/antonyms}}{{#grammar}}學習者的筆記：{{grammar}}
{{/grammar}}
{{#sourceParagraph}}〔出處段落〕{{#sourceTitle}}出自《{{sourceTitle}}》{{/sourceTitle}}
{{sourceParagraph}}
{{/sourceParagraph}}{{^sourceParagraph}}{{#example}}〔出處句子〕
{{example}}
{{/example}}{{/sourceParagraph}}
{{#otherExamples}}〔其他筆記裡的例句〕
{{otherExamples}}{{/otherExamples}}`;

// ── Does the selection contain the word? ──────────────────────────────
// Decided in code rather than left to the model, which otherwise quietly
// falls back to the source sentence. Lenient on purpose: a false "contains"
// only means no reminder (the old behaviour), while a false "missing" would
// tell the learner something wrong. So inflected and derived forms
// (glitter/glittered/glittery, run/running, happy/happier) and multi-word
// entries ("gloss over" in "glossed it over") all count.
//
// Minimal rule-based reduction (M4 has no core/wordlists/lemma.ts yet);
// unlike lemmaCandidates it also strips -er/-est/-y, because here a spurious
// base only matters if the other side reduces to the same string.

const TOKEN_RE = /[a-z0-9]+(?:['-][a-z0-9]+)*/g;
const MIN_BASE = 3;
// How many other words may sit between the parts of a multi-word entry
// ("gloss over" → "glossed the problem over").
const MAX_GAP = 3;

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[‘’]/g, "'").match(TOKEN_RE) ?? [];
}

const isConsonant = (c: string) => /[b-df-hj-np-tv-z]/.test(c);

function wordForms(token: string): Set<string> {
  const w = token.endsWith("'s") ? token.slice(0, -2) : token;
  const out = new Set([token, w]);
  const add = (base: string) => {
    if (base.length < MIN_BASE) return;
    out.add(base);
    // stopped → stopp → stop, bigger → bigg → big, sunny → sunn → sun
    const last = base[base.length - 1];
    if (last === base[base.length - 2] && isConsonant(last)) out.add(base.slice(0, -1));
  };
  for (const suf of ["ies", "ied", "ier", "iest", "ily"]) {
    if (w.endsWith(suf)) add(w.slice(0, -suf.length) + "y"); // studies, happier, easily → y
  }
  if (w.endsWith("ying")) add(w.slice(0, -4) + "ie"); // lying → lie
  for (const suf of ["s", "es", "ed", "d", "ing", "er", "r", "est", "st", "ly", "y"]) {
    if (!w.endsWith(suf) || (suf === "s" && w.endsWith("ss"))) continue;
    const stem = w.slice(0, -suf.length);
    add(stem); // walked → walk, glittery → glitter, nicer → nice
    if (suf === "ing" || suf === "ed" || suf === "er" || suf === "est") add(stem + "e"); // making → make
  }
  return out;
}

function sameWord(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

export function selectionHasWord(selection: string, word: string): boolean {
  const sel = selection.trim();
  if (!sel) return false;
  if (buildWordRe(word.trim()).test(sel)) return true;
  const want = tokens(word).map(wordForms);
  // Nothing we can tokenize (symbols, CJK…): don't claim it's missing.
  if (want.length === 0) return true;
  const have = tokens(sel).map(wordForms);
  // The learner may have selected just part of the word itself ("glitter").
  if (have.length === 1 && sel.length >= MIN_BASE && word.toLowerCase().includes(sel.toLowerCase())) return true;

  // Parts of a multi-word entry must appear in order, at most MAX_GAP apart.
  const matchFrom = (wi: number, si: number): boolean => {
    if (wi === want.length) return true;
    const end = wi === 0 ? have.length : Math.min(have.length, si + MAX_GAP + 1);
    for (let i = si; i < end; i++) {
      if (sameWord(want[wi], have[i]) && matchFrom(wi + 1, i + 1)) return true;
    }
    return false;
  };
  return matchFrom(0, 0);
}

export function buildWordContext(input: WordInput): WordContext {
  const e = input.entry;
  const sourceParagraph = input.sourceParagraph?.trim() ?? "";
  const selection = input.selection?.trim() ?? "";
  const example = e.example?.trim() ?? "";
  return {
    wordBlock: renderTemplate(WORD_TEMPLATE, {
      word: e.word,
      phonetic: e.phonetic,
      partOfSpeech: e.partOfSpeech,
      definitionZh: e.definitionZh,
      definition: e.definition,
      synonyms: e.synonyms,
      antonyms: e.antonyms,
      grammar: e.grammar,
      sourceParagraph,
      sourceTitle: input.sourceTitle?.trim(),
      example,
      otherExamples: (input.otherExamples ?? []).map((s) => `- ${s.trim()}`).join("\n"),
    }),
    slots: {
      word: e.word,
      selection,
      question: input.question?.trim() ?? "",
      compareWith: input.compareWith?.trim() ?? "",
      hasSource: sourceParagraph || example ? "yes" : "",
      selectionMissesWord: selection && !selectionHasWord(selection, e.word) ? "yes" : "",
    },
  };
}
