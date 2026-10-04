// Spaced-repetition data (規劃書 06 §4.1, §7.1). Kept free of ts-fsrs types
// on purpose: this is the *persisted* shape (plain JSON, ISO dates), and
// core/** must stay importable without pulling the scheduler library in.
// services/srs converts to/from ts-fsrs's Card at the boundary.

// FSRS card state. Numeric values match ts-fsrs's `State` enum so the
// conversion is a straight cast.
export const SrsState = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const;
export type SrsState = (typeof SrsState)[keyof typeof SrsState];

// Serialized ts-fsrs Card.
export interface SrsCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  // Not in the spec's field list, but ts-fsrs ≥ 5 tracks which
  // (re)learning step a card is on here; dropping it would restart the
  // learning steps on every reload.
  learningSteps?: number;
  reps: number;
  lapses: number;
  state: SrsState;
  lastReview?: string;
}

// Numeric values match ts-fsrs's `Rating` (minus Manual) and the 1–4
// keyboard shortcuts on the flashcard block.
export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type Rating = (typeof Rating)[keyof typeof Rating];
export const RATINGS: readonly Rating[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export type CardMode = "en-zh" | "zh-en" | "cloze" | "listen";
export const CARD_MODES: readonly CardMode[] = ["en-zh", "zh-en", "cloze", "listen"];

// Where a review came from. "manual" is the ✓ button on a word row, which
// rates Good without showing a card — recorded separately so per-mode stats
// later aren't skewed by reviews that never tested anything.
export type ReviewMode = CardMode | "manual";

// Immutable once written: multi-device merge is a plain union by id
// (core/store/reviewLogs.ts), never a field-level resolution.
export interface ReviewLog {
  id: string;
  entryId: string;
  at: string;
  rating: Rating;
  mode: ReviewMode;
  elapsedMs: number;
  // Card state *before* this review. Lets the daily new-card cap count
  // "cards introduced today" exactly, instead of guessing from "earliest
  // log for this entry" — which breaks once older logs are pruned (90 days).
  prevState?: SrsState;
}

export interface SrsSettings {
  // FSRS request_retention: target probability of recall at the due date.
  retention: number;
  // Max brand-new cards introduced per local calendar day.
  dailyNew: number;
}

export const DEFAULT_SRS_SETTINGS: SrsSettings = { retention: 0.9, dailyNew: 20 };

// Fills in defaults and clamps out-of-range values, so a hand-edited or
// partially synced data.json can't hand FSRS a retention of 0 or 1.5.
export function resolveSrsSettings(partial: Partial<SrsSettings> | undefined): SrsSettings {
  const retention = Number(partial?.retention);
  const dailyNew = Number(partial?.dailyNew);
  return {
    retention:
      Number.isFinite(retention) && retention > 0
        ? Math.min(0.99, Math.max(0.7, retention))
        : DEFAULT_SRS_SETTINGS.retention,
    dailyNew:
      Number.isFinite(dailyNew) && dailyNew >= 0
        ? Math.floor(dailyNew)
        : DEFAULT_SRS_SETTINGS.dailyNew,
  };
}
