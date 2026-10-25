import { CEFRJ_WORDS } from "./cefrjData";
import { lemmaCandidates } from "./lemma";

// Which CEFR level a word belongs to (第二十三波 R7): the built-in CEFR-J
// list (A1–B2) first, then the levels the AI tagged for words outside it
// (stored in learner.json, may reach C2). Pure.

export type CefrTier = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const CEFR_TIERS: readonly CefrTier[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const isCefrTier = (v: unknown): v is CefrTier => typeof v === "string" && (CEFR_TIERS as readonly string[]).includes(v);

let listed: Map<string, CefrTier> | null = null;

function table(): Map<string, CefrTier> {
  if (listed) return listed;
  const m = new Map<string, CefrTier>();
  // Lowest level first, so a word in two lists keeps the lower one.
  for (const level of ["A1", "A2", "B1", "B2"] as const) {
    for (const w of CEFRJ_WORDS[level].split("|")) if (w && !m.has(w)) m.set(w, level);
  }
  listed = m;
  return m;
}

export function cefrOf(word: string, extra?: ReadonlyMap<string, CefrTier>): CefrTier | undefined {
  const w = word.trim().toLowerCase();
  if (!w) return undefined;
  const t = table();
  const hit = t.get(w);
  if (hit) return hit;
  const forms = lemmaCandidates(w);
  for (const f of forms) {
    const h = t.get(f);
    if (h) return h;
  }
  if (extra) return extra.get(w) ?? forms.map((f) => extra.get(f)).find((x) => x !== undefined);
  return undefined;
}
