import type { DiaryKind, DiaryMaterial, DiaryRecent } from "./types";

// Which kind of diary to write today (1016 #12).

export const DEFAULT_QUOTE_EVERY = 5;
export const REPEAT_THRESHOLD = 0.6;
export const RECENT_DIARIES = 3;

export function materialSources(m: DiaryMaterial): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [...m.articles.map((a) => a.title), ...m.points.map((p) => p.label)]) {
    const t = s.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

// Share of today's sources already used by the latest 3 diaries.
export function repeatRatio(m: DiaryMaterial, recent: DiaryRecent[]): number {
  const mine = materialSources(m);
  if (!mine.length) return 0;
  const used = new Set<string>();
  const latest = [...recent].sort((a, b) => b.day.localeCompare(a.day)).slice(0, RECENT_DIARIES);
  for (const r of latest) for (const s of r.sources) used.add(s.trim().toLowerCase());
  return mine.filter((s) => used.has(s.toLowerCase())).length / mine.length;
}

export function chooseDiaryKind(
  m: DiaryMaterial,
  recent: DiaryRecent[],
  opts: { random: () => number; quoteEvery?: number }
): DiaryKind {
  const pickOther = (): DiaryKind => (opts.random() < 0.5 ? "quote" : "place");
  const tooLittle = m.articles.length === 0 && m.points.length === 0;
  if (tooLittle || repeatRatio(m, recent) >= REPEAT_THRESHOLD) return pickOther();
  const every = opts.quoteEvery && opts.quoteEvery > 0 ? opts.quoteEvery : DEFAULT_QUOTE_EVERY;
  const chance = Math.min(1, (m.articles.length === 1 ? 2 : 1) / every);
  return opts.random() < chance ? pickOther() : "diary";
}
