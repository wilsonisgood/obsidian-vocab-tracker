import type { GrammarQuestion } from "../../core/model/grammar";

// 第十六波: the grammar practice contracts the UI uses. G owns them
// (core/grammar/practiceFilter.ts, services/grammar/practiceApi.ts); the UI
// keeps importing from here.
export type { GrammarFilter } from "../../core/grammar/practiceFilter";
export { parseGrammarFilter, topicsInFilter } from "../../core/grammar/practiceFilter";
export type { GrammarPracticeApi } from "../../services/grammar/practiceApi";

// GrammarQuestion carries scenario / sentenceZh itself now.
export type GrammarQuestionLike = GrammarQuestion;
