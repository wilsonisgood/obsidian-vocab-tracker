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
    // Which source block the word block holds: "段落" (〔出處段落〕),
    // "句子" (〔出處句子〕, captured sentence only) or "" (none).
    sourceKind: string;
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
// falls back to the source sentence. The notice itself is soft (「似乎沒有」,
// and the model is told to ignore it if the selection does hold a form of
// the word), so a false "missing" costs little — while a false "contains"
// silently drops the notice. Hence the asymmetry below:
//
// - The WORD side is stored as clicked (used, eyes, lying, boxes, happier…),
//   not necessarily a base form, so it undoes regular inflection
//   (-s/-es/-ies/-ed/-ied/-ing/-ying) and -ier/-iest. Bare stems need 4+
//   letters (news ≠ new); a rebuilt whole word may have 3 (used → use,
//   eyes → eye, cries → cry, boxes → box). No -er/-est/-y/-ly/-st/-d
//   stripping there, so forest ≠ for, many ≠ man, every ≠ ever, card ≠ car.
// - The SELECTION side also undoes comparatives, adverbs and -y adjectives
//   (happier → happy, easily → easy, glossy → gloss), stems of 4+ letters
//   for those (army ≠ arm, early ≠ ear).
// - Hyphenated tokens are compared part by part and with the hyphen
//   removed: aware ↔ self-aware, well-known ↔ well known, e-mail ↔ email.
// - Irregular forms (gave/give, knives/knife) are NOT handled; the notice's
//   "ignore me if…" sentence covers them.
//
// Minimal rule-based reduction (M4 has no core/wordlists/lemma.ts yet).

const TOKEN_RE = /[a-z0-9]+(?:['-][a-z0-9]+)*/g;
// How many other words may sit between the parts of a multi-word entry
// ("gloss over" → "glossed the problem over").
const MAX_GAP = 3;

function tokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[‐‑]/g, "-")
      .match(TOKEN_RE) ?? []
  );
}

const isConsonant = (c: string) => /[b-df-hj-np-tv-z]/.test(c);

type Side = "word" | "selection";

const ACCIDENTAL = new Set(["she", "the", "her"]);

function wordForms(token: string, side: Side): Set<string> {
  const w = token.endsWith("'s") ? token.slice(0, -2) : token;
  const out = new Set([token, w]);
  const ends = (suf: string) => w.length > suf.length && w.endsWith(suf);
  // On the word side a reduction landing on a very common function word is
  // an accident (shed → she, thing → the, herring → her), never the base.
  const add = (form: string) => {
    if (!(side === "word" && ACCIDENTAL.has(form))) out.add(form);
  };
  // A bare stem left by cutting a suffix; doubled final consonant undone
  // (running → runn → run, biggest → bigg → big).
  const stem = (base: string, min: number) => {
    if (base.length < min) return;
    add(base);
    const last = base[base.length - 1];
    if (last === base[base.length - 2] && isConsonant(last)) add(base.slice(0, -1));
  };
  // A rebuilt full word (studied → study, making → make, lying → lie).
  const rebuilt = (base: string, min: number) => {
    if (base.length >= min) add(base);
  };

  // Regular inflection, both sides. Bare stems need 4+ letters on the word
  // side (news ≠ new); rebuilt whole words only 3 (used → use, cries → cry).
  const min = side === "word" ? 4 : 3;
  if (ends("ies") || ends("ied")) rebuilt(w.slice(0, -3) + "y", 3); // cries → cry
  if (ends("s") && !ends("ss")) {
    const base = w.slice(0, -1);
    // A 3-letter base ending in e is a whole word (eyes → eye, dies → die).
    if (side === "word" && base.endsWith("e")) rebuilt(base, 3);
    else stem(base, min);
  }
  if (ends("es")) {
    const base = w.slice(0, -2);
    // -es only follows s/x/z/ch/sh/o (boxes → box, buses → bus), so on the
    // word side it's a whole word then and junk otherwise (cares ≠ car).
    if (side === "selection") stem(base, min);
    else if (/(?:[sxzo]|ch|sh)$/.test(base)) rebuilt(base, 3);
  }
  if (ends("eed")) {
    // agreed → agree, but seed/feed/need are no past tenses (≠ see/fee).
    rebuilt(w.slice(0, -1), 4);
  } else if (ends("ed")) {
    stem(w.slice(0, -2), min); // walked → walk
    rebuilt(w.slice(0, -1), 3); // used → use, aged → age
  }
  if (ends("ing")) {
    stem(w.slice(0, -3), min); // walking → walk
    rebuilt(w.slice(0, -3) + "e", 3); // making → make, using → use
  }
  if (ends("ying")) rebuilt(w.slice(0, -4) + "ie", 3); // lying → lie
  if (side === "word") {
    // Entries are stored as clicked, so comparatives occur too.
    if (ends("ier")) rebuilt(w.slice(0, -3) + "y", 4); // happier → happy (not pry)
    if (ends("iest")) rebuilt(w.slice(0, -4) + "y", 4); // happiest → happy (priest ≠ pry)
    return out;
  }

  // Selection only: comparatives, superlatives, adverbs, -y adjectives.
  if (ends("ier")) rebuilt(w.slice(0, -3) + "y", 4); // happier → happy
  if (ends("iest")) rebuilt(w.slice(0, -4) + "y", 4);
  if (ends("ily")) rebuilt(w.slice(0, -3) + "y", 4); // easily → easy
  for (const suf of ["er", "est", "r", "st", "ly", "y"]) {
    if (ends(suf)) stem(w.slice(0, -suf.length), 4); // nicer → nice, glossy → gloss
  }
  return out;
}

function sameWord(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

// Parts of a multi-word entry must appear in order, at most MAX_GAP apart.
function inOrder(want: Set<string>[], have: Set<string>[]): boolean {
  const from = (wi: number, si: number): boolean => {
    if (wi === want.length) return true;
    const end = wi === 0 ? have.length : Math.min(have.length, si + MAX_GAP + 1);
    for (let i = si; i < end; i++) {
      if (sameWord(want[wi], have[i]) && from(wi + 1, i + 1)) return true;
    }
    return false;
  };
  return from(0, 0);
}

export function selectionHasWord(selection: string, word: string): boolean {
  const sel = selection.trim();
  if (!sel) return false;
  if (buildWordRe(word.trim()).test(sel)) return true;
  const wordToks = tokens(word);
  // Nothing we can tokenize (symbols, CJK…): don't claim it's missing.
  if (wordToks.length === 0) return true;
  const selToks = tokens(sel);

  // The learner selected the start of the word itself ("glitter" of
  // glittery). Prefix only, 4+ letters and over half the word, so
  // stand ≠ understand, format ≠ information, under ≠ understand.
  const whole = wordToks.join(" ");
  if (selToks.length === 1 && selToks[0] === sel.toLowerCase()) {
    const s = selToks[0];
    if (s.length >= 4 && s.length * 2 > whole.length && whole.startsWith(s)) return true;
  }

  // Word by word, hyphenated tokens split into their parts.
  const parts = (toks: string[], side: Side) => toks.flatMap((t) => t.split("-")).filter(Boolean).map((t) => wordForms(t, side));
  if (inOrder(parts(wordToks, "word"), parts(selToks, "selection"))) return true;

  // Hyphenated vs closed spelling: e-mail ↔ email.
  if (wordToks.length === 1) {
    const joined = wordForms(wordToks[0].replace(/-/g, ""), "word");
    return selToks.some((t) => sameWord(joined, wordForms(t.replace(/-/g, ""), "selection")));
  }
  return false;
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
      sourceKind: sourceParagraph ? "段落" : example ? "句子" : "",
    },
  };
}
