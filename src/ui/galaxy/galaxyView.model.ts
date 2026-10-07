import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import { familyMembers, type Family } from "../../core/model/family";
import type { WordBreakdown } from "../../core/model/morpheme";
import { noteBasename } from "../../core/text/slug";
import { buildGalaxyModel, constellationPoints, galaxyNodeId, type ConstellationPoint, type GalaxyLookup, type GalaxyModel } from "./galaxyModel";

// Pure view-models for the Galaxy block integration (規劃書 09 §6.2,
// w9-rules.md「GB」) — the topic list, onAdd(id) resolution, toast copy and
// the detail panel's data. No "obsidian" import, so these are unit-tested
// without a DOM; families.ts / GalaxyView.ts own the DOM wiring around them.

export type GalaxyViewMode = "galaxy" | "list";

// ── 主題清單 ───────────────────────────────────────────────────────

export interface GalaxyTopic {
  id: string;
  // English key (prototype's t.name) / Chinese label (t.zh) — shown on two
  // lines (原型 renderTopics).
  topic: string;
  label: string;
  emoji: string;
  known: number;
  unknown: number;
  points: ConstellationPoint[];
}

// One entry per family, in the order given (same order `families()` /
// `pickSelected` already use elsewhere) — each built from the same
// `buildGalaxyModel` the graph itself draws, so the thumbnail/counts never
// drift from what opening that topic actually shows.
export function buildTopics(families: readonly Family[], lookup: GalaxyLookup): GalaxyTopic[] {
  return families.map((f) => {
    const model = buildGalaxyModel(f, lookup, { onlyKnown: false });
    const hub = model.nodes.find((n) => n.kind === "hub");
    const words = model.nodes.filter((n) => n.kind === "known" || n.kind === "unknown");
    return {
      id: f.id,
      topic: f.topic,
      label: f.label,
      emoji: hub?.emoji ?? "🌌",
      known: model.counts.known,
      unknown: model.counts.unknown,
      points: constellationPoints(
        words.length,
        words.map((w) => w.kind === "known")
      ),
    };
  });
}

// ── onAdd(id) → which word to addSuggested ──────────────────────────
//
// GalaxyGraph's onAdd only ever hands back a node id — `w:<word>` for a
// plain suggestion, or an entryId for a tracked-but-unliked member (A3).
// Either way FamilyService.addSuggested(familyId, word) is the right call
// (it resolves "already tracked, not liked" → just like, by itself); this
// just finds which member that id came from.
export function resolveAddWord(id: string, family: Family): string | undefined {
  for (const m of familyMembers(family)) {
    if (!m.word.trim()) continue;
    if (galaxyNodeId(m) === id) return m.word;
  }
  return undefined;
}

// ── 詳情面板（GalaxyDetail）───────────────────────────────────────

export interface GalaxyDetailRow {
  entryId: string;
  word: string;
  zh: string;
  emoji: string;
}

// The topic's learned words (原型右欄「這個主題已學的字」), in the same
// dedup/order as the graph's own nodes.
export function detailRows(model: GalaxyModel): GalaxyDetailRow[] {
  return model.nodes
    .filter((n): n is typeof n & { entryId: string } => n.kind === "known" && !!n.entryId)
    .map((n) => ({ entryId: n.entryId, word: n.word, zh: n.zh, emoji: n.emoji }));
}

export interface GalaxyCardData {
  entryId: string;
  word: string;
  emoji: string;
  phonetic: string;
  partOfSpeech: string;
  zh: string;
  example: string;
  // 「出自 <檔名>」, already localized — null when the entry has no source.
  sourceLabel: string | null;
  // Only ever set when its status is "ok" (A8/09 §2 決定 4) — undefined
  // otherwise, so the caller never needs to re-check status.
  breakdown?: WordBreakdown;
}

export function buildGalaxyCard(entry: VocabEntry, emoji: string, breakdown: WordBreakdown | undefined): GalaxyCardData {
  return {
    entryId: entry.id,
    word: entry.word,
    emoji,
    phonetic: entry.phonetic,
    partOfSpeech: entry.partOfSpeech,
    zh: entry.definitionZh,
    example: entry.example,
    sourceLabel: entry.source ? t("wordPage.source", { source: noteBasename(entry.source.path) }) : null,
    breakdown: breakdown?.status === "ok" ? breakdown : undefined,
  };
}
