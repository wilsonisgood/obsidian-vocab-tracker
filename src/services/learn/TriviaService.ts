import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import type { Anchor, Thread, Turn, TurnErrorCode } from "../../core/model/thread";
import { TRIVIA_THREAD_ID, type TriviaItem } from "../../core/model/trivia";
import { knownWordList, MAX_TOLD, type ToldTrivia, type TriviaInput } from "../ai/context/triviaContext";
import type { WordFacts } from "../ai/context/wordContext";
import { splitTrivia, TRIVIA_TASK_BY_KIND, triviaFollowup, type TriviaKind } from "../ai/tasks/trivia";
import type { LearnStore } from "./LearnStore";
import type { TriviaThreadsPort } from "./ports";
import { pickSubject, recentSubjects, subjectOf, triviaRounds } from "./triviaPick";
import { WordIndex } from "./wordIndex";

// 冷知識 (規劃書 06 §7.4, screens L7/M4). The conversation is the single
// trivia-session thread run through ThreadService.ask(); every answer is
// tagged with the word it's about (subjectEntryId). Favorites (收藏) are
// TriviaItems in learn.json, hung on the subject word, with `mentions` of
// the other learned words the text brings up for the word pages'
// back-links.

const ANCHOR: Anchor = { kind: "trivia-session" };

export interface TriviaServiceDeps {
  threads: TriviaThreadsPort;
  vocab: { readonly entries: VocabEntry[] };
  learn: LearnStore;
  clock?: () => Date;
  random?: () => number;
  newId?: () => string;
  // Wave 7 整合 A4（1006 #15）: a word explicitly asked about — 「單字頁來
  // 一則」, 「冷知識頁指定一個字」 — counts as using it, so main.ts wires
  // this to AutoLike.likeEntry(). Only fires from ask() when opts.entryId
  // was given AND the round actually produced an answer (see ask()); never
  // from followup() or an entryId-less `next`.
  onAsked?: (entryId: string) => void;
}

export interface TriviaAskOptions {
  // Talk about this word (e.g. 「來一則」 on a word page). Otherwise `next`
  // picks one, and quiz/etymology/joke stay on the current subject.
  entryId?: string;
}

// What ask() hands back (1006 #1): the subject is always there once one
// was found, so callers that only cared about "any words to talk about?"
// keep working unchanged; the round's content (turnId/title/body) is only
// set once the answer actually finished — not on a streaming abort or an
// AI error, which the thread itself already shows.
export interface TriviaAnswer {
  entry: VocabEntry;
  turnId?: string;
  title?: string;
  body?: string;
  // Set when the round errored, so a caller showing its own notice (單字頁
  // 「來一則」, which has no chat bubble of its own to show it in) can
  // build the same message the AI 頁籤 would (ui/kit/aiState.aiErrorText).
  error?: TurnErrorCode;
  errorMessage?: string;
}

function facts(e: VocabEntry): WordFacts {
  return {
    word: e.word,
    phonetic: e.phonetic,
    partOfSpeech: e.partOfSpeech,
    definitionZh: e.definitionZh,
    definition: e.definition,
    example: e.example,
  };
}

export class TriviaService {
  private clock: () => Date;
  private random: () => number;
  private newId: () => string;

  constructor(private deps: TriviaServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.random = deps.random ?? Math.random;
    this.newId = deps.newId ?? (() => `${this.clock().getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  }

  readonly threadId = TRIVIA_THREAD_ID;

  async ensureLoaded(): Promise<void> {
    await Promise.all([this.deps.threads.ensureLoaded(), this.deps.learn.ensureLoaded()]);
  }

  thread(): Thread | undefined {
    return this.deps.threads.get(TRIVIA_THREAD_ID);
  }

  isBusy(): boolean {
    return this.deps.threads.isBusy(TRIVIA_THREAD_ID);
  }

  stop(): void {
    this.deps.threads.stop(TRIVIA_THREAD_ID);
  }

  private entry(id: string | undefined): VocabEntry | undefined {
    return id ? this.deps.vocab.entries.find((e) => e.id === id && !e.deletedAt) : undefined;
  }

  // The word the conversation is currently about: the newest answer that
  // has a subject still in the vocab list.
  currentSubject(): VocabEntry | undefined {
    const th = this.thread();
    if (!th) return undefined;
    for (let i = th.turns.length - 1; i >= 0; i--) {
      const t = th.turns[i];
      if (t.deletedAt || t.role !== "assistant") continue;
      const e = this.entry(subjectOf(th, t));
      if (e) return e;
    }
    return undefined;
  }

  // The subject for a new round of `next`, per the §7.4 selection rules.
  pick(): VocabEntry | undefined {
    return pickSubject(this.deps.vocab.entries, recentSubjects(this.thread()), {
      now: this.clock(),
      random: this.random,
    });
  }

  // Titles already told, newest first, for the prompt's no-repeat list.
  told(): ToldTrivia[] {
    const th = this.thread();
    const out: ToldTrivia[] = [];
    for (const r of triviaRounds(th)) {
      if (!r.answer.content.trim()) continue;
      const word = this.entry(subjectOf(th, r.answer))?.word ?? "";
      out.push({ word, title: splitTrivia(r.answer.content).title });
      if (out.length >= MAX_TOLD) break;
    }
    return out;
  }

  private input(subject: VocabEntry | undefined, extra: Partial<TriviaInput> = {}): TriviaInput {
    const entries = this.deps.vocab.entries;
    return {
      subject: subject ? facts(subject) : undefined,
      knownWords: knownWordList(entries),
      knownTotal: entries.length,
      told: this.told(),
      ...extra,
    };
  }

  // A quick action. Resolves once the answer has finished (or failed — the
  // turn then carries the error); undefined when there are no words to
  // talk about. `result.turnId` is set only on a finished answer, so a
  // caller that wants the actual text (單字頁「來一則」) can tell a real
  // round apart from one that errored.
  async ask(kind: TriviaKind, opts: TriviaAskOptions = {}): Promise<TriviaAnswer | undefined> {
    await this.ensureLoaded();
    if (this.isBusy()) return undefined;
    const subject =
      this.entry(opts.entryId) ?? (kind === "next" ? undefined : this.currentSubject()) ?? this.pick();
    if (!subject) return undefined;
    const task = TRIVIA_TASK_BY_KIND[kind];
    await this.deps.threads.ask({
      threadId: TRIVIA_THREAD_ID,
      anchor: ANCHOR,
      taskId: task.id,
      input: this.input(subject),
      display: t(`ai.task.trivia.${kind}`),
      subjectEntryId: subject.id,
    });
    const turn = this.thread()?.turns.at(-1);
    if (turn && turn.role === "assistant" && turn.status === "done" && turn.content.trim()) {
      // A4: only an explicit entryId (「來一則」 for THIS word) counts as
      // using it — an entryId-less `next` picked its own subject, that's
      // not the caller choosing to look this word up.
      if (opts.entryId) this.deps.onAsked?.(subject.id);
      const { title, body } = splitTrivia(turn.content);
      return { entry: subject, turnId: turn.id, title, body };
    }
    if (turn && turn.role === "assistant" && turn.status === "error") {
      const out: TriviaAnswer = { entry: subject };
      if (turn.error) out.error = turn.error;
      if (turn.errorMessage) out.errorMessage = turn.errorMessage;
      return out;
    }
    return { entry: subject };
  }

  // Free-form follow-up from the composer, about the current subject.
  async followup(question: string, selection?: string): Promise<void> {
    const q = question.trim();
    if (!q) return;
    await this.ensureLoaded();
    if (this.isBusy()) return;
    const subject = this.currentSubject();
    await this.deps.threads.ask({
      threadId: TRIVIA_THREAD_ID,
      anchor: ANCHOR,
      taskId: triviaFollowup.id,
      input: this.input(subject, { question: q, selection }),
      display: q,
      question: q,
      selection,
      subjectEntryId: subject?.id,
    });
  }

  // 重試: the failed answer and its question are tombstoned, then the same
  // round is asked again — a quick action about the same word, or the same
  // follow-up question.
  async retry(turnId: string): Promise<void> {
    await this.ensureLoaded();
    const th = this.thread();
    const answer = th?.turns.find((x) => x.id === turnId);
    const entryId = answer ? subjectOf(th, answer) : undefined;
    const q = this.deps.threads.dropFailedRound(th, turnId);
    if (!q) return;
    const kind = (Object.keys(TRIVIA_TASK_BY_KIND) as TriviaKind[]).find((k) => TRIVIA_TASK_BY_KIND[k].id === q.taskId);
    if (kind) await this.ask(kind, { entryId });
    else if (q.question) await this.followup(q.question, q.selection);
  }

  // ── Favorites (收藏) ─────────────────────────────────────────

  private answerTurn(turnId: string): Turn | undefined {
    const t = this.thread()?.turns.find((x) => x.id === turnId && !x.deletedAt);
    return t && t.role === "assistant" && t.status !== "streaming" && t.content.trim() ? t : undefined;
  }

  favoriteOf(turnId: string): TriviaItem | undefined {
    return this.deps.learn.trivia().find((it) => it.fromTurnId === turnId);
  }

  // Saves an answer as a TriviaItem on its subject word. Idempotent per
  // turn. Undefined when the turn can't be saved (still streaming, empty,
  // or no subject word to hang it on).
  favorite(turnId: string): TriviaItem | undefined {
    const existing = this.favoriteOf(turnId);
    if (existing) return existing;
    const turn = this.answerTurn(turnId);
    if (!turn) return undefined;
    const subject = this.entry(subjectOf(this.thread(), turn));
    if (!subject) return undefined;
    const { title, body } = splitTrivia(turn.content);
    const mentions = new WordIndex(this.deps.vocab.entries).mentions(`${title}\n${body}`, new Set([subject.id]));
    return this.deps.learn.putTrivia({ id: this.newId(), entryId: subject.id, mentions, title, body, fromTurnId: turnId });
  }

  unfavorite(itemId: string): void {
    this.deps.learn.deleteTrivia(itemId);
  }

  // Favorites, newest first; only those hung on `entryId` when given.
  favorites(entryId?: string): TriviaItem[] {
    return this.deps.learn
      .trivia()
      .filter((it) => !entryId || it.entryId === entryId)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }

  // Favorites about other words that mention `entryId` (反向連結).
  mentioning(entryId: string): TriviaItem[] {
    return this.favorites().filter((it) => it.entryId !== entryId && it.mentions.includes(entryId));
  }
}
