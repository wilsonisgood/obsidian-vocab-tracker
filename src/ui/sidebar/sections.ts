import type { VocabEntry } from "../../core/model/entry";
import { groupOf } from "../word/wordOrder";

// The sidebar's collapsible sections (1005 回饋 2) and how a word is
// brought into view (回饋 3). Plain data, no DOM, so both are unit-tested.

export type SectionId = "words" | "paragraphs" | "ai" | "grammar";

// Order shown in the sidebar, and the full set of valid ids — storage from
// an older build only ever had "words"/"ai", which are still valid here,
// so nothing special is needed to read it; this just keeps the "is it a
// real id" check in one place as more sections are added.
const SECTION_IDS: readonly SectionId[] = ["words", "paragraphs", "ai", "grammar"];

function isSectionId(value: unknown): value is SectionId {
  return (SECTION_IDS as readonly unknown[]).includes(value);
}

// app.loadLocalStorage / saveLocalStorage: per device (and per vault),
// never synced — folding a section on the phone mustn't fold it on the
// desktop.
export interface LocalStore {
  loadLocalStorage(key: string): unknown;
  saveLocalStorage(key: string, value: unknown): void;
}

export const SECTIONS_STORAGE_KEY = "vt-sidebar-sections";

export class SectionState {
  private collapsed = new Set<SectionId>();

  constructor(private store: LocalStore | null) {
    try {
      const saved = store?.loadLocalStorage(SECTIONS_STORAGE_KEY);
      if (Array.isArray(saved)) {
        for (const id of saved) if (isSectionId(id)) this.collapsed.add(id);
      }
    } catch {
      // Nothing saved, or storage unavailable: everything open.
    }
  }

  isCollapsed(id: SectionId): boolean {
    return this.collapsed.has(id);
  }

  set(id: SectionId, collapsed: boolean): void {
    if (collapsed === this.collapsed.has(id)) return;
    if (collapsed) this.collapsed.add(id);
    else this.collapsed.delete(id);
    try {
      this.store?.saveLocalStorage(SECTIONS_STORAGE_KEY, [...this.collapsed]);
    } catch {
      // Remembering is a convenience only.
    }
  }

  toggle(id: SectionId): void {
    this.set(id, !this.isCollapsed(id));
  }
}

// ── Bringing a word into view (reading-view click, 「在側欄開啟」…) ──────

export type FilterMode = "note" | "all";

export interface RevealInput {
  filterMode: FilterMode | undefined;
  // The note in front, if any.
  activePath: string | null;
  // `id` is optional only so existing callers/tests that don't care about
  // page mode can keep passing a plain {source, origin} literal — page
  // matching below is skipped whenever it's missing.
  entry: Pick<VocabEntry, "source" | "origin"> & { id?: string };
  // 1007-2 #10: set whenever the active file is a 字族樹／Word DNA page
  // (plugin.pageContext.for(activePath)) — its groups, mapped down to just
  // what planReveal needs (word.ts/entry's own PageGroup/PageWord types
  // aren't imported here to keep this file obsidian-free... actually it's
  // already obsidian-free; the mapping just keeps this function's input
  // decoupled from pageContext.ts's shape).
  page?: { groups: { key: string; entryIds: string[] }[]; activeGroupKey: string | null };
}

export interface RevealPlan {
  filterMode: FilterMode;
  // The group to open: an All-tab group (kind differs with filterMode —
  // "all" → VocabSidebarView.collapsedGroups; "note" → a page-mode group,
  // VocabSidebarView.pageCollapsed). null: nothing to open.
  openGroup: string | null;
}

// This note keeps showing when the word is from the note in front (or when
// there's no note, so This note lists everything); otherwise the word is
// only in All, under its group.
//
// 1007-2 #10: on a 字族樹／Word DNA page, a word that's in one of the
// page's own groups stays on This note (the page IS 本篇's page mode) with
// that group opened — preferring the page's currently active group when
// the word is in it too — regardless of which tab was selected before.
// Checked first so it overrides the usual "same note / different note"
// branch below (the page's own note is virtually never the word's
// `source.path`).
export function planReveal({ filterMode, activePath, entry, page }: RevealInput): RevealPlan {
  if (page && entry.id) {
    const containing = page.groups.filter((g) => g.entryIds.includes(entry.id!));
    if (containing.length > 0) {
      const preferred =
        page.activeGroupKey !== null && containing.some((g) => g.key === page.activeGroupKey)
          ? page.activeGroupKey
          : containing[0].key;
      return { filterMode: "note", openGroup: preferred };
    }
  }
  const mode = filterMode ?? "note";
  if (mode === "note") {
    if (!activePath || entry.source?.path === activePath) return { filterMode: "note", openGroup: null };
  }
  return { filterMode: "all", openGroup: groupOf(entry).key };
}

// How long a revealed row stays highlighted (CSS animation length).
export const FLASH_MS = 1600;
