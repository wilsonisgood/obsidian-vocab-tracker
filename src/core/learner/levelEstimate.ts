import type { CefrLevel } from "../model/settings";
import type { ReportData } from "./report";
import { vocabLevelFromTiers } from "./vocabTiers";
import { num, VOCAB_SIZE } from "./vocabSize";

// 各面向的程度推估 (第二十二波 R6). The AI decides when it can; these are
// the rough fallbacks (every row marked 粗估) when it's off or failed.

export interface LevelEstimate {
  area: string;
  // "約 B1"、"A2–B1"、"還看不出來"
  level: string;
  // "估 2,000–2,500 字"
  detail?: string;
  basis: string;
  // Rough, rule-based guess rather than the AI's reading of the records.
  rough?: boolean;
}

export const UNKNOWN_LEVEL = "還看不出來";
export const GRAMMAR_MIN_QUESTIONS = 10;
const BAND_PASS = 0.7;
const BAND_MIN = 3;

const GRAMMAR_BAND_LEVEL = ["A1–A2", "B1–B2", "C1"] as const;
const pct = (r: number) => `${Math.round(r * 100)}%`;

function grammarLevel(data: ReportData): LevelEstimate {
  const area = "文法";
  const bands = data.grammar.bands;
  const total = bands.reduce((s, b) => s + b.total, 0);
  if (total < GRAMMAR_MIN_QUESTIONS) {
    return { area, level: UNKNOWN_LEVEL, basis: `文法題只做了 ${total} 題，至少 ${GRAMMAR_MIN_QUESTIONS} 題才看得出來`, rough: true };
  }
  // The highest band answered well (≥ 70%, ≥ 3 questions) is where they are.
  for (let i = bands.length - 1; i >= 0; i--) {
    const b = bands[i];
    if (b.total >= BAND_MIN && b.rate !== null && b.rate >= BAND_PASS) {
      return { area, level: `約 ${GRAMMAR_BAND_LEVEL[i] ?? b.label}`, basis: `難度 ${b.label} 的文法題答對 ${pct(b.rate)}（${b.total} 題）`, rough: true };
    }
  }
  const low = bands.find((b) => b.total > 0);
  return {
    area,
    level: "約 A1–A2 以下",
    basis: low && low.rate !== null ? `難度 ${low.label} 的文法題答對 ${pct(low.rate)}（${low.total} 題），還沒到七成` : "文法題答對率還沒到七成",
    rough: true,
  };
}

const TIER_SHORT_NOTE = "（查／問的字還不夠多，暫以自述程度粗估）";

function vocabLevel(selfLevel: CefrLevel | "", mature?: number, data?: ReportData): LevelEstimate {
  const area = "字彙量";
  // Enough looked-up / asked words with a known level: judge by those.
  const tiered = data?.tiers ? vocabLevelFromTiers(data.tiers) : null;
  if (tiered) return tiered;
  const note = data?.tiers ? TIER_SHORT_NOTE : "";
  const size = selfLevel ? VOCAB_SIZE[selfLevel] : undefined;
  if (!size) return { area, level: UNKNOWN_LEVEL, basis: "還沒有設定自述程度", rough: true };
  return {
    area,
    level: `約 ${selfLevel}`,
    detail: `估 ${num(size[0])}–${num(size[1])} 字`,
    basis: (mature !== undefined ? `以自述程度＋熟練 ${mature} 字粗估` : "以自述程度粗估") + note,
    rough: true,
  };
}

export function baselineLevels(data: ReportData, selfLevel: CefrLevel | "", mature?: number): LevelEstimate[] {
  const unknown = (area: string): LevelEstimate => ({ area, level: UNKNOWN_LEVEL, basis: "這週的紀錄還不夠", rough: true });
  return [vocabLevel(selfLevel, mature, data), grammarLevel(data), unknown("多義字熟悉度"), unknown("長句理解"), unknown("寫作"), unknown("閱讀")];
}
