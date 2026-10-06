import type { VocabEntry } from "../../core/model/entry";
import type { Family, FamilyMember } from "../../core/model/family";

// View-model for the Word Galaxy force graph (規劃書 09 §6.1, 決定 7-8,
// .claude/tmp/w9-rules.md A5/A6). Pure — no "obsidian" or "d3" import here —
// so it's unit-tested without a DOM. GalaxyGraph.ts (d3 + SVG) consumes
// GalaxyModel and owns drawing/physics.

// New user-facing strings (09 整合事項 — GA): temporary local const until
// the integrator moves them into src/core/i18n/{zh-TW,en}.ts.
const L = {
  known: "，已學",
  unknown: "，未學",
};

export type GalaxyNodeKind = "hub" | "group" | "known" | "unknown";

export interface GalaxyNode {
  id: string;
  kind: GalaxyNodeKind;
  // English word (hub: family.topic; group: 空字串，標籤在 word 欄位見下).
  word: string;
  zh: string;
  emoji: string;
  entryId?: string;
  fresh: boolean;
  ariaLabel: string;
}

export interface GalaxyLink {
  source: string;
  target: string;
}

export interface GalaxyCounts {
  known: number;
  unknown: number;
  total: number;
}

export interface GalaxyModel {
  nodes: GalaxyNode[];
  links: GalaxyLink[];
  counts: GalaxyCounts;
}

export interface GalaxyLookup {
  entry(m: FamilyMember): VocabEntry | undefined;
  emoji(m: FamilyMember, e?: VocabEntry): string;
  isKnown(e?: VocabEntry): boolean;
}

export interface GalaxyOpts {
  onlyKnown: boolean;
  // Node ids (entryId, or `w:<lowercase word>` for suggestions not yet in
  // the vocab list) that should render as freshly AI-suggested (dashed glow
  // halo, 09 §6.1 / prototype .fresh).
  fresh?: ReadonlySet<string>;
}

const wordKey = (w: string): string => w.trim().toLowerCase();

function wordNodeId(m: FamilyMember): string {
  return m.entryId ?? `w:${wordKey(m.word)}`;
}

function buildWordNode(m: FamilyMember, lookup: GalaxyLookup, fresh: ReadonlySet<string> | undefined): GalaxyNode {
  const entry = lookup.entry(m);
  const known = lookup.isKnown(entry);
  const id = wordNodeId(m);
  const word = m.word.trim();
  return {
    id,
    kind: known ? "known" : "unknown",
    word,
    zh: m.zh,
    emoji: lookup.emoji(m, entry),
    entryId: m.entryId,
    fresh: fresh?.has(id) ?? false,
    ariaLabel: `${word} ${m.zh}${known ? L.known : L.unknown}`,
  };
}

// Builds the galaxy graph for one word family. A5: groups become a middle
// tier (hub → group → word) only when the family has ≥2 groups; a single
// group connects its words straight to the hub. Words are deduped by text
// (case-insensitive) — the same word in two groups only renders once, under
// the first group it appears in. onlyKnown drops unlearned word nodes, and
// any group left with no word children (because of that, or because it had
// none to start with).
export function buildGalaxyModel(family: Family, lookup: GalaxyLookup, opts: GalaxyOpts): GalaxyModel {
  const hubId = "hub";
  const hub: GalaxyNode = {
    id: hubId,
    kind: "hub",
    word: family.topic,
    zh: family.label,
    emoji: family.emoji ?? "",
    fresh: false,
    ariaLabel: [family.topic, family.label].filter(Boolean).join(" "),
  };

  const useGroups = family.groups.length >= 2;
  const claimed = new Set<string>();
  // Per-group list of word nodes, deduped across the whole family (first
  // occurrence wins), still indexed by the group's original position.
  const groupWordNodes: GalaxyNode[][] = family.groups.map((g) => {
    const out: GalaxyNode[] = [];
    for (const m of g.members) {
      if (!m.word.trim()) continue;
      const k = wordKey(m.word);
      if (claimed.has(k)) continue;
      claimed.add(k);
      out.push(buildWordNode(m, lookup, opts.fresh));
    }
    return out;
  });

  const allWords = groupWordNodes.flat();
  const known = allWords.filter((n) => n.kind === "known").length;
  const total = allWords.length;

  const visible = opts.onlyKnown ? groupWordNodes.map((list) => list.filter((n) => n.kind === "known")) : groupWordNodes;

  const nodes: GalaxyNode[] = [hub];
  const links: GalaxyLink[] = [];

  if (useGroups) {
    family.groups.forEach((g, gi) => {
      const words = visible[gi];
      if (words.length === 0) return; // 清空的分組節點不畫（含 onlyKnown 造成的）
      const groupId = `group:${gi}`;
      nodes.push({
        id: groupId,
        kind: "group",
        word: g.label,
        zh: "",
        emoji: "",
        fresh: false,
        ariaLabel: g.label,
      });
      links.push({ source: hubId, target: groupId });
      for (const wn of words) {
        nodes.push(wn);
        links.push({ source: groupId, target: wn.id });
      }
    });
  } else {
    for (const words of visible) {
      for (const wn of words) {
        nodes.push(wn);
        links.push({ source: hubId, target: wn.id });
      }
    }
  }

  return { nodes, links, counts: { known, unknown: total - known, total } };
}

export interface ConstellationPoint {
  x: number;
  y: number;
  known: boolean;
}

// Fixed circular layout for the topic list's thumbnail (原型 renderTopics：
// viewBox "0 0 74 30", 中心 (37,15)，橢圓半徑 30×11). `known[i]` marks
// whether the i-th point should render as learned.
export function constellationPoints(n: number, known: readonly boolean[]): ConstellationPoint[] {
  const pts: ConstellationPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: 37 + Math.cos(a) * 30, y: 15 + Math.sin(a) * 11, known: !!known[i] });
  }
  return pts;
}

export interface GalaxyZoomEvent {
  type: string;
  ctrlKey: boolean;
  metaKey: boolean;
  touches?: number;
  button?: number;
}

export interface GalaxyZoomMode {
  embedded: boolean;
  mobile: boolean;
}

// d3-zoom's filter (A6, 決定 8). mobile 且 embedded（code block 裡）完全不能
// 縮放平移；embedded 桌面只有 Ctrl/⌘＋滾輪或雙指才可以；非 embedded（全畫面
// GalaxyView）照 d3 預設（非右鍵都可以）。
export function zoomFilter(ev: GalaxyZoomEvent, mode: GalaxyZoomMode): boolean {
  if (mode.mobile && mode.embedded) return false;
  if (!mode.embedded) return !ev.button;
  if (ev.type === "wheel") return ev.ctrlKey || ev.metaKey;
  if (ev.touches !== undefined) return ev.touches >= 2;
  return !ev.button;
}
