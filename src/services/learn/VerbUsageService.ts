import type { VocabEntry } from "../../core/model/entry";
import {
  formatPos,
  isVerb,
  parsePos,
  usagesOf,
  type PosKey,
  type UsageBlock,
  type VerbFavorite,
} from "../../core/model/usage";
import { TypedEmitter } from "../../core/events";
import { verbUsage as usageTask } from "../ai/tasks/verbUsage";
import type { LearnAi, LearnVocabPort } from "./ports";
import { runStructured } from "./structured";

// Usage (規劃書 06 §7.3, screen L6; wave 8 U1 — 1006-2 回饋 #17 #18 #20
// #21): every part of speech a word has gets usage patterns, produced by
// one AI call and stored per pos (VocabEntry.usages). Kept as
// VerbUsageService (not renamed) so main.ts's wiring and the file name
// stay put this wave — see the U1 report's 整合事項 for anything that
// still needs touching.
//
// Old call sites (ui/blocks/verbs.ts, the L6 block that only ever shows
// verbs; WordPageDecorator's 「用法」 section) keep working unchanged
// through generate()/usage()/canGenerate(), which are now thin
// pos-"v" wrappers over generateAll()/usages(). New code (U2's per-pos UI)
// should call generateAll/regenerate/usages/isFavorite/favorite/
// unfavorite directly.

export interface VerbUsageEvents {
  "verb:busy": { entryId: string; busy: boolean };
  // A pos's usage block was saved on the entry (the word page re-exports
  // it). `pos` absent on an older listener's payload shape still
  // type-checks (it's additional, not replacing entryId).
  "verb:usage": { entryId: string; pos?: PosKey };
}

export interface UsageFavorites {
  usageFavorite(entryId: string, pos: PosKey): VerbFavorite | undefined;
  favoriteUsage(entry: { id: string; word: string }, pos: PosKey): VerbFavorite;
  unfavoriteUsage(entryId: string, pos: PosKey): void;
}

export interface VerbUsageServiceDeps {
  ai: LearnAi;
  vocab: LearnVocabPort;
  learn: UsageFavorites;
  clock?: () => Date;
}

export function verbThreadId(entryId: string): string {
  return `verb:${entryId}`;
}

export class VerbUsageService {
  readonly events = new TypedEmitter<VerbUsageEvents>();
  private busy = new Set<string>();
  private clock: () => Date;

  constructor(private deps: VerbUsageServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // 1006-2 #17: usage isn't verb-only any more — any live entry can
  // generate it. Kept as its own method (rather than inlining `!deletedAt`
  // at call sites) so WordPageDecorator's gate reads the same as before.
  canGenerate(entry: VocabEntry): boolean {
    return !entry.deletedAt;
  }

  // The L6 list (ui/blocks/verbs.ts): learned verbs, alphabetical. Kept
  // matching true verbs by partOfSpeech directly (not canGenerate, which
  // now allows everything) so that block's "verbs only" scope doesn't
  // change — U2 owns the all-parts-of-speech list UI (#22).
  verbs(): VocabEntry[] {
    return this.deps.vocab.entries
      .filter((e) => isVerb(e.partOfSpeech))
      .sort((a, b) => a.word.localeCompare(b.word, "en", { sensitivity: "base" }));
  }

  // All of this entry's usage blocks, by part of speech (merges the
  // legacy `usage` field under "v" — see usagesOf()).
  usages(entry: VocabEntry): Partial<Record<PosKey, UsageBlock>> {
    return usagesOf(entry);
  }

  // Back-compat for the old verb-only call sites: the "v" block, same as
  // `entry.usage` used to be.
  usage(entry: VocabEntry): UsageBlock | undefined {
    return this.usages(entry).v;
  }

  isBusy(entryId: string): boolean {
    return this.busy.has(entryId);
  }

  stop(entryId: string): void {
    this.deps.ai.cancel(verbThreadId(entryId));
  }

  isFavorite(entryId: string, pos: PosKey): boolean {
    return !!this.deps.learn.usageFavorite(entryId, pos);
  }

  favorite(entry: { id: string; word: string }, pos: PosKey): VerbFavorite {
    return this.deps.learn.favoriteUsage(entry, pos);
  }

  unfavorite(entryId: string, pos: PosKey): void {
    this.deps.learn.unfavoriteUsage(entryId, pos);
  }

  // One AI call for every part of speech this word has (#18): the AI is
  // given the dictionary's partOfSpeech but asked to list the word's
  // common parts of speech itself too (dictionary data may be incomplete
  // or verb-only). The AI's parts of speech and the dictionary's are
  // unioned and written back to entry.partOfSpeech (#20); each pos's
  // usage block keeps its own createdAt across regenerations, pulled
  // from whatever was already there (new format or legacy `usage`).
  async generateAll(entry: VocabEntry, opts: { signal?: AbortSignal } = {}): Promise<Partial<Record<PosKey, UsageBlock>>> {
    if (!this.canGenerate(entry)) throw new Error(`"${entry.word}" is deleted`);
    return this.run(entry, opts, undefined);
  }

  // Regenerates a single part of speech (U2's per-heading 「重新產生」).
  // Still one AI call — the task only asks about `pos` — but the result
  // only replaces that one pos's block; every other pos on the entry is
  // untouched.
  async regenerate(entry: VocabEntry, pos: PosKey, opts: { signal?: AbortSignal } = {}): Promise<UsageBlock> {
    if (!this.canGenerate(entry)) throw new Error(`"${entry.word}" is deleted`);
    const result = await this.run(entry, opts, pos);
    const block = result[pos];
    if (!block) throw new Error(`verb.usage: AI didn't return a ${pos} block`);
    return block;
  }

  // Old verb-only API (ui/blocks/verbs.ts, WordPageDecorator): generates
  // every pos like generateAll, but returns (and the caller only ever
  // read) the "v" block, since those call sites only ever displayed one.
  async generate(entry: VocabEntry, opts: { signal?: AbortSignal } = {}): Promise<UsageBlock> {
    if (!isVerb(entry.partOfSpeech)) throw new Error(`"${entry.word}" is not a verb`);
    const result = await this.generateAll(entry, opts);
    const block = result.v;
    if (!block) throw new Error(`verb.usage: AI didn't return a verb block`);
    return block;
  }

  private async run(
    entry: VocabEntry,
    opts: { signal?: AbortSignal },
    onlyPos: PosKey | undefined
  ): Promise<Partial<Record<PosKey, UsageBlock>>> {
    this.setBusy(entry.id, true);
    try {
      const existing = usagesOf(entry);
      const { result: r, value: draft } = await runStructured(
        this.deps.ai,
        usageTask,
        { entry, onlyPos },
        { threadId: verbThreadId(entry.id), signal: opts.signal }
      );
      const now = this.clock().toISOString();
      const aiPos = draft.entries.map((e) => e.pos);
      const dictPos = parsePos(entry.partOfSpeech);
      const union = onlyPos ? [onlyPos] : [...new Set([...dictPos, ...aiPos])];

      const usages: Partial<Record<PosKey, UsageBlock>> = { ...existing };
      const touched: PosKey[] = [];
      for (const e of draft.entries) {
        if (onlyPos && e.pos !== onlyPos) continue;
        const createdAt = existing[e.pos]?.createdAt ?? existing[e.pos]?.generatedAt ?? now;
        usages[e.pos] = { patterns: e.patterns, related: e.related, createdAt, generatedAt: now, model: r.model };
        touched.push(e.pos);
      }
      if (!touched.length) throw new Error(`verb.usage: AI returned no${onlyPos ? ` ${onlyPos}` : ""} usage`);

      entry.usages = usages;
      delete entry.usage;
      // #20: AI's parts of speech ∪ dictionary's, written back so the
      // collapsed row (abbreviatePartOfSpeech) shows everything.
      if (!onlyPos && union.length) entry.partOfSpeech = formatPos(union);
      await this.deps.vocab.touch(entry);
      for (const pos of touched) this.events.emit("verb:usage", { entryId: entry.id, pos });
      return Object.fromEntries(touched.map((pos) => [pos, usages[pos]])) as Partial<Record<PosKey, UsageBlock>>;
    } finally {
      this.setBusy(entry.id, false);
    }
  }

  private setBusy(entryId: string, busy: boolean): void {
    if (busy) this.busy.add(entryId);
    else this.busy.delete(entryId);
    this.events.emit("verb:busy", { entryId, busy });
  }
}
