import type { VocabEntry } from "../model/entry";

// Live entries with no definition in either language — a dictionary fetch
// that never ran (Obsidian closed mid-queue) or failed (offline). Retried
// in the background at every startup.
export function entriesMissingDefinition(entries: readonly VocabEntry[]): VocabEntry[] {
  return entries.filter((e) => !e.deletedAt && !e.definition?.trim() && !e.definitionZh?.trim());
}

// Wiktionary's inflection stubs: "plural of stress", "simple past and past
// participle of scud" (1010-2 A1).
const FORM_OF_RE =
  /^(?:(?:plural|singular|simple|past|present|participle|gerund|tense|third-person|indicative|subjunctive|comparative|superlative|form|and)\s+)+of\s+[\w'-]+\.?$/i;
export function isFormOfSentence(definition: string | undefined): boolean {
  return FORM_OF_RE.test((definition ?? "").trim());
}

// Words looked up by an older version (no sensesZh yet — new lookups always
// write it, even as "") whose gloss looks like the old wordy output or
// whose definition is a bare form-of sentence (1010-2 A3).
export function entriesNeedingRefresh(entries: readonly VocabEntry[]): VocabEntry[] {
  return entries.filter(
    (e) =>
      !e.deletedAt &&
      e.sensesZh === undefined &&
      ((e.definitionZh ?? "").trim().length > 15 || isFormOfSentence(e.definition))
  );
}
