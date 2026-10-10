// ── Word page accordion state (1010 #wordpage, wave 12 C) ──
//
// Which of the collapsible categories on a word page are open, remembered
// per word and per category. Pure logic + a thin localStorage wrapper
// (app.loadLocalStorage / saveLocalStorage: per device, never synced).

export const FOLD_SECTIONS = ["info", "dna", "families", "usage", "trivia", "discussion"] as const;
export type FoldSection = (typeof FOLD_SECTIONS)[number];

// entryId → section → open?
export type FoldState = Record<string, Partial<Record<FoldSection, boolean>>>;

export const FOLD_STORAGE_KEY = "vt-wordpage-folds";

// Info starts open, everything else closed.
export function defaultOpen(section: FoldSection): boolean {
  return section === "info";
}

export function isOpen(state: FoldState, entryId: string, section: FoldSection): boolean {
  const v = state[entryId]?.[section];
  return typeof v === "boolean" ? v : defaultOpen(section);
}

// A new state with one category flipped; the others (and other words) keep
// whatever they had.
export function toggle(state: FoldState, entryId: string, section: FoldSection): FoldState {
  const open = !isOpen(state, entryId, section);
  return { ...state, [entryId]: { ...state[entryId], [section]: open } };
}

// Anything stored that isn't the expected shape is dropped, never thrown on.
export function parseFolds(raw: unknown): FoldState {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  const out: FoldState = {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const [id, secs] of Object.entries(data as Record<string, unknown>)) {
    if (!secs || typeof secs !== "object" || Array.isArray(secs)) continue;
    const clean: Partial<Record<FoldSection, boolean>> = {};
    for (const s of FOLD_SECTIONS) {
      const v = (secs as Record<string, unknown>)[s];
      if (typeof v === "boolean") clean[s] = v;
    }
    out[id] = clean;
  }
  return out;
}

// The slice of obsidian's App this needs.
export interface FoldStorage {
  loadLocalStorage(key: string): unknown;
  saveLocalStorage(key: string, data: unknown): void;
}

export function loadFolds(app: FoldStorage | undefined): FoldState {
  try {
    return parseFolds(app?.loadLocalStorage(FOLD_STORAGE_KEY));
  } catch {
    return {};
  }
}

// Flips one category, saves, and returns whether it is now open.
export function toggleStored(app: FoldStorage | undefined, entryId: string, section: FoldSection): boolean {
  const next = toggle(loadFolds(app), entryId, section);
  try {
    app?.saveLocalStorage(FOLD_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the fold still flips for this render */
  }
  return isOpen(next, entryId, section);
}

export function isOpenStored(app: FoldStorage | undefined, entryId: string, section: FoldSection): boolean {
  return isOpen(loadFolds(app), entryId, section);
}
