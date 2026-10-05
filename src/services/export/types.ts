// Input shapes for the export renderers.
//
// Family / UsageBlock / TriviaItem (規劃書 06 §4.1) land in core/model with
// M7 (task C). Until then the renderers declare the fields they actually
// read, as structural subsets of those models, so the real types can be
// passed in unchanged once they exist (TypeScript checks the fit at the
// call site in main.ts / the data adapter).

export interface ExportFamilyMember {
  // Set when the member is a word in the vocab list; plain suggestions
  // only have `word`.
  entryId?: string;
  word: string;
  zh: string;
}

export interface ExportFamilyGroup {
  label: string;
  members: ExportFamilyMember[];
}

// ⊂ Family
export interface ExportFamily {
  id: string;
  topic: string;
  label: string;
  groups: ExportFamilyGroup[];
  deletedAt?: string;
}

// ⊂ UsageBlock
export interface ExportUsage {
  patterns: { pattern: string; meaningZh: string; example: string }[];
  related: { phrase: string; zh: string }[];
  // 加入 / 更新日期 (1005 回饋 #14).
  createdAt?: string;
  generatedAt?: string;
}

// ⊂ VerbFavorite: the verb's usage was saved (「寫入單字頁」).
export interface ExportVerbFavorite {
  id: string;
  entryId: string;
  createdAt?: string;
  deletedAt?: string;
}

// ⊂ TriviaItem (a saved / favourited piece of trivia)
export interface ExportTrivia {
  id: string;
  // The word the trivia is about.
  entryId: string;
  // Other learned words the text mentions — entry ids or the words
  // themselves; both are matched.
  mentions: string[];
  title: string;
  body: string;
  createdAt?: string;
  deletedAt?: string;
}

export interface ExportLabels {
  families: string;
  familiesEmpty: string;
  usage: string;
  usageEmpty: string;
  usageRelated: string;
  trivia: string;
  triviaEmpty: string;
  triviaMentionedIn: string;
  discussion: string;
  discussionEmpty: string;
  userNotesHint: string;
  paragraphsEmpty: string;
  paragraphOrphaned: string;
  wordsLearned: string;
  wordsEmpty: string;
  // "{n}" is replaced with the number of questions.
  wordQuestions: string;
  favorites: string;
  favoritesEmpty: string;
  aborted: string;
  // 1005 回饋 (temporary strings in labels.ts until they move to i18n).
  // "{date}" is replaced.
  usageSaved: string;
  usageGenerated: string;
}

// Everything a renderer needs besides its data, injected so the renderers
// stay pure (no clock, no time zone, no vault lookups inside).
export interface RenderContext {
  labels: ExportLabels;
  // ISO timestamp → the short date shown next to a question ("10/03").
  formatDate(iso: string): string;
  // Task id → its quick-action label ("文法"), if it has one.
  taskLabel(taskId: string): string | undefined;
  // The word an entry id stands for, for links to other words' pages.
  entryWord(entryId: string): string | undefined;
  // Link target (path without ".md") of a word's page, or null when the
  // word has no page — then it's printed as plain text instead of a
  // dangling link that would create an empty note when clicked.
  pageLink(word: string, entryId?: string): string | null;
}
