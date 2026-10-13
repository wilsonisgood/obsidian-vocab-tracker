import { createEmptyCard, fsrs, generatorParameters, Rating as FsrsRating, type Card, type FSRS, type Grade, type State } from "ts-fsrs";
import type { Rating, SrsCard, SrsState } from "../model/srs";

// The persisted SrsCard <-> ts-fsrs Card boundary, shared by the word
// cards (services/srs/SrsService) and the grammar topics (core/grammar/
// schedule) so both run on the same FSRS setup (wave 15 R1).

export const GRADE: Record<Rating, Grade> = {
  1: FsrsRating.Again,
  2: FsrsRating.Hard,
  3: FsrsRating.Good,
  4: FsrsRating.Easy,
};

export function toFsrsCard(card: SrsCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number as State,
    last_review: card.lastReview ? new Date(card.lastReview) : undefined,
  };
}

export function fromFsrsCard(card: Card): SrsCard {
  const out: SrsCard = {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number as SrsState,
  };
  if (card.last_review) out.lastReview = card.last_review.toISOString();
  return out;
}

// enable_fuzz stays off: fuzz randomizes the interval per call, which
// would make a preview and the real rating disagree. `shortTerm: false`
// skips the minutes-long (re)learning steps — a grammar topic is rated
// once per practice round, so its first interval should already be days.
export function makeFsrs(retention: number, opts: { shortTerm?: boolean } = {}): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: retention,
      enable_fuzz: false,
      ...(opts.shortTerm === false ? { enable_short_term: false } : {}),
    })
  );
}

export { createEmptyCard };
