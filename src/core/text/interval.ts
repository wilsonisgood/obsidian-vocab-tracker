export type IntervalUnit = "m" | "h" | "d" | "mo" | "y";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Turns a scheduling interval into the coarse "1 分鐘 / 3 天 / 2 個月"
// shown on rating buttons (L3). Rounded and never below 1, so a 40-second
// learning step still reads "1 min" rather than "0 min".
export function splitInterval(ms: number): { value: number; unit: IntervalUnit } {
  const round = (n: number) => Math.max(1, Math.round(n));
  if (ms < HOUR) return { value: round(ms / MIN), unit: "m" };
  if (ms < DAY) return { value: round(ms / HOUR), unit: "h" };
  if (ms < 30 * DAY) return { value: round(ms / DAY), unit: "d" };
  if (ms < 365 * DAY) return { value: round(ms / (30 * DAY)), unit: "mo" };
  return { value: Math.max(1, Math.round((ms / (365 * DAY)) * 10) / 10), unit: "y" };
}
