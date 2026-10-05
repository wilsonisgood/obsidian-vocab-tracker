import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  type Card,
  type FSRS,
  type Grade,
  type State,
} from "ts-fsrs";
import type { VocabEntry } from "../../core/model/entry";
import {
  RATINGS,
  resolveSrsSettings,
  type Rating,
  type ReviewLog,
  type ReviewMode,
  type SrsCard,
  type SrsSettings,
  type SrsState,
} from "../../core/model/srs";
import type { StoragePort } from "../../core/ports";
import type { VocabStore } from "../../core/store/VocabStore";
import { mergeReviewLogs, pruneReviewLogs } from "../../core/store/reviewLogs";
import { nowStamp } from "../../core/nowStamp";
import {
  addDays,
  buildQueue,
  countDueBetween,
  isNewCard,
  matchesFilter,
  reviewTiming,
  startOfLocalDay,
  type QueueFilter,
  type ReviewTiming,
} from "./queue";

export const REVIEWS_SHARD = "reviews";
const WRITE_DEBOUNCE_MS = 500;

// On-disk shape of store/reviews.json. Wrapped in an object (not a bare
// array) so fields can be added later without a format sniff.
interface ReviewsShard {
  logs: ReviewLog[];
}

export interface RatingPreview {
  due: string;
  intervalMs: number;
}

export interface SrsServiceDeps {
  store: VocabStore;
  storage: StoragePort;
  // Injected so tests can pin "now"; production passes nothing.
  clock?: () => Date;
  newId?: () => string;
}

const GRADE: Record<Rating, Grade> = {
  1: FsrsRating.Again,
  2: FsrsRating.Hard,
  3: FsrsRating.Good,
  4: FsrsRating.Easy,
};

function toFsrsCard(card: SrsCard): Card {
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

function fromFsrsCard(card: Card): SrsCard {
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

function defaultId(now: Date): string {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// FSRS scheduling for vocab entries (規劃書 06 §7.1). Owns entry.srs and
// the review-log shard; everything else about an entry stays with the
// store. All "now"s come from the injected clock so preview() and rate()
// agree exactly when called at the same moment.
export class SrsService {
  private logs: ReviewLog[] = [];
  private loading: Promise<void> | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  private scheduler: { retention: number; f: FSRS } | null = null;
  private clock: () => Date;
  private newId: () => string;

  constructor(private deps: SrsServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.newId = deps.newId ?? (() => defaultId(this.clock()));
  }

  settings(): SrsSettings {
    return resolveSrsSettings(this.deps.store.vocabData.settings?.srs);
  }

  // Review logs are read lazily ("開單字卡時", §4.2) — only the daily
  // new-card cap and the done screen need them. Memoized: callers can
  // await this freely before every queue().
  ensureLoaded(): Promise<void> {
    if (!this.loading) this.loading = this.reloadLogs();
    return this.loading;
  }

  // Unions what's on disk into memory — another device may have synced
  // new reviews in. Never drops in-memory logs that haven't been written.
  async reloadLogs(): Promise<void> {
    try {
      const disk = await this.deps.storage.readShard<ReviewsShard>(REVIEWS_SHARD);
      this.logs = pruneReviewLogs(mergeReviewLogs(this.logs, disk?.logs ?? []), this.clock());
    } catch (e) {
      console.error("Vocab Tracker: couldn't read review logs", e);
    }
  }

  reviewLogs(): readonly ReviewLog[] {
    return this.logs;
  }

  queue(filter: QueueFilter = {}): VocabEntry[] {
    return buildQueue(this.deps.store.vocabData.entries, filter, {
      now: this.clock(),
      dailyNew: this.settings().dailyNew,
      logs: this.logs,
    });
  }

  // Cards due tomorrow (local calendar day) — the done screen's "明天到期".
  dueTomorrow(filter: QueueFilter = {}): number {
    const today = startOfLocalDay(this.clock());
    return countDueBetween(this.deps.store.vocabData.entries, filter, addDays(today, 1), addDays(today, 2));
  }

  // Reviews logged today (local calendar day) for words matching the
  // source filter — the done screen's "今天複習". Counts every rating, so
  // a card failed and retried counts twice, same as the effort it took.
  reviewsToday(filter: QueueFilter = {}): number {
    const dayStart = startOfLocalDay(this.clock()).getTime();
    const ids = new Set(
      this.deps.store.vocabData.entries
        .filter((e) => matchesFilter(e, { source: filter.source }))
        .map((e) => e.id)
    );
    return this.logs.filter((l) => ids.has(l.entryId) && new Date(l.at).getTime() >= dayStart).length;
  }

  // When this entry is next due, or null for a card that's never been
  // scheduled (shown as "new" rather than a date).
  nextDue(entry: VocabEntry): Date | null {
    return isNewCard(entry) || !entry.srs ? null : new Date(entry.srs.due);
  }

  // A one-word review (「複習這個字」) rates whatever the word's state —
  // even before it's due. Nothing special happens to an early review:
  // rate() hands FSRS the real time since the last review, and FSRS gives
  // a card recalled sooner than planned a smaller stability gain (it was
  // easier to remember), so the next interval grows less than it would on
  // the due date; Again still counts as a lapse. preview() shows exactly
  // that. A new word rated here starts its schedule and takes one of
  // today's new-card slots, like in the queue.
  timing(entry: VocabEntry): ReviewTiming {
    return reviewTiming(entry, this.clock());
  }

  // The four candidate outcomes for the rating buttons (L3). Uses the same
  // card + clock path as rate(), and fuzz is off, so the label on a button
  // is exactly the interval that pressing it produces.
  preview(entry: VocabEntry, now: Date = this.clock()): Record<Rating, RatingPreview> {
    const f = this.fsrs();
    const card = this.cardOf(entry, now);
    const out = {} as Record<Rating, RatingPreview>;
    for (const rating of RATINGS) {
      const next = f.next(card, now, GRADE[rating]).card;
      out[rating] = { due: next.due.toISOString(), intervalMs: next.due.getTime() - now.getTime() };
    }
    return out;
  }

  async rate(
    entry: VocabEntry,
    rating: Rating,
    mode: ReviewMode,
    elapsedMs = 0
  ): Promise<ReviewLog> {
    const now = this.clock();
    const card = this.cardOf(entry, now);
    const next = this.fsrs().next(card, now, GRADE[rating]).card;

    const log: ReviewLog = {
      id: this.newId(),
      entryId: entry.id,
      at: now.toISOString(),
      rating,
      mode,
      elapsedMs: Math.max(0, Math.round(elapsedMs)),
      prevState: card.state as number as SrsState,
    };

    entry.srs = fromFsrsCard(next);
    // Legacy fields still drive the row's "Reviewed: … (n×)" line and older
    // plugin versions on other devices.
    entry.lastReviewed = nowStamp(now);
    entry.reviews = (entry.reviews ?? 0) + 1;

    this.logs = mergeReviewLogs(this.logs, [log]);
    this.scheduleLogWrite();
    await this.deps.store.touch(entry);
    return log;
  }

  // Lands any debounced review-log write now (plugin unload).
  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      this.enqueueLogWrite();
    }
    await this.pendingWrite;
  }

  dispose(): Promise<void> {
    return this.flush();
  }

  private cardOf(entry: VocabEntry, now: Date): Card {
    return entry.srs ? toFsrsCard(entry.srs) : createEmptyCard(now);
  }

  private fsrs(): FSRS {
    const { retention } = this.settings();
    if (!this.scheduler || this.scheduler.retention !== retention) {
      // enable_fuzz stays off: fuzz randomizes the interval per call, which
      // would make preview() and rate() disagree.
      this.scheduler = {
        retention,
        f: fsrs(generatorParameters({ request_retention: retention, enable_fuzz: false })),
      };
    }
    return this.scheduler.f;
  }

  private scheduleLogWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.enqueueLogWrite();
    }, WRITE_DEBOUNCE_MS);
  }

  // Read-merge-write rather than a blind overwrite: reviews.json isn't
  // covered by onExternalSettingsChange (that only fires for data.json),
  // so this is where another device's synced reviews get folded in
  // instead of clobbered. Chained so two writes never interleave.
  private enqueueLogWrite(): void {
    this.pendingWrite = this.pendingWrite.then(async () => {
      try {
        await this.reloadLogs();
        await this.deps.storage.writeShard<ReviewsShard>(REVIEWS_SHARD, { logs: this.logs });
      } catch (e) {
        console.error("Vocab Tracker: couldn't save review logs", e);
      }
    });
  }
}
