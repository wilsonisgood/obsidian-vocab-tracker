import { t } from "../../../core/i18n";
import type { PolySense } from "../../../core/model/poly";
import type { FilterGroup, FilterValue } from "./filterBarModel";
import type { GrammarRef, MixCategory, ScenarioRequest, VocabRef } from "./mixTypes";

// Pure logic of the 混合 tab (第十七波 V): which categories to mix, the
// request, the summary line and the per-category tally.

export const MIX_CATEGORIES: readonly MixCategory[] = ["vocab", "grammar", "poly"];

export interface MixFilter {
  include: MixCategory[];
}

// Nothing stored yet = all three. A stored empty list stays empty.
export function parseMixFilter(raw: unknown): MixFilter {
  const inc = (raw as { include?: unknown } | null | undefined)?.include;
  if (!Array.isArray(inc)) return { include: [...MIX_CATEGORIES] };
  return { include: MIX_CATEGORIES.filter((c) => inc.includes(c)) };
}

export function mixFilterToValue(f: MixFilter): FilterValue {
  return f.include.length > 0 ? { include: [...f.include] } : {};
}

export function valueToMixFilter(v: FilterValue): MixFilter {
  return parseMixFilter({ include: v.include ?? [] });
}

export function categoryLabel(c: MixCategory): string {
  return t(c === "vocab" ? "practice.mix.catVocab" : c === "grammar" ? "practice.mix.catGrammar" : "practice.mix.catPoly");
}

export function mixGroups(): FilterGroup[] {
  return [
    {
      id: "include",
      label: t("practice.mix.include"),
      multi: true,
      options: MIX_CATEGORIES.map((c) => ({ id: c, label: categoryLabel(c) })),
    },
  ];
}

export interface MixSources {
  vocab: readonly VocabRef[];
  grammar: readonly GrammarRef[];
  poly: { tested: readonly PolySense[]; reference: readonly PolySense[] };
}

// 「單字 12 字 · 文法 3 個主題 · 常用字 get, of」; a chosen category with
// nothing to ask about reads 「文法（未設定）」.
export function mixSummary(f: MixFilter, src: MixSources): string {
  if (f.include.length === 0) return t("practice.mix.none");
  const parts: string[] = [];
  for (const c of MIX_CATEGORIES) {
    if (!f.include.includes(c)) continue;
    const label = categoryLabel(c);
    if (c === "vocab") {
      parts.push(src.vocab.length > 0 ? t("practice.mix.sumVocab", { n: src.vocab.length }) : label + t("practice.mix.unset"));
    } else if (c === "grammar") {
      const topics = new Set(src.grammar.map((g) => g.topicId)).size;
      parts.push(topics > 0 ? t("practice.mix.sumGrammar", { n: topics }) : label + t("practice.mix.unset"));
    } else {
      const words = [...new Set(src.poly.tested.map((s) => s.word))];
      parts.push(words.length > 0 ? t("practice.mix.sumPoly", { words: words.join(", ") }) : label + t("practice.mix.unset"));
    }
  }
  return parts.join(" · ");
}

// Empty categories are left out; null when nothing is left.
export function buildMixRequest(f: MixFilter, src: MixSources): ScenarioRequest | null {
  const req: Extract<ScenarioRequest, { track: "mix" }> = { track: "mix" };
  if (f.include.includes("vocab") && src.vocab.length > 0) req.vocab = [...src.vocab];
  if (f.include.includes("grammar") && src.grammar.length > 0) req.grammar = [...src.grammar];
  if (f.include.includes("poly") && src.poly.tested.length > 0) {
    req.poly = { tested: [...src.poly.tested], reference: [...src.poly.reference] };
  }
  return req.vocab || req.grammar || req.poly ? req : null;
}

// Every focus id the request may ask about (applyScope keeps only these).
export function mixFocusIds(req: ScenarioRequest | null): Set<string> {
  const ids = new Set<string>();
  if (req?.track !== "mix") return ids;
  for (const v of req.vocab ?? []) ids.add(v.id);
  for (const g of req.grammar ?? []) ids.add(`${g.topicId}/${g.objectiveId}`);
  for (const s of req.poly?.tested ?? []) ids.add(s.id);
  return ids;
}

// ── Tally ───────────────────────────────────────────────────────

export interface Tally {
  right: number;
  total: number;
}
export type MixTally = Record<MixCategory, Tally>;

export function emptyTally(): MixTally {
  return { vocab: { right: 0, total: 0 }, grammar: { right: 0, total: 0 }, poly: { right: 0, total: 0 } };
}

// 「單字 · reluctant」 → vocab. Null for a tag with no known prefix.
export function categoryOfTag(tag: string | undefined): MixCategory | null {
  if (!tag) return null;
  for (const c of MIX_CATEGORIES) {
    const l = categoryLabel(c);
    if (tag === l || tag.startsWith(`${l} ·`)) return c;
  }
  return null;
}

// Mutates `tally`. A hinted right answer is not a clean one.
export function recordAnswer(tally: MixTally, tag: string | undefined, correct: boolean, hinted: boolean): void {
  const c = categoryOfTag(tag);
  if (!c) return;
  tally[c].total += 1;
  if (correct && !hinted) tally[c].right += 1;
}

// 「單字 1/2 · 文法 0/1」; categories not answered yet are left out.
export function tallyText(tally: MixTally): string {
  return MIX_CATEGORIES.filter((c) => tally[c].total > 0)
    .map((c) => `${categoryLabel(c)} ${tally[c].right}/${tally[c].total}`)
    .join(" · ");
}

// The tag a question gets in the player (「單字 · reluctant」).
export function categoryTag(c: MixCategory, name: string): string {
  return name ? `${categoryLabel(c)} · ${name}` : categoryLabel(c);
}
