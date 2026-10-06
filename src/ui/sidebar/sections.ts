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
  entry: Pick<VocabEntry, "source" | "origin">;
}

export interface RevealPlan {
  filterMode: FilterMode;
  // The All tab's group to open (null: the list isn't grouped).
  openGroup: string | null;
}

// This note keeps showing when the word is from the note in front (or when
// there's no note, so This note lists everything); otherwise the word is
// only in All, under its group.
export function planReveal({ filterMode, activePath, entry }: RevealInput): RevealPlan {
  const mode = filterMode ?? "note";
  if (mode === "note") {
    if (!activePath || entry.source?.path === activePath) return { filterMode: "note", openGroup: null };
  }
  return { filterMode: "all", openGroup: groupOf(entry).key };
}

// How long a revealed row stays highlighted (CSS animation length).
export const FLASH_MS = 1600;
