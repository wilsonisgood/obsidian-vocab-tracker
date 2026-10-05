import type { VocabEntry } from "../../core/model/entry";
import { CARD_MODES, type CardMode } from "../../core/model/srs";
import { matchesFilter, type ReviewTiming } from "../../services/srs/queue";
import { L } from "./leftoverStrings";
import { shortDate } from "./verbsModel";

// One-word review (「複習這個字」 on a word page): the pure parts, kept free
// of "obsidian" so they're unit-tested. The card itself is the
// vocab-flashcards block's (flashcards.ts), run on a single word.

export function parseCardMode(raw: string | null | undefined): CardMode | null {
  return CARD_MODES.find((m) => m === raw) ?? null;
}

// The mode the review opens in: the one last used in a flashcards block,
// unless it can't show this word (cloze needs an example sentence that
// contains it) — then 英→中.
export function singleReviewMode(entry: VocabEntry, preferred: CardMode | null | undefined): CardMode {
  const mode = preferred ?? CARD_MODES[0];
  return matchesFilter(entry, { mode }) ? mode : CARD_MODES[0];
}

// The line above the card: why this rating matters now.
export function timingText(timing: ReviewTiming): string {
  switch (timing.kind) {
    case "new":
      return L("flashcards.single.new");
    case "due":
      return L("flashcards.single.due");
    case "early":
      return L("flashcards.single.early", { date: shortDate(timing.due.toISOString()) ?? "" });
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// 「下次複習：10/12（3 天後）」, or just 「下次複習：10 分鐘後」 while it's
// in its learning steps.
export function nextReviewText(due: Date, now: Date, interval: (ms: number) => string): string {
  const ms = due.getTime() - now.getTime();
  if (ms < DAY_MS) return L("flashcards.single.nextSoon", { interval: interval(ms) });
  return L("flashcards.single.next", { date: shortDate(due.toISOString()) ?? "", interval: interval(ms) });
}
