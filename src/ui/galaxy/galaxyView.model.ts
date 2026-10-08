import { familyMembers, type Family } from "../../core/model/family";
import { familyEmoji, galaxyNodeId } from "./galaxyModel";

// Pure view-models for the Galaxy block integration (規劃書 09 §6.2, 10 §2 —
// 1007-2 #4-#5: the topic list is now just emoji/英文/中文, no counts or
// constellation thumbnail; #7 拿掉 GalaxyDetail, so its card/row
// view-models are gone too) — the topic list and onAdd(id) resolution. No
// "obsidian" import, so these are unit-tested without a DOM; families.ts /
// GalaxyView.ts own the DOM wiring around them.

export type GalaxyViewMode = "galaxy" | "list";

// ── 主題列 (#4) ───────────────────────────────────────────────────

export interface GalaxyTopic {
  id: string;
  // English key (prototype's t.name) / Chinese label (t.zh).
  topic: string;
  label: string;
  emoji: string;
}

// One entry per family, in the order given (same order `families()` /
// `pickSelected` already use elsewhere).
export function buildTopics(families: readonly Family[]): GalaxyTopic[] {
  return families.map((f) => ({ id: f.id, topic: f.topic, label: f.label, emoji: familyEmoji(f) }));
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
