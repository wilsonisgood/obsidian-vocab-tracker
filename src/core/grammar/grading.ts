import type { GrammarQuestion, GrammarQuestionType } from "../model/grammar";

// Local grading for grammar questions (wave 15 P, 1013 §1.4). choice and
// find-error compare against the options; blank compares against answer +
// accepted after normalising the things a learner shouldn't be marked down
// for (case, spacing, final punctuation, curly quotes, contractions).
// rewrite / translate can't be graded by string comparison: they come back
// as needsAi — the practice block sends them to the grammar.grade task when
// AI is on, and otherwise lets the learner compare with the sample answer
// and mark themselves (wave 15 R2).

export interface GradeResult {
  correct: boolean;
  // The given answer tidied up (and, for a picked option, the option's own
  // text), for display and storage.
  normalizedGiven: string;
  // True for the types only an AI can judge; `correct` is false meanwhile.
  needsAi?: boolean;
}

export const LOCAL_TYPES: ReadonlySet<GrammarQuestionType> = new Set(["choice", "blank", "find-error"]);

export function canGradeLocally(q: Pick<GrammarQuestion, "type">): boolean {
  return LOCAL_TYPES.has(q.type);
}

// Every type can be asked in a round: the open ones (rewrite / translate)
// are graded by the AI or by the learner (R2), so a bank question of any
// type is askable.
export function isAskable(q: Pick<GrammarQuestion, "type">): boolean {
  return canGradeLocally(q) || isOpenQuestion(q);
}

// rewrite / translate: free multi-line answers with a sample answer.
export function isOpenQuestion(q: Pick<GrammarQuestion, "type">): boolean {
  return q.type === "rewrite" || q.type === "translate";
}

// ── Normalising ───────────────────────────────────────────────────

function tidy(s: string): string {
  return s
    .replace(/[‘’‛ʼ′`´]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.,;:!?]+$/, "");
}

// What gets stored/shown for a typed answer: tidy, original case kept.
function display(s: string): string {
  return tidy(s);
}

// Contractions that always mean one thing.
const IRREGULAR: [RegExp, string][] = [
  [/\bwon't\b/g, "will not"],
  [/\bcan't\b/g, "can not"],
  [/\bcannot\b/g, "can not"],
  [/\bshan't\b/g, "shall not"],
];
const SUFFIXES: [RegExp, string][] = [
  [/n't\b/g, " not"],
  [/'m\b/g, " am"],
  [/'re\b/g, " are"],
  [/'ve\b/g, " have"],
  [/'ll\b/g, " will"],
];
// 's after these is is/has, never a possessive.
const S_HOSTS = "he|she|it|that|there|here|what|who|where|when|how|why|which|everyone|someone|nobody|nothing|something|everything";

function expandFixed(s: string): string {
  let out = s.replace(/\blet's\b/g, "let us");
  for (const [re, to] of IRREGULAR) out = out.replace(re, to);
  for (const [re, to] of SUFFIXES) out = out.replace(re, to);
  return out;
}

const AMBIGUOUS_RE = new RegExp(`\\b(\\w+)'d\\b|\\b(${S_HOSTS})'s\\b`);
const MAX_VARIANTS = 16;

// 'd = had / would and 's = is / has: keep both readings so "I'd gone"
// matches "I had gone" and "she's tall" matches "she is tall".
function variantsOf(s: string): string[] {
  let out = [s];
  for (let guard = 0; guard < 4; guard++) {
    const next: string[] = [];
    let changed = false;
    for (const x of out) {
      const m = AMBIGUOUS_RE.exec(x);
      if (!m) {
        next.push(x);
        continue;
      }
      changed = true;
      const head = x.slice(0, m.index);
      const tail = x.slice(m.index + m[0].length);
      const opts = m[1] !== undefined ? [`${m[1]} had`, `${m[1]} would`] : [`${m[2]} is`, `${m[2]} has`];
      for (const o of opts) next.push(head + o + tail);
    }
    out = next.slice(0, MAX_VARIANTS);
    if (!changed) break;
  }
  return out;
}

function forms(s: string): string[] {
  return variantsOf(expandFixed(tidy(s).toLowerCase()));
}

function sameOption(a: string, b: string): boolean {
  return tidy(a).toLowerCase() === tidy(b).toLowerCase();
}

// ── grade ─────────────────────────────────────────────────────────

export function grade(question: GrammarQuestion, given: string): GradeResult {
  switch (question.type) {
    case "choice":
    case "find-error": {
      const picked = (question.options ?? []).find((o) => sameOption(o, given));
      return {
        correct: !!picked && sameOption(picked, question.answer),
        normalizedGiven: picked ?? display(given),
      };
    }
    case "blank": {
      const accepted = [question.answer, ...(question.accepted ?? [])].flatMap(forms);
      const mine = forms(given);
      return {
        correct: given.trim() !== "" && mine.some((f) => accepted.includes(f)),
        normalizedGiven: display(given),
      };
    }
    default:
      // Open answers keep their punctuation and line breaks: the AI judges
      // the whole text, and the learner compares it with the sample.
      return { correct: false, normalizedGiven: given.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim(), needsAi: true };
  }
}
