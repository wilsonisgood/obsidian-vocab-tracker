import { t, type I18nKey } from "../../core/i18n";
import type { ErrorTag, GrammarStage } from "../../core/model/grammar";

// The one place grammar level names and error-tag names come from (wave 15
// integration): chips, sidebar, map, topic page and practice all read these
// through i18n, so 基礎／中級／進階 can't drift between screens.

// 1 → 基礎 / Basic, 2 → 中級 / Intermediate, 3 → 進階 / Advanced.
export function stageLabel(stage: GrammarStage): string {
  return t(`grammar.stage.${stage}` as I18nKey);
}

// One of the 26 error tags, e.g. "tense-choice" → 時態選擇 / Tense choice.
export function errorTagLabel(tag: ErrorTag): string {
  return t(`grammar.errorTag.${tag}` as I18nKey);
}
