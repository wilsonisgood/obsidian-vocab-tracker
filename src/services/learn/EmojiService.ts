import type { VocabEntry } from "../../core/model/entry";
import { emojiOf as metaEmojiOf } from "../../core/model/wordMeta";
import type { EmojiWord } from "../ai/tasks/emoji";
import { wordEmoji } from "../ai/tasks/emoji";
import type { LearnStore } from "./LearnStore";
import type { LearnAi } from "./ports";
import { runStructured } from "./structured";

// Word emoji (09 §2 決定 1, §4, A7): per-word emoji live in learn.json's
// wordMeta[], never on VocabEntry — see family.ts/wordMeta.ts for why
// (entry edits trigger auto-like/export, sidebar order, entry-level LWW
// merge). This service is the only thing that fills in the AI-guessed ones
// in the background; FamilyService writes its own (from family.generate /
// family.expand's member.emoji) directly.

export const EMOJI_BATCH_SIZE = 30;

// A read-only view of the vocab list: EmojiService only ever reads a word
// to build the AI prompt, never adds or edits an entry.
export interface EmojiVocabPort {
  readonly entries: VocabEntry[];
}

export interface EmojiServiceDeps {
  ai: LearnAi;
  vocab: EmojiVocabPort;
  learn: LearnStore;
  // No existing place in FamilyService checks whether AI is configured
  // (it just lets requests fail); ensure() needs to skip quietly instead,
  // so the caller wires this up to plugin.ai.status() === "ready".
  aiReady: () => boolean;
  batchSize?: number;
}

export class EmojiService {
  private batchSize: number;
  // Ids currently queued or mid-batch — guards against queuing the same
  // word twice while it's already in flight.
  private queued = new Set<string>();
  // Ids whose batch came back as an error: logged once, never retried.
  private failed = new Set<string>();
  private pending: string[] = [];
  private running = false;

  constructor(private deps: EmojiServiceDeps) {
    this.batchSize = deps.batchSize ?? EMOJI_BATCH_SIZE;
  }

  // The emoji to show for a word (A7): wordMeta's if it has one, otherwise
  // a part-of-speech default — core/model/wordMeta.ts's emojiOf() is the
  // single source of truth for that fallback.
  emojiOf(entry: VocabEntry): string {
    return metaEmojiOf(this.deps.learn.wordMeta(entry.id), entry);
  }

  // A hand-picked emoji (word page) always wins over the AI's guess —
  // learnMerge.ts's pickWordMeta() relies on emojiSource "user" for that
  // across devices too.
  set(entryId: string, emoji: string): void {
    const existing = this.deps.learn.wordMeta(entryId);
    this.deps.learn.putWordMeta({ ...existing, id: entryId, emoji, emojiSource: "user" });
  }

  // Queues entries with no emoji yet for a background word.emoji run.
  // Fire-and-forget: callers don't await filling-in, they just re-render
  // once the wordMeta:upsert event comes through.
  ensure(entryIds: string[]): void {
    if (!this.deps.aiReady()) return;
    const fresh = entryIds.filter((id) => {
      if (this.queued.has(id) || this.failed.has(id)) return false;
      if (this.deps.learn.wordMeta(id)?.emoji) return false;
      return this.entryOf(id) !== undefined;
    });
    if (!fresh.length) return;
    for (const id of fresh) this.queued.add(id);
    this.pending.push(...fresh);
    void this.pump();
  }

  private entryOf(id: string): VocabEntry | undefined {
    return this.deps.vocab.entries.find((e) => e.id === id);
  }

  // Only one batch in flight at a time: a pump already running just gets
  // the new ids appended to `pending` by ensure() above and picks them up
  // on its next loop iteration.
  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const ids = this.pending.splice(0, this.batchSize);
        await this.runBatch(ids);
      }
    } finally {
      this.running = false;
    }
  }

  private async runBatch(ids: string[]): Promise<void> {
    const words: EmojiWord[] = [];
    const byWordKey = new Map<string, string[]>(); // word key → entryIds sharing it
    for (const id of ids) {
      const e = this.entryOf(id);
      if (!e) {
        this.queued.delete(id);
        continue;
      }
      words.push({ word: e.word, partOfSpeech: e.partOfSpeech, zh: e.definitionZh });
      const k = e.word.trim().toLowerCase();
      (byWordKey.get(k) ?? byWordKey.set(k, []).get(k)!).push(id);
    }
    if (!words.length) return;
    try {
      const { value } = await runStructured(this.deps.ai, wordEmoji, { words });
      for (const item of value) {
        const targets = byWordKey.get(item.word.trim().toLowerCase());
        if (!targets) continue;
        for (const id of targets) this.writeAiEmoji(id, item.emoji);
      }
    } catch (e) {
      console.error("Vocab Tracker: word.emoji batch failed", e);
      for (const id of ids) this.failed.add(id);
    } finally {
      for (const id of ids) this.queued.delete(id);
    }
  }

  // Never overwrites a user's own pick — re-checked here (not just at
  // queue time) because the batch may take a while and the learner could
  // have set one by hand in the meantime.
  private writeAiEmoji(entryId: string, emoji: string): void {
    if (!emoji) return;
    const existing = this.deps.learn.wordMeta(entryId);
    if (existing?.emojiSource === "user") return;
    this.deps.learn.putWordMeta({ ...existing, id: entryId, emoji, emojiSource: "ai" });
  }
}
