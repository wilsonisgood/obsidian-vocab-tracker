import { Rating, type Rating as RatingValue, type SrsCard } from "../model/srs";
import type { GrammarProgress } from "../model/grammar";
import { createEmptyCard, fromFsrsCard, GRADE, makeFsrs, toFsrsCard } from "../srs/fsrsCard";

// FSRS scheduling of a whole grammar topic (wave 15 R1, 1013 §4): one
// practice round is one review of the topic. Pure; "now" and retention are
// passed in.

// A round needs this many answers before a near-perfect score counts as Easy.
export const MIN_EASY_ANSWERS = 6;

// How the round went, as the FSRS rating. undefined = nothing answered, so
// nothing to schedule.
export function sessionRating(results: readonly { correct: boolean }[]): RatingValue | undefined {
  if (!results.length) return undefined;
  const accuracy = results.filter((r) => r.correct).length / results.length;
  if (accuracy >= 0.9) return results.length >= MIN_EASY_ANSWERS ? Rating.Easy : Rating.Good;
  if (accuracy >= 0.7) return Rating.Good;
  if (accuracy >= 0.5) return Rating.Hard;
  return Rating.Again;
}

// The topic's next card after a round rated `rating`. Same FSRS parameters
// as the word cards (retention from the same setting), without the
// minutes-long learning steps.
export function scheduleTopic(
  progress: Pick<GrammarProgress, "srs"> | undefined,
  rating: RatingValue,
  now: Date,
  retention: number
): SrsCard {
  const card = progress?.srs ? toFsrsCard(progress.srs) : createEmptyCard(now);
  return fromFsrsCard(makeFsrs(retention, { shortTerm: false }).next(card, now, GRADE[rating]).card);
}
