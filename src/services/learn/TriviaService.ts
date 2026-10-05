import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import type { Anchor, Thread, Turn } from "../../core/model/thread";
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
}

export interface TriviaAskOptions {
  // Talk about this word (e.g. 「來一則」 on a word page). Otherwise `next`
  // picks one, and quiz/etymology/joke stay on the current subject.
  entryId?: string;
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

  // A quick action. Resolves with the subject word once the answer has
  // finished (or failed — the turn then carries the error); undefined when
  // there are no words to talk about.
  async ask(kind: TriviaKind, opts: TriviaAskOptions = {}): Promise<VocabEntry | undefined> {
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
    return subject;
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
