import type { DictionaryResult } from "../../core/model/dictionary";
import type { VocabEntry } from "../../core/model/entry";
import {
  isInflection,
  matchMorpheme,
  morphemeOrigin,
  morphemeThreadId,
  resolveMorphemeId,
  type BreakdownPart,
  type Morpheme,
  type MorphemeType,
  type WordBreakdown,
} from "../../core/model/morpheme";
import type { Thread } from "../../core/model/thread";
import type { WordMeta } from "../../core/model/wordMeta";
import { TypedEmitter } from "../../core/events";
import { nowStamp } from "../../core/nowStamp";
import {
  dnaAnalyze,
  dnaCompare,
  dnaExamples,
  dnaExpand,
  dnaFollowup,
  type DnaAnalyzeOutput,
  type DnaChatInput,
  type DnaChatWord,
  type DnaKnownMorpheme,
  type DnaMorphemeResult,
  type DnaPart,
} from "../ai/tasks/dna";
import type { LearnStore } from "./LearnStore";
import type { DictionaryLookupPort, LearnAi, LearnVocabPort, TriviaThreadsPort } from "./ports";
import { runStructured } from "./structured";
import { WordIndex } from "./wordIndex";

// Word DNA (規劃書 09 §2 決定 1-5, §4, §5.3, §5.4): queues words for the AI
// to split into morphemes (prefix/root/suffix), matching them against the
// store's existing morpheme records instead of duplicating them where it
// can, and wires A8's background auto-拆字 (liked words only, a daily
// batch cap) and A9's per-morpheme discussion threads.
//
// 決定 1: emoji/breakdown live in learn.json's wordMeta[], never on
// VocabEntry — every method here reads/writes wordMeta only; VocabEntry is
// touched only indirectly through addSuggested() (adding a brand-new word,
// or liking one already in the list — never `vocab.touch`).

const key = (w: string) => w.trim().toLowerCase();

// Distinct from the per-morpheme chat threads (morphemeThreadId) — these
// just dedupe/cancel the one-shot structured AI calls (runStructured's
// `threadId` opt), not a persisted Thread.
const DNA_ANALYZE_THREAD = "dna:analyze";
const DNA_EXPAND_THREAD = "dna:expand";

export interface MorphemeStat {
  morpheme: Morpheme;
  learned: VocabEntry[];
  suggested: { word: string; zh: string; emoji: string }[];
}

// VocabStore, plus setLiked — addSuggested() needs to like an
// already-tracked-but-unliked word without re-adding it (A3's "在庫但沒
// like → 按 ＋ 只呼叫 like"). Declared here rather than in ports.ts, which
// Wave 9 GS is also editing in parallel.
export interface MorphemeVocabPort extends LearnVocabPort {
  setLiked(entry: VocabEntry, liked: boolean): Promise<void>;
}

export interface MorphemeServiceDeps {
  ai: LearnAi;
  vocab: MorphemeVocabPort;
  learn: LearnStore;
  dictionary: DictionaryLookupPort;
  threads: TriviaThreadsPort;
  // A8: learn.dnaDailyBatches as a getter, so a settings change takes
  // effect without re-wiring the service; 0 disables startAuto() entirely.
  dailyBatches(): number;
  // The day's batch usage so far (main.ts wires this to localStorage —
  // integration item). `day` resets the count once it no longer matches
  // today's key.
  budget: { load(): { day: string; used: number }; save(v: { day: string; used: number }): void };
  // AiService.status() === "ready". startAuto() is silent background
  // work with nowhere to show an error, so it checks before spending any
  // of the daily budget rather than letting runStructured fail per batch.
  aiReady(): boolean;
  // (1009 #5): same contract as FamilyServiceDeps.examLabelsFor — level
  // label for a word pulled in from a morpheme's suggested list.
  examLabelsFor(word: string): string[];
  clock?: () => Date;
  newId?: () => string;
}

export interface MorphemeServiceEvents {
  "dna:progress": { done: number; total: number };
}

// Finds a morpheme already in the store with the same type and the same
// form OR one of the AI's variants (決定 2: "ten／tin／tain 這種變體"
// should all land on one record even if the AI didn't echo back the exact
// known spelling it matched).
export function findExistingMorpheme(
  list: readonly Morpheme[],
  type: MorphemeType,
  form: string,
  variants: readonly string[]
): Morpheme | undefined {
  for (const f of [form, ...variants]) {
    const m = matchMorpheme(list, type, f);
    if (m) return m;
  }
  return undefined;
}

export class MorphemeService {
  readonly events = new TypedEmitter<MorphemeServiceEvents>();
  private clock: () => Date;
  private newId: () => string;
  private seq = 0;

  private pending: string[] = [];
  private pendingSet = new Set<string>();
  private busyChain: Promise<void> = Promise.resolve();
  private progressState = { running: false, done: 0, total: 0 };
  private autoStarted = false;

  constructor(private deps: MorphemeServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.newId = deps.newId ?? (() => `${this.clock().getTime()}-dna${++this.seq}`);
  }

  ensureLoaded(): Promise<void> {
    return this.deps.learn.ensureLoaded();
  }

  private entry(id: string): VocabEntry | undefined {
    return this.deps.vocab.entries.find((e) => e.id === id);
  }

  // ── Queueing / running dna.analyze ──────────────────────────────────

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.busyChain.then(fn, fn);
    this.busyChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private setProgress(p: Partial<typeof this.progressState>): void {
    this.progressState = { ...this.progressState, ...p };
    this.events.emit("dna:progress", { done: this.progressState.done, total: this.progressState.total });
  }

  progress(): { running: boolean; done: number; total: number } {
    return { ...this.progressState };
  }

  // Background queue: de-duped, drained 10 at a time, one batch running
  // system-wide at once (shared with analyzeNow/startAuto via busyChain).
  queue(entryIds: string[]): void {
    let added = false;
    for (const id of entryIds) {
      if (this.pendingSet.has(id)) continue;
      this.pendingSet.add(id);
      this.pending.push(id);
      added = true;
    }
    if (added) void this.runExclusive(() => this.drainPending());
  }

  private async drainPending(): Promise<void> {
    if (!this.pending.length) return;
    await this.deps.learn.ensureLoaded();
    this.setProgress({ running: true, done: 0, total: this.pending.length });
    try {
      while (this.pending.length) {
        const batch = this.pending.splice(0, 10);
        for (const id of batch) this.pendingSet.delete(id);
        await this.analyzeBatchSafe(batch);
        this.setProgress({ done: this.progressState.done + batch.length, total: this.progressState.done + batch.length + this.pending.length });
      }
    } finally {
      this.setProgress({ running: false, done: 0, total: 0 });
    }
  }

  // Immediate, awaited analysis (e.g. a word page's "立即分析"), still
  // batched 10 at a time and serialized against the background queue.
  async analyzeNow(entryIds: string[], signal?: AbortSignal): Promise<void> {
    const ids = entryIds.filter((id) => this.entry(id));
    if (!ids.length) return;
    await this.runExclusive(async () => {
      await this.deps.learn.ensureLoaded();
      this.setProgress({ running: true, done: 0, total: ids.length });
      try {
        for (let i = 0; i < ids.length; i += 10) {
          const batch = ids.slice(i, i + 10);
          await this.analyzeBatch(batch, signal);
          this.setProgress({ done: this.progressState.done + batch.length });
        }
      } finally {
        this.setProgress({ running: false, done: 0, total: 0 });
      }
    });
  }

  private async analyzeBatch(ids: string[], signal?: AbortSignal): Promise<void> {
    const entries = ids.map((id) => this.entry(id)).filter((e): e is VocabEntry => !!e);
    if (!entries.length) return;
    const { result, value } = await runStructured(
      this.deps.ai,
      dnaAnalyze,
      {
        words: entries.map((e) => ({ word: e.word, partOfSpeech: e.partOfSpeech, zh: e.definitionZh })),
        knownMorphemes: this.knownIndex(),
      },
      { threadId: DNA_ANALYZE_THREAD, signal }
    );
    this.applyAnalysis(entries, value, result.model, this.clock().toISOString());
  }

  // Used by the background queue/auto paths: one bad batch (AI error, bad
  // output) shouldn't stop the rest of the queue from being tried.
  private async analyzeBatchSafe(ids: string[]): Promise<void> {
    try {
      await this.analyzeBatch(ids);
    } catch (e) {
      console.error("Vocab Tracker: DNA analyze failed", e);
    }
  }

  // ── A8: background auto-拆字 ─────────────────────────────────────────

  // Called once, 10s after startup (main.ts). A no-op every later call —
  // the daily cap/queueing lives inside the one run this kicks off.
  startAuto(): void {
    if (this.autoStarted) return;
    this.autoStarted = true;
    void this.runAuto();
  }

  private todayKey(): string {
    return this.clock().toISOString().slice(0, 10);
  }

  private pickAutoCandidates(): string[] {
    return this.deps.vocab.entries
      .filter((e) => e.liked === true)
      .filter((e) => {
        const meta = this.deps.learn.wordMeta(e.id);
        return !meta?.breakdown || meta.breakdown.word !== e.word;
      })
      .map((e) => e.id);
  }

  private async runAuto(): Promise<void> {
    const cap = this.deps.dailyBatches();
    if (cap <= 0) return; // 0 = off
    if (!this.deps.aiReady()) return;
    await this.deps.learn.ensureLoaded();
    const today = this.todayKey();
    let budget = this.deps.budget.load();
    if (budget.day !== today) budget = { day: today, used: 0 };
    let remaining = cap - budget.used;
    if (remaining <= 0) return;
    const candidates = this.pickAutoCandidates();
    if (!candidates.length) return;
    await this.runExclusive(async () => {
      this.setProgress({ running: true, done: 0, total: Math.min(candidates.length, remaining * 10) });
      try {
        for (let i = 0; i < candidates.length && remaining > 0; i += 10) {
          const batch = candidates.slice(i, i + 10);
          await this.analyzeBatchSafe(batch);
          budget = { day: today, used: budget.used + 1 };
          this.deps.budget.save(budget);
          remaining--;
          this.setProgress({ done: this.progressState.done + batch.length });
        }
      } finally {
        this.setProgress({ running: false, done: 0, total: 0 });
      }
    });
  }

  // ── Attributing an analyze response to morpheme records ─────────────

  private learnedCounts(): Map<string, number> {
    const list = this.deps.learn.morphemes();
    const liked = new Set(this.deps.vocab.entries.filter((e) => e.liked === true).map((e) => e.id));
    const counts = new Map<string, number>();
    for (const meta of this.deps.learn.allWordMeta()) {
      if (!liked.has(meta.id) || !meta.breakdown) continue;
      const seen = new Set<string>();
      for (const part of meta.breakdown.parts) {
        if (!part.morphemeId) continue;
        const id = resolveMorphemeId(list, part.morphemeId);
        if (seen.has(id)) continue;
        seen.add(id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }

  // 已知字素索引: live (non-redirected) morphemes, most-learned first,
  // capped — the batch request only ever carries the top 200.
  private knownIndex(limit = 200): DnaKnownMorpheme[] {
    const counts = this.learnedCounts();
    const list = this.deps.learn.morphemes().filter((m) => !m.mergedInto);
    return [...list]
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
      .slice(0, limit)
      .map((m) => ({ id: m.id, type: m.type, form: m.form, variants: m.variants }));
  }

  private applyAnalysis(entries: VocabEntry[], value: DnaAnalyzeOutput, model: string, generatedAt: string): void {
    const list = this.deps.learn.morphemes();
    const refToId = new Map<string, string>();
    for (const dm of value.morphemes) {
      const existing = findExistingMorpheme(list, dm.type, dm.form, dm.variants);
      const resolved = existing ? this.mergeIntoExisting(existing, dm) : this.createMorpheme(dm, list);
      refToId.set(dm.ref, resolved.id);
    }

    const byWord = new Map(value.words.map((w) => [key(w.word), w] as const));
    for (const entry of entries) {
      const w = byWord.get(key(entry.word));
      if (!w) continue; // the AI dropped this word; a later pass retries it
      const parts: BreakdownPart[] = w.status === "ok" ? w.parts.map((p) => this.toBreakdownPart(p, refToId)) : [];
      const breakdown: WordBreakdown = { status: w.status, parts, gloss: w.gloss, word: entry.word, generatedAt, model };
      const meta = this.deps.learn.wordMeta(entry.id);
      const next: WordMeta = { ...(meta ?? { id: entry.id }), breakdown };
      if (!next.emoji && w.emoji) {
        next.emoji = w.emoji;
        next.emojiSource = "ai";
      }
      this.deps.learn.putWordMeta(next);
    }
  }

  // 決定 4: an inflectional ending never gets a morphemeId, whatever the
  // AI tagged its `type` as (it's told to use "inflection", but a model
  // that labels -ing "suffix" anyway shouldn't get a spurious morpheme).
  private toBreakdownPart(p: DnaPart, refToId: Map<string, string>): BreakdownPart {
    if (p.type === "inflection" || isInflection(p.text)) {
      return { text: p.text, type: "inflection", meaningZh: p.meaningZh };
    }
    const fromBatch = p.morphemeRef ? refToId.get(p.morphemeRef) : undefined;
    const direct = !fromBatch && p.morphemeRef && this.deps.learn.morpheme(p.morphemeRef) ? p.morphemeRef : undefined;
    const morphemeId = fromBatch ?? direct;
    return morphemeId ? { text: p.text, type: p.type, meaningZh: p.meaningZh, morphemeId } : { text: p.text, type: p.type, meaningZh: p.meaningZh };
  }

  private createMorpheme(dm: DnaMorphemeResult, list: Morpheme[]): Morpheme {
    const m: Morpheme = {
      id: this.newId(),
      form: dm.form,
      variants: dm.variants,
      type: dm.type,
      meaningZh: dm.meaningZh,
      origin: dm.origin,
      timeline: dm.timeline,
      suggested: dm.suggested,
      source: "ai",
    };
    if (dm.factTitle.trim() || dm.factBody.trim()) m.fact = { title: dm.factTitle, body: dm.factBody };
    this.deps.learn.putMorpheme(m);
    list.push(m); // so a later dm in the same batch that coins the "same" new morpheme twice reuses it
    return m;
  }

  // verified 絕不覆蓋 (只補 suggested 沒有的字); 未 verified 只補空欄位。
  private mergeIntoExisting(target: Morpheme, dm: DnaMorphemeResult): Morpheme {
    const already = new Set(target.suggested.map((s) => key(s.word)));
    const extraSuggested = dm.suggested.filter((s) => s.word.trim() && !already.has(key(s.word)));

    if (target.verified) {
      if (!extraSuggested.length) return target;
      const merged: Morpheme = { ...target, suggested: [...target.suggested, ...extraSuggested] };
      this.deps.learn.putMorpheme(merged);
      return merged;
    }

    let changed = extraSuggested.length > 0;
    const next: Morpheme = { ...target, suggested: changed ? [...target.suggested, ...extraSuggested] : target.suggested };
    if (!next.meaningZh.trim() && dm.meaningZh.trim()) {
      next.meaningZh = dm.meaningZh;
      changed = true;
    }
    if (!next.origin.trim() && dm.origin.trim()) {
      next.origin = dm.origin;
      changed = true;
    }
    if (!next.timeline.length && dm.timeline.length) {
      next.timeline = dm.timeline;
      changed = true;
    }
    if (!next.fact && (dm.factTitle.trim() || dm.factBody.trim())) {
      next.fact = { title: dm.factTitle, body: dm.factBody };
      changed = true;
    }
    if (!next.variants.length && dm.variants.length) {
      next.variants = dm.variants;
      changed = true;
    }
    if (!changed) return target;
    this.deps.learn.putMorpheme(next);
    return next;
  }

  // ── Word-page / stats reads ─────────────────────────────────────────

  breakdownOf(entryId: string): WordBreakdown | undefined {
    return this.deps.learn.wordMeta(entryId)?.breakdown;
  }

  // A3: learned 只算 like 的字；suggested 扣掉已在 learned 的字；只回已學 ≥1。
  stats(type: MorphemeType): MorphemeStat[] {
    const list = this.deps.learn.morphemes();
    const live = list.filter((m) => !m.mergedInto && m.type === type);
    const liked = new Map(this.deps.vocab.entries.filter((e) => e.liked === true).map((e) => [e.id, e] as const));
    const learnedMap = new Map<string, VocabEntry[]>();
    for (const meta of this.deps.learn.allWordMeta()) {
      const e = liked.get(meta.id);
      if (!e || !meta.breakdown) continue;
      const seen = new Set<string>();
      for (const part of meta.breakdown.parts) {
        if (!part.morphemeId) continue;
        const id = resolveMorphemeId(list, part.morphemeId);
        if (seen.has(id)) continue;
        seen.add(id);
        const arr = learnedMap.get(id);
        if (arr) arr.push(e);
        else learnedMap.set(id, [e]);
      }
    }
    const out: MorphemeStat[] = [];
    for (const m of live) {
      const learned = learnedMap.get(m.id) ?? [];
      if (!learned.length) continue;
      const learnedWords = new Set(learned.map((e) => key(e.word)));
      out.push({ morpheme: m, learned, suggested: m.suggested.filter((s) => !learnedWords.has(key(s.word))) });
    }
    out.sort((a, b) => b.learned.length - a.learned.length);
    return out;
  }

  private learnedWordsFor(morphemeId: string): Set<string> {
    const list = this.deps.learn.morphemes();
    const out = new Set<string>();
    for (const meta of this.deps.learn.allWordMeta()) {
      const e = this.entry(meta.id);
      if (!e || e.liked !== true || !meta.breakdown) continue;
      if (meta.breakdown.parts.some((p) => p.morphemeId && resolveMorphemeId(list, p.morphemeId) === morphemeId)) out.add(key(e.word));
    }
    return out;
  }

  // ── dna.expand (「還有哪些字」) ───────────────────────────────────────

  async expand(id: string, signal?: AbortSignal): Promise<{ word: string; zh: string; emoji: string }[]> {
    await this.deps.learn.ensureLoaded();
    const list = this.deps.learn.morphemes();
    const m = this.deps.learn.morpheme(resolveMorphemeId(list, id));
    if (!m) return [];
    const exclude = this.learnedWordsFor(m.id);
    for (const s of m.suggested) exclude.add(key(s.word));
    const { value } = await runStructured(
      this.deps.ai,
      dnaExpand,
      { morpheme: { type: m.type, form: m.form, variants: m.variants, meaningZh: m.meaningZh }, exclude: [...exclude] },
      { threadId: DNA_EXPAND_THREAD, signal }
    );
    const fresh = value.words.filter((w) => w.word.trim() && !exclude.has(key(w.word)));
    // Persisted so a later expand()/addSuggested() call for this morpheme
    // sees these as already-suggested, and so「+」can find a word's zh.
    if (fresh.length) this.deps.learn.putMorpheme({ ...m, suggested: [...m.suggested, ...fresh] });
    return fresh;
  }

  // A3/A9: already in the list but not liked → just like it; otherwise
  // dictionary lookup + add, same shape as FamilyService.addWords.
  async addSuggested(id: string, word: string): Promise<VocabEntry | undefined> {
    await this.deps.learn.ensureLoaded();
    const resolvedId = resolveMorphemeId(this.deps.learn.morphemes(), id);
    const m = this.deps.learn.morpheme(resolvedId);
    const match = m?.suggested.find((s) => key(s.word) === key(word));
    const w = match?.word ?? word;
    const zh = match?.zh ?? "";
    const index = new WordIndex(this.deps.vocab.entries);
    const existing = index.find(w);
    if (existing) {
      if (existing.liked !== true) await this.deps.vocab.setLiked(existing, true);
      return existing;
    }
    return this.addWord(w, zh, resolvedId);
  }

  private async addWord(word: string, zh: string, morphemeId: string): Promise<VocabEntry> {
    let d: DictionaryResult | undefined;
    try {
      d = await this.deps.dictionary.fetchDictionary(word);
    } catch (e) {
      console.error(`Vocab Tracker: dictionary lookup failed for "${word}"`, e);
    }
    const now = this.clock();
    const entryRec: VocabEntry = {
      id: this.newId(),
      word,
      // (1009 #5): bug fix — 字根／字族加字一律同時 like 並補等級標籤。
      level: this.deps.examLabelsFor(word).join(", "),
      liked: true,
      synonyms: d?.synonyms.join(", ") ?? "",
      antonyms: d?.antonyms.join(", ") ?? "",
      example: "",
      definition: d?.definition ?? "",
      definitionZh: d?.definitionZh || zh,
      phonetic: d?.phonetic ?? "",
      partOfSpeech: d?.partOfSpeech ?? "",
      grammar: "",
      source: null,
      added: nowStamp(now),
      lastReviewed: nowStamp(now),
      reviews: 0,
    };
    if (d?.audio) entryRec.audio = d.audio;
    entryRec.origin = morphemeOrigin(morphemeId);
    await this.deps.vocab.addEntries([entryRec]);
    return entryRec;
  }

  // ── Verify / manual edit ─────────────────────────────────────────────

  setVerified(id: string, v: boolean): void {
    const m = this.deps.learn.morpheme(resolveMorphemeId(this.deps.learn.morphemes(), id));
    if (!m) return;
    this.deps.learn.putMorpheme({ ...m, verified: v });
  }

  edit(id: string, patch: Partial<Pick<Morpheme, "meaningZh" | "origin" | "timeline" | "fact">>): void {
    const m = this.deps.learn.morpheme(resolveMorphemeId(this.deps.learn.morphemes(), id));
    if (!m) return;
    this.deps.learn.putMorpheme({ ...m, ...patch, source: "manual", verified: true });
  }

  // ── A9: per-morpheme discussion ──────────────────────────────────────

  chatThread(id: string): Thread | undefined {
    return this.deps.threads.get(morphemeThreadId(id));
  }

  isChatBusy(id: string): boolean {
    return this.deps.threads.isBusy(morphemeThreadId(id));
  }

  stopChat(id: string): void {
    this.deps.threads.stop(morphemeThreadId(id));
  }

  private async ensureChatLoaded(): Promise<void> {
    await Promise.all([this.deps.threads.ensureLoaded(), this.deps.learn.ensureLoaded()]);
  }

  private chatWordsFor(m: Morpheme, max: number): DnaChatWord[] {
    const list = this.deps.learn.morphemes();
    const out: DnaChatWord[] = [];
    for (const meta of this.deps.learn.allWordMeta()) {
      const e = this.entry(meta.id);
      if (!e || e.liked !== true || !meta.breakdown) continue;
      if (meta.breakdown.parts.some((p) => p.morphemeId && resolveMorphemeId(list, p.morphemeId) === m.id)) {
        out.push({ word: e.word, partOfSpeech: e.partOfSpeech, zh: e.definitionZh });
        if (out.length >= max) break;
      }
    }
    return out;
  }

  async askChat(id: string, kind: "examples" | "compare"): Promise<void> {
    await this.ensureChatLoaded();
    const threadId = morphemeThreadId(id);
    if (this.deps.threads.isBusy(threadId)) return;
    const m = this.deps.learn.morpheme(resolveMorphemeId(this.deps.learn.morphemes(), id));
    if (!m) return;
    const words = this.chatWordsFor(m, kind === "examples" ? 5 : 3);
    if (!words.length) return;
    const task = kind === "examples" ? dnaExamples : dnaCompare;
    const input: DnaChatInput = { morpheme: { type: m.type, form: m.form, meaningZh: m.meaningZh }, words };
    await this.deps.threads.ask({
      threadId,
      anchor: { kind: "morpheme", morphemeId: id },
      taskId: task.id,
      input,
      // No i18n label on these tasks (DU's own buttons draw the text);
      // this is just what shows in the user-turn chat bubble.
      display: kind === "examples" ? "造句" : "用法比較",
    });
  }

  async followup(id: string, question: string, selection?: string): Promise<void> {
    const q = question.trim();
    if (!q) return;
    await this.ensureChatLoaded();
    const threadId = morphemeThreadId(id);
    if (this.deps.threads.isBusy(threadId)) return;
    const m = this.deps.learn.morpheme(resolveMorphemeId(this.deps.learn.morphemes(), id));
    const input: DnaChatInput = { words: m ? this.chatWordsFor(m, 5) : [], question: q, selection };
    if (m) input.morpheme = { type: m.type, form: m.form, meaningZh: m.meaningZh };
    await this.deps.threads.ask({
      threadId,
      anchor: { kind: "morpheme", morphemeId: id },
      taskId: dnaFollowup.id,
      input,
      display: q,
      question: q,
      selection,
    });
  }

  async retry(id: string, turnId: string): Promise<void> {
    await this.ensureChatLoaded();
    const threadId = morphemeThreadId(id);
    const th = this.deps.threads.get(threadId);
    const qTurn = this.deps.threads.dropFailedRound(th, turnId);
    if (!qTurn) return;
    if (qTurn.taskId === dnaExamples.id) await this.askChat(id, "examples");
    else if (qTurn.taskId === dnaCompare.id) await this.askChat(id, "compare");
    else if (qTurn.question) await this.followup(id, qTurn.question, qTurn.selection);
  }
}
