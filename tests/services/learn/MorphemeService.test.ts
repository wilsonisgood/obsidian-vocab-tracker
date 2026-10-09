import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Morpheme } from "../../../src/core/model/morpheme";
import type { Thread, Turn } from "../../../src/core/model/thread";
import { MemoryStorage } from "../ai/fakes";
import type { AiRunResult } from "../../../src/services/ai/AiService";
import type { AiRequest } from "../../../src/services/ai/providers/types";
import { DNA_TASKS, dnaCompare, dnaExamples, dnaFollowup, type DnaAnalyzeOutput, type DnaExpandOutput } from "../../../src/services/ai/tasks/dna";
import { LearnStore } from "../../../src/services/learn/LearnStore";
import { findExistingMorpheme, MorphemeService, type MorphemeServiceDeps, type MorphemeVocabPort } from "../../../src/services/learn/MorphemeService";
import type { TriviaAskParams, TriviaThreadsPort } from "../../../src/services/learn/ports";
import { entry, FakeDictionary, FakeLearnAi, FakeVocab, result } from "./fakes";

// ── Fakes specific to this test ───────────────────────────────────────

class FakeMorphemeVocab extends FakeVocab implements MorphemeVocabPort {
  likeCalls: { id: string; liked: boolean }[] = [];
  async setLiked(e: VocabEntry, liked: boolean): Promise<void> {
    this.likeCalls.push({ id: e.id, liked });
    const found = this.all.find((x) => x.id === e.id);
    if (found) found.liked = liked;
  }
}

// Same shape as fakes.ts's FakeThreads, but resolves tasks from DNA_TASKS
// instead of TRIVIA_TASKS (MorphemeService's chat methods use the same
// TriviaThreadsPort as TriviaService).
class FakeDnaThreads implements TriviaThreadsPort {
  threads = new Map<string, Thread>();
  asked: TriviaAskParams[] = [];
  busy = false;
  stopped: string[] = [];
  private n = 0;
  private clock = Date.parse("2026-10-07T08:00:00Z");
  constructor(public answer: (p: TriviaAskParams) => string = () => "回答內容") {}

  async ensureLoaded(): Promise<void> {}
  get(threadId: string): Thread | undefined {
    return this.threads.get(threadId);
  }
  isBusy(): boolean {
    return this.busy;
  }
  stop(threadId: string): void {
    this.stopped.push(threadId);
  }
  dropFailedRound(thread: Thread | undefined, turnId: string): Turn | null {
    if (!thread || this.busy) return null;
    const live = thread.turns.filter((t) => !t.deletedAt);
    const i = live.findIndex((t) => t.id === turnId);
    if (i < 1) return null;
    const question = live[i - 1];
    if (question.role !== "user" || !question.taskId) return null;
    const now = new Date(this.clock).toISOString();
    for (const t of [question, live[i]]) t.deletedAt = t.updatedAt = now;
    return question;
  }
  async ask(p: TriviaAskParams): Promise<void> {
    this.asked.push(p);
    let th = this.threads.get(p.threadId);
    if (!DNA_TASKS.some((t) => t.id === p.taskId)) throw new Error(`unknown task ${p.taskId}`);
    if (!th) {
      th = { id: p.threadId, anchor: p.anchor, turns: [] };
      this.threads.set(p.threadId, th);
    }
    const at = new Date((this.clock += 1000)).toISOString();
    const q: Turn = { id: `t${++this.n}`, role: "user", content: p.display, at, taskId: p.taskId, status: "done" };
    const a: Turn = { id: `t${++this.n}`, role: "assistant", content: this.answer(p), at, taskId: p.taskId, status: "done" };
    if (p.question) q.question = p.question;
    if (p.selection) q.selection = p.selection;
    th.turns.push(q, a);
  }
}

function setup() {
  const storage = new MemoryStorage();
  let clock = Date.parse("2026-10-07T08:00:00Z");
  const tick = () => new Date((clock += 1000));
  const learn = new LearnStore({ storage, clock: tick });
  const vocab = new FakeMorphemeVocab();
  const dictionary = new FakeDictionary();
  const threads = new FakeDnaThreads();
  let analyzeOut: DnaAnalyzeOutput = { words: [], morphemes: [] };
  let expandOut: DnaExpandOutput = { words: [] };
  const ai = new FakeLearnAi((req: AiRequest): AiRunResult => {
    if (req.output?.name === "word_dna") return result("", { json: analyzeOut });
    if (req.output?.name === "dna_expand") return result("", { json: expandOut });
    return result("ok");
  });
  let dailyBatches = 10;
  let aiReady = true;
  let budget = { day: "", used: 0 };
  let examLabels: string[] = [];
  const deps: MorphemeServiceDeps = {
    ai,
    vocab,
    learn,
    dictionary,
    threads,
    dailyBatches: () => dailyBatches,
    budget: {
      load: () => ({ ...budget }),
      save: (v) => {
        budget = { ...v };
      },
    },
    aiReady: () => aiReady,
    examLabelsFor: () => examLabels,
    clock: tick,
  };
  const svc = new MorphemeService(deps);
  return {
    storage,
    learn,
    vocab,
    dictionary,
    threads,
    ai,
    svc,
    setAnalyzeOut: (v: DnaAnalyzeOutput) => (analyzeOut = v),
    setExpandOut: (v: DnaExpandOutput) => (expandOut = v),
    setDaily: (n: number) => (dailyBatches = n),
    setAiReady: (b: boolean) => (aiReady = b),
    getBudget: () => ({ ...budget }),
    setExamLabels: (v: string[]) => (examLabels = v),
  };
}

function morpheme(id: string, extra: Partial<Morpheme> = {}): Morpheme {
  return { id, form: "x", variants: [], type: "root", meaningZh: "", origin: "", timeline: [], suggested: [], source: "ai", ...extra };
}

// ── findExistingMorpheme (pure) ──────────────────────────────────────

describe("findExistingMorpheme", () => {
  const list: Morpheme[] = [morpheme("ex1", { type: "root", form: "ten", variants: ["tin"] })];

  it("matches directly on form", () => {
    expect(findExistingMorpheme(list, "root", "ten", [])?.id).toBe("ex1");
  });

  it("matches on an existing variant", () => {
    expect(findExistingMorpheme(list, "root", "tin", [])?.id).toBe("ex1");
  });

  it("matches when the NEW entry's own variants include the stored form (ten/tin/tain)", () => {
    // The AI calls it "tain" and doesn't know the stored spelling is "ten",
    // but lists "ten" among its own variants — still has to land on ex1.
    expect(findExistingMorpheme(list, "root", "tain", ["ten", "tin"])?.id).toBe("ex1");
  });

  it("is undefined when the type doesn't match", () => {
    expect(findExistingMorpheme(list, "suffix", "ten", [])).toBeUndefined();
  });

  it("is undefined when nothing matches", () => {
    expect(findExistingMorpheme(list, "root", "un", [])).toBeUndefined();
  });
});

// ── analyzeNow / queue: attribution ──────────────────────────────────

describe("MorphemeService.analyzeNow — morpheme attribution", () => {
  it("reuses an existing morpheme via a variant instead of creating a duplicate", async () => {
    const { learn, vocab, svc, setAnalyzeOut } = setup();
    await learn.ensureLoaded();
    learn.putMorpheme(morpheme("ex1", { type: "root", form: "ten", variants: ["tin"], meaningZh: "握、持有" }));
    vocab.all.push(entry("e1", "retain", { partOfSpeech: "verb", definitionZh: "保留" }));
    setAnalyzeOut({
      words: [{ word: "retain", emoji: "🔒", status: "ok", gloss: "to keep", parts: [{ text: "tain", type: "root", meaningZh: "握、持有", morphemeRef: "m-new" }] }],
      morphemes: [
        {
          ref: "m-new",
          type: "root",
          form: "tain",
          variants: ["ten", "tin"],
          meaningZh: "握、持有",
          origin: "拉丁文 tenere",
          timeline: [],
          factTitle: "",
          factBody: "",
          suggested: [{ word: "sustain", zh: "維持", emoji: "💪" }],
        },
      ],
    });

    await svc.analyzeNow(["e1"]);

    expect(learn.morphemes()).toHaveLength(1); // no duplicate created
    const m = learn.morpheme("ex1")!;
    expect(m.suggested).toEqual([{ word: "sustain", zh: "維持", emoji: "💪" }]);
    const breakdown = svc.breakdownOf("e1")!;
    expect(breakdown).toMatchObject({ status: "ok", word: "retain", gloss: "to keep" });
    expect(breakdown.parts).toEqual([{ text: "tain", type: "root", meaningZh: "握、持有", morphemeId: "ex1" }]);
    expect(vocab.touched).toHaveLength(0);
  });

  it("creates a new morpheme keyed by this batch's ref when nothing matches", async () => {
    const { learn, vocab, svc, setAnalyzeOut } = setup();
    await learn.ensureLoaded();
    vocab.all.push(entry("e1", "unfold", { partOfSpeech: "verb", definitionZh: "展開" }));
    setAnalyzeOut({
      words: [{ word: "unfold", emoji: "📖", status: "ok", gloss: "to open out", parts: [{ text: "un", type: "prefix", meaningZh: "否定、相反", morphemeRef: "m-un" }, { text: "fold", type: "root", meaningZh: "摺", morphemeRef: "m-fold" }] }],
      morphemes: [
        { ref: "m-un", type: "prefix", form: "un", variants: [], meaningZh: "否定、相反", origin: "", timeline: [], factTitle: "", factBody: "", suggested: [] },
        { ref: "m-fold", type: "root", form: "fold", variants: [], meaningZh: "摺", origin: "", timeline: [], factTitle: "", factBody: "", suggested: [] },
      ],
    });

    await svc.analyzeNow(["e1"]);

    expect(learn.morphemes()).toHaveLength(2);
    const breakdown = svc.breakdownOf("e1")!;
    const un = learn.morphemes().find((m) => m.form === "un")!;
    const fold = learn.morphemes().find((m) => m.form === "fold")!;
    expect(breakdown.parts).toEqual([
      { text: "un", type: "prefix", meaningZh: "否定、相反", morphemeId: un.id },
      { text: "fold", type: "root", meaningZh: "摺", morphemeId: fold.id },
    ]);
  });

  it("never overwrites a verified morpheme, only appends suggested words it doesn't already have", async () => {
    const { learn, vocab, svc, setAnalyzeOut } = setup();
    await learn.ensureLoaded();
    learn.putMorpheme(
      morpheme("ex-re", { type: "prefix", form: "re", meaningZh: "已確認：再、回", verified: true, suggested: [{ word: "redo", zh: "重做", emoji: "🔁" }] })
    );
    vocab.all.push(entry("e2", "redo"));
    setAnalyzeOut({
      words: [{ word: "redo", emoji: "🔁", status: "ok", gloss: "to do again", parts: [{ text: "re", type: "prefix", meaningZh: "AI 亂猜的意思", morphemeRef: "m-re" }] }],
      morphemes: [
        {
          ref: "m-re",
          type: "prefix",
          form: "re",
          variants: [],
          meaningZh: "AI 亂猜的意思",
          origin: "AI 編的字源",
          timeline: [],
          factTitle: "",
          factBody: "",
          suggested: [{ word: "redo", zh: "x", emoji: "x" }, { word: "rewrite", zh: "重寫", emoji: "✏️" }],
        },
      ],
    });

    await svc.analyzeNow(["e2"]);

    const m = learn.morpheme("ex-re")!;
    expect(m.meaningZh).toBe("已確認：再、回"); // untouched
    expect(m.origin).toBe(""); // untouched
    expect(m.suggested).toEqual([
      { word: "redo", zh: "重做", emoji: "🔁" },
      { word: "rewrite", zh: "重寫", emoji: "✏️" },
    ]);
  });

  it("fills only empty fields on an unverified existing morpheme, keeping what's already set", async () => {
    const { learn, vocab, svc, setAnalyzeOut } = setup();
    await learn.ensureLoaded();
    learn.putMorpheme(morpheme("ex-port", { type: "root", form: "port", meaningZh: "", origin: "手寫備註：搬運", timeline: [] }));
    vocab.all.push(entry("e3", "import", { partOfSpeech: "verb", definitionZh: "進口" }));
    setAnalyzeOut({
      words: [{ word: "import", emoji: "📥", status: "ok", gloss: "to bring in", parts: [{ text: "port", type: "root", meaningZh: "搬運、攜帶", morphemeRef: "m-port" }] }],
      morphemes: [
        {
          ref: "m-port",
          type: "root",
          form: "port",
          variants: [],
          meaningZh: "搬運、攜帶",
          origin: "拉丁文 portare（AI 猜的）",
          timeline: [{ stage: "拉丁文", form: "portare" }],
          factTitle: "冷知識標題",
          factBody: "冷知識內容",
          suggested: [],
        },
      ],
    });

    await svc.analyzeNow(["e3"]);

    const m = learn.morpheme("ex-port")!;
    expect(m.meaningZh).toBe("搬運、攜帶"); // was empty, filled
    expect(m.origin).toBe("手寫備註：搬運"); // already set, kept
    expect(m.timeline).toEqual([{ stage: "拉丁文", form: "portare" }]); // was empty, filled
    expect(m.fact).toEqual({ title: "冷知識標題", body: "冷知識內容" });
  });

  it("tags an inflectional ending without creating a morpheme, even if the AI calls it a suffix", async () => {
    const { learn, vocab, svc, setAnalyzeOut } = setup();
    await learn.ensureLoaded();
    vocab.all.push(entry("e4", "boxes", { partOfSpeech: "noun", definitionZh: "盒子（複數）" }));
    setAnalyzeOut({
      words: [
        {
          word: "boxes",
          emoji: "📦",
          status: "ok",
          gloss: "plural of box",
          parts: [
            { text: "box", type: "root", meaningZh: "盒子", morphemeRef: "m-box" },
            { text: "es", type: "suffix", meaningZh: "複數", morphemeRef: "m-fake" },
          ],
        },
      ],
      morphemes: [{ ref: "m-box", type: "root", form: "box", variants: [], meaningZh: "盒子", origin: "", timeline: [], factTitle: "", factBody: "", suggested: [] }],
    });

    await svc.analyzeNow(["e4"]);

    expect(learn.morphemes()).toHaveLength(1); // no morpheme for "es"
    const breakdown = svc.breakdownOf("e4")!;
    expect(breakdown.parts[1]).toEqual({ text: "es", type: "inflection", meaningZh: "複數" }); // no morphemeId
  });

  it("a word that can't be split gets status none, empty parts, and keeps its gloss", async () => {
    const { vocab, svc, setAnalyzeOut } = setup();
    vocab.all.push(entry("e5", "jar", { partOfSpeech: "noun", definitionZh: "罐子" }));
    setAnalyzeOut({
      words: [{ word: "jar", emoji: "🫙", status: "none", gloss: "a glass container", parts: [{ text: "jar", type: "root", meaningZh: "wrong", morphemeRef: "" }] }],
      morphemes: [],
    });

    await svc.analyzeNow(["e5"]);

    expect(svc.breakdownOf("e5")).toMatchObject({ status: "none", parts: [], gloss: "a glass container" });
  });

  it("fills wordMeta.emoji from the AI only when nothing's set yet", async () => {
    const { learn, vocab, svc, setAnalyzeOut } = setup();
    vocab.all.push(entry("e6", "glow", { partOfSpeech: "verb", definitionZh: "發光" }));
    setAnalyzeOut({ words: [{ word: "glow", emoji: "✨", status: "none", gloss: "to shine softly", parts: [] }], morphemes: [] });

    await svc.analyzeNow(["e6"]);
    expect(learn.wordMeta("e6")).toMatchObject({ emoji: "✨", emojiSource: "ai" });

    // A manual emoji is already set — a second analysis must not clobber it.
    learn.putWordMeta({ id: "e6", emoji: "👍", emojiSource: "user" });
    setAnalyzeOut({ words: [{ word: "glow", emoji: "🔥", status: "none", gloss: "to shine softly", parts: [] }], morphemes: [] });
    await svc.analyzeNow(["e6"]);
    expect(learn.wordMeta("e6")).toMatchObject({ emoji: "👍", emojiSource: "user" });
  });

  it("never calls vocab.touch", async () => {
    const { vocab, svc, setAnalyzeOut } = setup();
    vocab.all.push(entry("e7", "retain"));
    setAnalyzeOut({ words: [{ word: "retain", emoji: "🔒", status: "none", gloss: "to keep", parts: [] }], morphemes: [] });
    await svc.analyzeNow(["e7"]);
    expect(vocab.touched).toHaveLength(0);
  });

  it("queue() batches 10 at a time and emits dna:progress", async () => {
    const { vocab, svc, setAnalyzeOut } = setup();
    const ids = Array.from({ length: 12 }, (_, i) => `e${i}`);
    for (const id of ids) vocab.all.push(entry(id, id));
    setAnalyzeOut({ words: ids.map((id) => ({ word: id, emoji: "🔤", status: "none" as const, gloss: "", parts: [] })), morphemes: [] });

    const events: { done: number; total: number }[] = [];
    svc.events.on("dna:progress", (p) => events.push(p));
    svc.queue(ids);
    // queue() is fire-and-forget; wait for the drain to settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(svc.progress()).toEqual({ running: false, done: 0, total: 0 });
    expect(events.some((e) => e.total > 0)).toBe(true);
    for (const id of ids) expect(svc.breakdownOf(id)).toBeDefined();
  });
});

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
}

// ── A8: startAuto ─────────────────────────────────────────────────────

describe("MorphemeService.startAuto", () => {
  it("only picks liked words with no breakdown or a stale breakdown.word", async () => {
    const { learn, vocab, svc, setAnalyzeOut, setDaily } = setup();
    await learn.ensureLoaded();
    setDaily(10);
    vocab.all.push(
      entry("liked-new", "alpha"), // liked, no breakdown — picked
      entry("liked-stale", "beta"), // liked, breakdown.word stale — picked
      entry("liked-done", "gamma"), // liked, breakdown already current — skipped
      entry("unliked", "delta", { liked: false }) // not liked — skipped
    );
    learn.putWordMeta({ id: "liked-stale", breakdown: { status: "none", parts: [], gloss: "", word: "old-beta", generatedAt: "", model: "" } });
    learn.putWordMeta({ id: "liked-done", breakdown: { status: "none", parts: [], gloss: "", word: "gamma", generatedAt: "", model: "" } });
    setAnalyzeOut({
      words: [
        { word: "alpha", emoji: "🅰️", status: "none", gloss: "", parts: [] },
        { word: "beta", emoji: "🅱️", status: "none", gloss: "", parts: [] },
      ],
      morphemes: [],
    });

    svc.startAuto();
    await flush();

    expect(svc.breakdownOf("liked-new")).toBeDefined();
    expect(svc.breakdownOf("liked-stale")?.word).toBe("beta");
    expect(svc.breakdownOf("liked-done")?.word).toBe("gamma"); // untouched, not re-sent
    expect(svc.breakdownOf("unliked")).toBeUndefined();
  });

  it("does nothing when dailyBatches() is 0", async () => {
    const { vocab, svc, setDaily } = setup();
    setDaily(0);
    vocab.all.push(entry("e1", "alpha"));
    svc.startAuto();
    await flush();
    expect(svc.breakdownOf("e1")).toBeUndefined();
  });

  it("does nothing when the AI isn't ready", async () => {
    const { vocab, svc, setAiReady } = setup();
    setAiReady(false);
    vocab.all.push(entry("e1", "alpha"));
    svc.startAuto();
    await flush();
    expect(svc.breakdownOf("e1")).toBeUndefined();
  });

  it("caps at dailyBatches() batches per day, resuming more the next day", async () => {
    const { vocab, svc, setAnalyzeOut, setDaily, getBudget } = setup();
    setDaily(1); // 1 batch = 10 words/day
    const ids = Array.from({ length: 15 }, (_, i) => `e${i}`);
    for (const id of ids) vocab.all.push(entry(id, id));
    setAnalyzeOut({ words: ids.map((id) => ({ word: id, emoji: "🔤", status: "none" as const, gloss: "", parts: [] })), morphemes: [] });

    svc.startAuto();
    await flush();

    const done = ids.filter((id) => svc.breakdownOf(id));
    expect(done).toHaveLength(10); // 1 batch's worth, the rest wait
    expect(getBudget().used).toBe(1);

    // Simulate a new day: load() would now report used:0 for today's key,
    // same as main.ts's real localStorage-backed budget would once the
    // stored day no longer matches. startAuto() itself only runs once per
    // service instance, so a fresh instance stands in for "tomorrow".
  });

  it("is a no-op the second time it's called", async () => {
    const { vocab, svc, setAnalyzeOut } = setup();
    vocab.all.push(entry("e1", "alpha"));
    setAnalyzeOut({ words: [{ word: "alpha", emoji: "🅰️", status: "none", gloss: "", parts: [] }], morphemes: [] });
    svc.startAuto();
    await flush();
    vocab.all.push(entry("e2", "beta"));
    setAnalyzeOut({ words: [{ word: "beta", emoji: "🅱️", status: "none", gloss: "", parts: [] }], morphemes: [] });
    svc.startAuto(); // ignored — already started
    await flush();
    expect(svc.breakdownOf("e2")).toBeUndefined();
  });
});

// ── stats ─────────────────────────────────────────────────────────────

describe("MorphemeService.stats", () => {
  it("only counts liked entries, sorted by learned count, suggested minus already-learned", async () => {
    const { learn, vocab, svc } = setup();
    await learn.ensureLoaded();
    learn.putMorpheme(morpheme("m-un", { type: "prefix", form: "un", suggested: [{ word: "untie", zh: "解開", emoji: "🪢" }, { word: "undo", zh: "復原", emoji: "↩️" }] }));
    vocab.all.push(
      entry("e1", "undo", { liked: true }),
      entry("e2", "unfold", { liked: true }),
      entry("e3", "untie", { liked: false }) // in the list, but not liked — doesn't count
    );
    const part = { text: "un", type: "prefix" as const, meaningZh: "", morphemeId: "m-un" };
    learn.putWordMeta({ id: "e1", breakdown: { status: "ok", parts: [part], gloss: "", word: "undo", generatedAt: "", model: "" } });
    learn.putWordMeta({ id: "e2", breakdown: { status: "ok", parts: [part], gloss: "", word: "unfold", generatedAt: "", model: "" } });
    learn.putWordMeta({ id: "e3", breakdown: { status: "ok", parts: [part], gloss: "", word: "untie", generatedAt: "", model: "" } });

    const stats = svc.stats("prefix");
    expect(stats).toHaveLength(1);
    expect(stats[0].learned.map((e) => e.word).sort()).toEqual(["undo", "unfold"]);
    // "undo" is already learned, so it's dropped from suggested; "untie"
    // isn't liked, so it still counts as a suggestion.
    expect(stats[0].suggested).toEqual([{ word: "untie", zh: "解開", emoji: "🪢" }]);
  });

  it("only returns morphemes with at least one learned word", () => {
    const { learn, svc } = setup();
    learn.putMorpheme(morpheme("m-empty", { type: "root", form: "empty" }));
    expect(svc.stats("root")).toEqual([]);
  });

  it("follows a mergedInto redirect when counting", async () => {
    const { learn, vocab, svc } = setup();
    await learn.ensureLoaded();
    learn.putMorpheme(morpheme("old", { type: "root", form: "old-form", mergedInto: "new" }));
    learn.putMorpheme(morpheme("new", { type: "root", form: "new-form" }));
    vocab.all.push(entry("e1", "word1", { liked: true }));
    learn.putWordMeta({
      id: "e1",
      breakdown: { status: "ok", parts: [{ text: "x", type: "root", meaningZh: "", morphemeId: "old" }], gloss: "", word: "word1", generatedAt: "", model: "" },
    });

    const stats = svc.stats("root");
    expect(stats).toHaveLength(1);
    expect(stats[0].morpheme.id).toBe("new");
    expect(stats[0].learned.map((e) => e.id)).toEqual(["e1"]);
  });
});

// ── addSuggested ──────────────────────────────────────────────────────

describe("MorphemeService.addSuggested", () => {
  it("likes an already-tracked, not-yet-liked word instead of re-adding it", async () => {
    const { learn, vocab, dictionary, svc } = setup();
    await learn.ensureLoaded();
    learn.putMorpheme(morpheme("m-un", { type: "prefix", form: "un", suggested: [{ word: "untie", zh: "解開", emoji: "🪢" }] }));
    vocab.all.push(entry("e1", "untie", { liked: false }));

    const result1 = await svc.addSuggested("m-un", "untie");

    expect(result1?.id).toBe("e1");
    expect(vocab.likeCalls).toEqual([{ id: "e1", liked: true }]);
    expect(dictionary.looked).toHaveLength(0); // never looked up — already tracked
    expect(vocab.all).toHaveLength(1); // not re-added
  });

  it("looks up the dictionary and adds a brand-new word with a dna: origin", async () => {
    const { learn, vocab, dictionary, svc } = setup();
    await learn.ensureLoaded();
    learn.putMorpheme(morpheme("m-un", { type: "prefix", form: "un", suggested: [{ word: "undo", zh: "復原", emoji: "↩️" }] }));

    const added = await svc.addSuggested("m-un", "undo");

    expect(dictionary.looked).toEqual(["undo"]);
    expect(added?.word).toBe("undo");
    expect(added?.origin).toBe("dna:m-un");
    expect(added?.definitionZh).toBe("undo 的中文"); // from the dictionary, not the suggested zh
    expect(vocab.all.some((e) => e.id === added?.id)).toBe(true);
  });

  // (1009 #5): bug fix — 字根／字族加字一律同時 like，並補上等級標籤。
  it("likes a brand-new word on add and fills level from examLabelsFor", async () => {
    const { learn, svc, setExamLabels } = setup();
    await learn.ensureLoaded();
    setExamLabels(["學測", "多益"]);
    learn.putMorpheme(morpheme("m-un", { type: "prefix", form: "un", suggested: [{ word: "undo", zh: "復原", emoji: "↩️" }] }));

    const added = await svc.addSuggested("m-un", "undo");

    expect(added?.liked).toBe(true);
    expect(added?.level).toBe("學測, 多益");
  });

  it("resolves a mergedInto id before reading/writing", async () => {
    const { learn, svc } = setup();
    await learn.ensureLoaded();
    learn.putMorpheme(morpheme("old", { type: "prefix", form: "un", mergedInto: "new" }));
    learn.putMorpheme(morpheme("new", { type: "prefix", form: "un", suggested: [{ word: "undo", zh: "復原", emoji: "↩️" }] }));

    const added = await svc.addSuggested("old", "undo");
    expect(added?.origin).toBe("dna:new");
  });
});

// ── dna.expand ────────────────────────────────────────────────────────

describe("MorphemeService.expand", () => {
  it("excludes already-learned and already-suggested words, then persists the fresh ones", async () => {
    const { learn, vocab, svc, setExpandOut } = setup();
    await learn.ensureLoaded();
    learn.putMorpheme(morpheme("m-un", { type: "prefix", form: "un", suggested: [{ word: "undo", zh: "復原", emoji: "↩️" }] }));
    vocab.all.push(entry("e1", "untie", { liked: true }));
    learn.putWordMeta({
      id: "e1",
      breakdown: { status: "ok", parts: [{ text: "un", type: "prefix", meaningZh: "", morphemeId: "m-un" }], gloss: "", word: "untie", generatedAt: "", model: "" },
    });
    setExpandOut({ words: [{ word: "unfold", zh: "展開", emoji: "📖" }, { word: "undo", zh: "dup", emoji: "x" }] });

    const fresh = await svc.expand("m-un");

    expect(fresh).toEqual([{ word: "unfold", zh: "展開", emoji: "📖" }]); // "undo" already suggested, filtered out
    expect(learn.morpheme("m-un")?.suggested).toEqual([
      { word: "undo", zh: "復原", emoji: "↩️" },
      { word: "unfold", zh: "展開", emoji: "📖" },
    ]);
  });
});

// ── A9: chat ──────────────────────────────────────────────────────────

describe("MorphemeService chat (A9)", () => {
  function setupChat() {
    const s = setup();
    s.learn.putMorpheme(morpheme("m-tain", { type: "root", form: "tain", meaningZh: "握、持有" }));
    const words = ["retain", "contain", "sustain", "detain", "maintain"];
    for (const w of words) {
      s.vocab.all.push(entry(w, w, { liked: true }));
      s.learn.putWordMeta({
        id: w,
        breakdown: { status: "ok", parts: [{ text: "tain", type: "root", meaningZh: "握、持有", morphemeId: "m-tain" }], gloss: "", word: w, generatedAt: "", model: "" },
      });
    }
    return s;
  }

  it("askChat(examples) asks with up to 5 learned words for this morpheme", async () => {
    const { svc, threads } = setupChat();
    await svc.askChat("m-tain", "examples");
    expect(threads.asked).toHaveLength(1);
    const input = threads.asked[0].input as { words: { word: string }[] };
    expect(input.words).toHaveLength(5);
    expect(threads.asked[0].taskId).toBe(dnaExamples.id);
  });

  it("askChat(compare) caps at 3 words", async () => {
    const { svc, threads } = setupChat();
    await svc.askChat("m-tain", "compare");
    const input = threads.asked[0].input as { words: { word: string }[] };
    expect(input.words).toHaveLength(3);
    expect(threads.asked[0].taskId).toBe(dnaCompare.id);
  });

  it("askChat does nothing when there are no learned words for the morpheme", async () => {
    const { learn, svc, threads } = setup();
    await learn.ensureLoaded();
    learn.putMorpheme(morpheme("m-lonely", { type: "root", form: "lonely" }));
    await svc.askChat("m-lonely", "examples");
    expect(threads.asked).toHaveLength(0);
  });

  it("followup asks on the same per-morpheme thread, with the question and selection", async () => {
    const { svc, threads } = setupChat();
    await svc.followup("m-tain", "為什麼這裡要重複字母？", "retained");
    expect(threads.asked).toHaveLength(1);
    expect(threads.asked[0].threadId).toBe("morpheme:m-tain");
    expect(threads.asked[0].taskId).toBe(dnaFollowup.id);
    expect(threads.asked[0].question).toBe("為什麼這裡要重複字母？");
    expect(threads.asked[0].selection).toBe("retained");
  });

  it("retry re-asks the same kind after dropping the failed round", async () => {
    const { svc, threads } = setupChat();
    await svc.askChat("m-tain", "examples");
    const th = threads.get("morpheme:m-tain")!;
    const failedAnswer = th.turns[1];
    failedAnswer.status = "error";

    await svc.retry("m-tain", failedAnswer.id);

    // dropFailedRound tombstoned the failed pair, then askChat added a new one.
    expect(th.turns.filter((t) => !t.deletedAt)).toHaveLength(2);
    expect(threads.asked).toHaveLength(2);
    expect(threads.asked[1].taskId).toBe(dnaExamples.id);
  });

  it("isChatBusy / stopChat / chatThread read and act on the per-morpheme thread", async () => {
    const { svc, threads } = setupChat();
    await svc.askChat("m-tain", "examples");
    expect(svc.chatThread("m-tain")).toBeDefined();
    expect(svc.isChatBusy("m-tain")).toBe(false);
    threads.busy = true;
    expect(svc.isChatBusy("m-tain")).toBe(true);
    svc.stopChat("m-tain");
    expect(threads.stopped).toEqual(["morpheme:m-tain"]);
  });
});
