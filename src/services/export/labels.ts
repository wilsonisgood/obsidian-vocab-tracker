import { t } from "../../core/i18n";
import type { ExportLabels } from "./types";

// Headings and fixed text written into exported notes, in the plugin's
// current language (`export.*` keys in core/i18n).

const KEYS: (keyof ExportLabels)[] = [
  "families",
  "familiesEmpty",
  "usage",
  "usageEmpty",
  "usageRelated",
  "trivia",
  "triviaEmpty",
  "triviaMentionedIn",
  "discussion",
  "discussionEmpty",
  "userNotesHint",
  "paragraphsEmpty",
  "paragraphOrphaned",
  "wordsLearned",
  "wordsEmpty",
  "wordQuestions",
  "favorites",
  "favoritesEmpty",
  "aborted",
];

export function exportLabels(): ExportLabels {
  const labels = {} as ExportLabels;
  for (const key of KEYS) labels[key] = t(`export.${key}`);
  return labels;
}
