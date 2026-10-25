// Pure helpers of the hub shell (第十六波 E).

export const TAB_KEY = "vocab-tracker:practice.tab";
// Workspace event (track id): an open hub switches to that tab.
export const TAB_EVENT = "vocab-tracker:practice-tab";

export interface TabLike {
  id: string;
  label: string;
}

const ALIASES: Record<string, string> = {
  vocab: "vocab",
  單字: "vocab",
  grammar: "grammar",
  文法: "grammar",
  poly: "poly",
  常用字: "poly",
  mix: "mix",
  混合: "mix",
  para: "para",
  換句話說: "para",
  段落: "para",
};

// The tab a `tab:` param names (id, or its Chinese label), if registered.
export function pickTab<T extends TabLike>(tabs: readonly T[], wanted: string): T | undefined {
  const w = wanted.trim().replace(/^["']|["']$/g, "");
  const id = ALIASES[w.toLowerCase()] ?? ALIASES[w] ?? w;
  return tabs.find((t) => t.id === id);
}

// The remembered tab id, if it's still registered.
export function rememberedTab<T extends TabLike>(tabs: readonly T[], raw: unknown): T | undefined {
  return typeof raw === "string" ? tabs.find((t) => t.id === raw) : undefined;
}
