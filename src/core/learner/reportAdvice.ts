import type { ReadingVisit } from "../model/learner";
import type { LevelEstimate } from "./levelEstimate";
import { addDays, type DayRange } from "./period";
import type { CefrTier } from "../wordlists/cefr";
import type { RadarAxis } from "./radar";

// What report.advise hands back (第二十二波 R6), after parse + fallbacks.
export interface ReportAdvice {
  letter: string;
  axes: RadarAxis[];
  levels: LevelEstimate[];
  focus: string[];
  tryNext: string[];
  reading: string[];
  // Levels the AI gave to the unknown words (第二十三波 R7).
  wordLevels?: { word: string; level: CefrTier }[];
}

export const READING_TITLE_LOOKBACK_DAYS = 30;
export const READING_TITLE_MAX = 30;

// Titles of what was read in the period and the 30 days before it, newest
// first, each once. Titles only — never paths or body text.
export function collectReadingTitles(
  reading: readonly ReadingVisit[],
  period: DayRange,
  max = READING_TITLE_MAX,
  lookbackDays = READING_TITLE_LOOKBACK_DAYS
): string[] {
  const from = addDays(period.from, -lookbackDays);
  const sorted = reading.filter((r) => r.day >= from && r.day <= period.to).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of sorted) {
    const title = r.title.trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push(title);
    if (out.length >= max) break;
  }
  return out;
}
