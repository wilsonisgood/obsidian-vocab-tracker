import type { VocabEntry } from "../../../core/model/entry";
import { renderTemplate } from "../../../core/text/template";

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

export function buildWordContext(input: WordInput): WordContext {
  const e = input.entry;
  const sourceParagraph = input.sourceParagraph?.trim() ?? "";
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
      selection: input.selection?.trim() ?? "",
      question: input.question?.trim() ?? "",
      compareWith: input.compareWith?.trim() ?? "",
      hasSource: sourceParagraph || example ? "yes" : "",
    },
  };
}
