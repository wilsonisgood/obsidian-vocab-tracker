import type { DeletionImpact } from "../../services/learn/linkage";
import { t } from "../../core/i18n";

// What the delete confirm dialog (DeleteEntryModal) lists, in a fixed
// order. Pure (takes a DeletionImpact, nothing live) so it's unit-tested
// without opening a modal.
export function deletionImpactLines(impact: DeletionImpact): string[] {
  const lines: string[] = [];
  if (impact.families > 0) lines.push(t("deleteEntry.impact.families", { n: impact.families }));
  if (impact.triviaMentions > 0) lines.push(t("deleteEntry.impact.trivia", { n: impact.triviaMentions }));
  if (impact.verbFavorite) lines.push(t("deleteEntry.impact.verbFavorite"));
  if (impact.wordPageExists) lines.push(t("deleteEntry.impact.wordPage"));
  if (impact.threadCount > 0) lines.push(t("deleteEntry.impact.threads", { n: impact.threadCount }));
  return lines;
}
