import type { VocabEntry } from "../../core/model/entry";
import { isVerb, type UsageBlock } from "../../core/model/usage";
import { TypedEmitter } from "../../core/events";
import { verbUsage } from "../ai/tasks/verbUsage";
import type { LearnAi, LearnVocabPort } from "./ports";

// 動詞用法 (規劃書 06 §7.3, screen L6): only verbs get 「產生」. The result is
// stored on the entry (VocabEntry.usage), generated once, and replaced only
// when the learner presses 「重新產生」.

export interface VerbUsageEvents {
  "verb:busy": { entryId: string; busy: boolean };
}

export interface VerbUsageServiceDeps {
  ai: LearnAi;
  vocab: LearnVocabPort;
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

  canGenerate(entry: VocabEntry): boolean {
    return isVerb(entry.partOfSpeech);
  }

  // The L6 list: learned verbs, alphabetical.
  verbs(): VocabEntry[] {
    return this.deps.vocab.entries
      .filter((e) => this.canGenerate(e))
      .sort((a, b) => a.word.localeCompare(b.word, "en", { sensitivity: "base" }));
  }

  usage(entry: VocabEntry): UsageBlock | undefined {
    return entry.usage;
  }

  isBusy(entryId: string): boolean {
    return this.busy.has(entryId);
  }

  stop(entryId: string): void {
    this.deps.ai.cancel(verbThreadId(entryId));
  }

  // Generates (or regenerates) the usage block and saves it on the entry.
  // AI errors propagate (bad_output when the JSON doesn't hold); the old
  // block is kept on failure. Refuses non-verbs.
  async generate(entry: VocabEntry, opts: { signal?: AbortSignal } = {}): Promise<UsageBlock> {
    if (!this.canGenerate(entry)) throw new Error(`"${entry.word}" is not a verb`);
    this.setBusy(entry.id, true);
    try {
      const r = await this.deps.ai.run(
        verbUsage,
        { entry },
        { threadId: verbThreadId(entry.id), signal: opts.signal }
      );
      const draft = verbUsage.parse!(r);
      const block: UsageBlock = { ...draft, generatedAt: this.clock().toISOString(), model: r.model };
      entry.usage = block;
      await this.deps.vocab.touch(entry);
      return block;
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
