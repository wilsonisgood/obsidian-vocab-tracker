import type { VocabEntry } from "../../../core/model/entry";
import { renderTemplate } from "../../../core/text/template";
import type { WordFacts } from "./wordContext";

// Context for the trivia chat (規劃書 06 §6.4): the learned-word list (at
// most 200, most recent first — cached, since it barely changes between
// requests), the subject word of this round, and the titles already told
// so the model doesn't repeat itself.

export const MAX_KNOWN_WORDS = 200;
export const MAX_TOLD = 40;

export interface ToldTrivia {
  word: string;
  title: string;
}

export interface TriviaInput {
  // The word this round is about. Absent only for a follow-up when the
  // conversation has no subject yet.
  subject?: WordFacts;
  // Learned words, most recent first (see knownWordList).
  knownWords: string[];
  // Size of the whole vocab list, when knownWords was capped.
  knownTotal?: number;
  // Already told, most recent first.
  told?: ToldTrivia[];
  // trivia.followup
  question?: string;
  selection?: string;
}

export interface TriviaContext {
  knownBlock: string;
  subjectBlock: string;
  toldBlock: string;
  slots: { word: string; question: string; selection: string };
}

export const KNOWN_TEMPLATE = `〔已學單字〕{{#capped}}（共 {{total}} 個，以下是最近學的 {{count}} 個）{{/capped}}
{{words}}`;

export const SUBJECT_TEMPLATE = `〔這次的主角〕{{word}}
{{#phonetic}}音標：{{phonetic}}
{{/phonetic}}{{#partOfSpeech}}詞性：{{partOfSpeech}}
{{/partOfSpeech}}{{#definitionZh}}中文：{{definitionZh}}
{{/definitionZh}}{{#definition}}英文定義：{{definition}}
{{/definition}}{{#example}}學習者遇到它的句子：{{example}}
{{/example}}`;

export const TOLD_TEMPLATE = `〔已講過的冷知識〕（不要重複這些內容；同一個字要換一個角度）
{{told}}`;

// When the word was added, for 「最近學的」 ordering and the 14-day
// priority in services/learn/triviaPick.ts.
export function entryAddedMs(e: VocabEntry): number {
  const iso = e.createdAt ? Date.parse(e.createdAt) : NaN;
  if (!Number.isNaN(iso)) return iso;
  // Legacy local-time stamp "YYYY-MM-DD HH:MM:SS".
  const legacy = e.added ? Date.parse(e.added.replace(" ", "T")) : NaN;
  return Number.isNaN(legacy) ? 0 : legacy;
}

// Live entries, most recently added first, capped at `max`. Words are
// de-duplicated case-insensitively (the list may hold "Apron" and "apron").
export function knownWordList(entries: readonly VocabEntry[], max = MAX_KNOWN_WORDS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const sorted = entries.filter((e) => !e.deletedAt).sort((a, b) => entryAddedMs(b) - entryAddedMs(a));
  for (const e of sorted) {
    const key = e.word.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(e.word.trim());
    if (out.length >= max) break;
  }
  return out;
}

export function buildTriviaContext(input: TriviaInput): TriviaContext {
  const s = input.subject;
  const total = Math.max(input.knownTotal ?? 0, input.knownWords.length);
  const told = (input.told ?? []).slice(0, MAX_TOLD);
  return {
    knownBlock: renderTemplate(KNOWN_TEMPLATE, {
      capped: total > input.knownWords.length ? "yes" : "",
      total,
      count: input.knownWords.length,
      words: input.knownWords.join(", "),
    }),
    subjectBlock: s
      ? renderTemplate(SUBJECT_TEMPLATE, {
          word: s.word,
          phonetic: s.phonetic,
          partOfSpeech: s.partOfSpeech,
          definitionZh: s.definitionZh,
          definition: s.definition,
          example: s.example?.trim(),
        })
      : "",
    toldBlock: told.length
      ? renderTemplate(TOLD_TEMPLATE, { told: told.map((t) => `- ${t.word}：${t.title}`).join("\n") })
      : "",
    slots: {
      word: s?.word ?? "",
      question: input.question?.trim() ?? "",
      selection: input.selection?.trim() ?? "",
    },
  };
}
