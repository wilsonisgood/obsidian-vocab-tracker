// Stress fixture for 規劃書 06 §1.3 / M8 (task K): 1,000 words, 200
// discussion threads, a ~300-section article. Built by a seeded generator
// instead of a checked-in JSON blob, so the data is reviewable code and
// the same seed always gives the same bytes.
//
//   const fx = buildStressFixture();          // defaults below
//   fx.data()        → data.json (schema v2) with settings + entries
//   fx.threadsShard() → store/threads.json
//   fx.v1Data()      → the same words as a pre-M1 (v1) data.json
//
// What's inside:
// - entries: 1,000 live words + 20 tombstones. SRS mix (new / learning /
//   review due in the past or future / relearning), exam tags in `level`,
//   `origin: "wordlist"` on some, sources spread over 40 notes (120 words
//   in the long article), a few with no source.
// - threads: 100 word threads + 100 paragraph threads (60 in the long
//   article, 40 elsewhere; 3/4 block-id anchors written into the notes as
//   ` ^vt-xxxxxx`, 1/4 hash anchors), each with 1–4 question/answer rounds.
// - notes: the long article plus 39 shorter ones, with ==marks== on every
//   tracked word (as the plugin writes them), headings, lists, quotes,
//   code blocks.
// - word lists: three exam lists (vocab-wordlists/*.md) that overlap the
//   notes' vocabulary, so reading view has words to underline.

import type { VocabData, VocabEntry } from "../../../src/core/model/entry";
import type { Family } from "../../../src/core/model/family";
import { initialLiked } from "../../../src/core/model/like";
import type { TriviaItem } from "../../../src/core/model/trivia";
import { defaultAiSettings, type PluginSettings } from "../../../src/core/model/settings";
import type { SrsCard } from "../../../src/core/model/srs";
import type { VocabDataV1, VocabEntryV1 } from "../../../src/core/model/schemaV1";
import { wordThreadId, type Thread, type Turn } from "../../../src/core/model/thread";
import { paragraphHash } from "../../../src/core/text/hash";
import { plainParagraph } from "../../../src/core/text/paragraphs";
import { base36, chance, int, mulberry32, pick, shuffle, type Rng } from "./rng";

export interface StressOptions {
  seed?: number;
  // Live words (tombstones come on top).
  words?: number;
  tombstones?: number;
  wordThreads?: number;
  paragraphThreads?: number;
  // Sections in the long article (headings, paragraphs, lists…).
  articleSections?: number;
  // Notes besides the long article.
  notes?: number;
  // Words whose source is the long article.
  articleWords?: number;
  // "Now" for SRS due dates and timestamps.
  now?: Date;
}

export type SectionKind = "heading" | "paragraph" | "list" | "quote" | "code";

export interface StressSection {
  kind: SectionKind;
  // 0-based, inclusive (getSectionInfo's convention).
  lineStart: number;
  lineEnd: number;
}

export interface StressNote {
  path: string;
  text: string;
  sections: StressSection[];
}

export interface StressFixture {
  now: Date;
  seed: number;
  entries: VocabEntry[];
  liveEntries: VocabEntry[];
  threads: Thread[];
  article: StressNote;
  notes: StressNote[];
  wordlists: { path: string; text: string }[];
  settings: PluginSettings;
  // Fresh deep copies every call, so tests can mutate freely.
  data(): VocabData;
  threadsShard(): { threads: Thread[] };
  // store/learn.json: 12 word families, 15 saved trivia items.
  learnShard(): { families: Family[]; trivia: TriviaItem[] };
  v1Data(): VocabDataV1;
}

export const STRESS_DEFAULTS: Required<Omit<StressOptions, "now">> & { now: Date } = {
  seed: 20261005,
  words: 1000,
  tombstones: 20,
  wordThreads: 100,
  paragraphThreads: 100,
  articleSections: 300,
  notes: 39,
  articleWords: 120,
  now: new Date("2026-10-05T09:00:00.000Z"),
};

export const ARTICLE_PATH = "閱讀/長文-壓測.md";
export const EXAM_TAGS = ["exam/TOEFL", "exam/IELTS", "GEPT"] as const;
const LEVEL_TAGS = ["TOEFL", "IELTS", "多益中級", "托福高級", "GEPT 中高級"];
const POS = ["noun", "verb", "adjective", "adverb"];
const ZH = ["短暫的", "使困惑", "韌性", "精準地", "矛盾", "繁榮", "遺跡", "迅速的", "謹慎", "啟發", "放棄", "微妙的"];

const FUNCTION_WORDS = (
  "the of and to in is that it was for on are as with his they at be this from have or by one had not but what all were " +
  "when we there can an your which their said if do will each about how up out them then she many some so these would " +
  "other into has more her two like him see time could no make than first been its who now people my made over did down"
).split(" ");

const DAY = 86_400_000;

// ── text pieces ─────────────────────────────────────────────────────────

const ONSETS = ["b", "br", "c", "cl", "cr", "d", "dr", "f", "fl", "g", "gr", "h", "j", "k", "l", "m", "n", "p", "pl", "pr", "qu", "r", "s", "sc", "sl", "sp", "st", "str", "t", "th", "tr", "v", "w", "z"];
const NUCLEI = ["a", "e", "i", "o", "u", "ai", "ea", "ee", "io", "ou", "oa"];
const CODAS = ["", "", "n", "r", "s", "t", "l", "m", "nd", "nt", "st", "ck", "ng", "rk"];
const SUFFIXES = ["", "", "", "ate", "ic", "ous", "ent", "ive", "ism", "ure", "ity", "al", "ize", "ly"];

// Unique, pronounceable pseudo-words ("brantic", "scoulive"…). Real words
// would need a big list; these exercise the same code paths.
function vocabulary(rng: Rng, n: number): string[] {
  const out = new Set<string>();
  while (out.size < n) {
    let w = "";
    const syl = int(rng, 1, 3);
    for (let i = 0; i < syl; i++) w += pick(rng, ONSETS) + pick(rng, NUCLEI) + (i === syl - 1 ? pick(rng, CODAS) : "");
    w += pick(rng, SUFFIXES);
    if (w.length >= 4 && !FUNCTION_WORDS.includes(w)) out.add(w);
  }
  return [...out];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sentence(rng: Rng, vocab: readonly string[], words: number, inject: string[] = []): string {
  const parts: string[] = [];
  for (let i = 0; i < words; i++) parts.push(chance(rng, 0.55) ? pick(rng, FUNCTION_WORDS) : pick(rng, vocab));
  for (const w of inject) parts.splice(int(rng, 0, parts.length), 0, w);
  if (chance(rng, 0.08)) parts.splice(int(rng, 0, parts.length), 0, `**${pick(rng, vocab)}**`);
  if (chance(rng, 0.05)) parts.splice(int(rng, 0, parts.length), 0, `\`${pick(rng, vocab)}()\``);
  if (chance(rng, 0.04)) parts.splice(int(rng, 0, parts.length), 0, `[[${capitalize(pick(rng, vocab))}]]`);
  return capitalize(parts.join(" ")) + pick(rng, [".", ".", ".", "?", "!"]);
}

function prose(rng: Rng, vocab: readonly string[], sentences: number, inject: string[] = []): string {
  const out: string[] = [];
  for (let i = 0; i < sentences; i++) out.push(sentence(rng, vocab, int(rng, 8, 18), i === 0 ? inject : []));
  return out.join(" ");
}

// ── notes ───────────────────────────────────────────────────────────────

interface Draft {
  path: string;
  lines: string[];
  sections: StressSection[];
}

// `marks`: tracked words to place in this note as ==word==; returns each
// word's line.
function draftNote(
  rng: Rng,
  path: string,
  title: string,
  sectionCount: number,
  vocab: readonly string[],
  marks: readonly string[]
): { draft: Draft; lineOf: Map<string, number> } {
  const lines: string[] = [];
  const sections: StressSection[] = [];
  const lineOf = new Map<string, number>();
  const queue = [...marks];
  const push = (kind: SectionKind, block: string[]) => {
    if (lines.length) lines.push("");
    const lineStart = lines.length;
    lines.push(...block);
    sections.push({ kind, lineStart, lineEnd: lines.length - 1 });
  };
  push("heading", [`# ${title}`]);
  // Spread the marks over the paragraphs: about one word per section.
  const perSection = Math.max(1, Math.ceil(queue.length / Math.max(1, sectionCount * 0.7)));
  for (let i = 1; i < sectionCount; i++) {
    const roll = rng();
    if (roll < 0.08) {
      push("heading", [`## ${capitalize(pick(rng, vocab))} ${pick(rng, vocab)}`]);
      continue;
    }
    if (roll < 0.12) {
      push("code", ["```js", `const ${pick(rng, vocab)} = ${int(rng, 1, 99)};`, `${pick(rng, vocab)}(${pick(rng, vocab)});`, "```"]);
      continue;
    }
    const take = queue.splice(0, int(rng, 0, perSection + 1)).map((w) => `==${w}==`);
    if (roll < 0.2) {
      const items: string[] = [];
      const n = int(rng, 3, 5);
      for (let k = 0; k < n; k++) items.push(`- ${sentence(rng, vocab, int(rng, 5, 10), k === 0 ? take : [])}`);
      push("list", items);
    } else if (roll < 0.26) {
      push("quote", [`> ${prose(rng, vocab, int(rng, 1, 3), take)}`]);
    } else if (roll < 0.36) {
      // A paragraph soft-wrapped over several lines.
      const n = int(rng, 2, 3);
      const block: string[] = [];
      for (let k = 0; k < n; k++) block.push(prose(rng, vocab, int(rng, 1, 2), k === 0 ? take : []));
      push("paragraph", block);
    } else {
      push("paragraph", [prose(rng, vocab, int(rng, 2, 5), take)]);
    }
  }
  // Marks that didn't fit go into a closing paragraph.
  if (queue.length) push("paragraph", [prose(rng, vocab, 2, queue.splice(0).map((w) => `==${w}==`))]);
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/==([^=]+)==/g)) if (!lineOf.has(m[1])) lineOf.set(m[1], i);
  }
  return { draft: { path, lines, sections }, lineOf };
}

function sectionText(d: Draft, s: StressSection): string {
  return d.lines.slice(s.lineStart, s.lineEnd + 1).join("\n");
}

// ── records ─────────────────────────────────────────────────────────────

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// nowStamp()'s local "YYYY-MM-DD HH:mm:ss".
function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function srsCard(rng: Rng, now: number): SrsCard | undefined {
  const roll = rng();
  if (roll < 0.3) return undefined; // never reviewed
  const reps = int(rng, 1, 12);
  const last = now - int(rng, 1, 40) * DAY;
  if (roll < 0.45) {
    return { due: iso(now + int(rng, -60, 600) * 60_000), stability: 0.5 + rng(), difficulty: 4 + rng() * 3, elapsedDays: 0, scheduledDays: 0, learningSteps: int(rng, 0, 1), reps, lapses: 0, state: 1, lastReview: iso(last) };
  }
  if (roll < 0.95) {
    const sched = int(rng, 1, 90);
    return { due: iso(now + int(rng, -10, 60) * DAY), stability: sched * (0.8 + rng() * 0.4), difficulty: 2 + rng() * 6, elapsedDays: int(rng, 0, sched), scheduledDays: sched, learningSteps: 0, reps, lapses: int(rng, 0, 3), state: 2, lastReview: iso(last) };
  }
  return { due: iso(now + int(rng, -2, 2) * DAY), stability: 1 + rng(), difficulty: 6 + rng() * 3, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps, lapses: int(rng, 1, 4), state: 3, lastReview: iso(last) };
}

function answer(rng: Rng, vocab: readonly string[]): string {
  const parts = [`你問的是：${pick(rng, vocab)} 的用法。`];
  const n = int(rng, 2, 5);
  for (let i = 0; i < n; i++) parts.push(`- **${pick(rng, vocab)}**：${prose(rng, vocab, int(rng, 1, 3))}`);
  return parts.join("\n\n");
}

function rounds(rng: Rng, vocab: readonly string[], tasks: readonly string[], startMs: number, idPrefix: string): Turn[] {
  const turns: Turn[] = [];
  let at = startMs;
  const n = int(rng, 1, 4);
  for (let r = 0; r < n; r++) {
    at += int(rng, 1, 72) * 3_600_000;
    const taskId = pick(rng, tasks);
    const custom = taskId.endsWith(".custom");
    const question = custom ? sentence(rng, vocab, int(rng, 6, 14)).replace(/[.!]$/, "?") : undefined;
    const user: Turn = { id: `${idPrefix}-u${r}`, role: "user", content: question ?? taskId, at: iso(at), taskId, status: "done", sent: `〔問題〕\n${question ?? taskId}` };
    if (question) user.question = question;
    const a: Turn = {
      id: `${idPrefix}-a${r}`,
      role: "assistant",
      content: answer(rng, vocab),
      at: iso(at + 1),
      taskId,
      taskVersion: 3,
      status: chance(rng, 0.03) ? "aborted" : "done",
      model: "claude-sonnet-5",
      provider: "anthropic",
      usage: { input: int(rng, 400, 3000), output: int(rng, 100, 900), cacheRead: int(rng, 0, 2000), cacheWrite: 0 },
      stop: "end",
    };
    if (chance(rng, 0.1)) a.feedback = pick(rng, ["up", "down"] as const);
    turns.push(user, a);
  }
  return turns;
}

const WORD_TASKS = ["word.usage", "word.compare", "word.sentence", "word.mnemonic", "word.custom"];
const PARAGRAPH_TASKS = ["paragraph.grammar", "paragraph.translate", "paragraph.vocab", "paragraph.paraphrase", "paragraph.custom"];

// ── build ───────────────────────────────────────────────────────────────

export function buildStressFixture(options: StressOptions = {}): StressFixture {
  const o = { ...STRESS_DEFAULTS, ...options };
  const rng = mulberry32(o.seed);
  const now = o.now.getTime();
  const total = o.words + o.tombstones;
  const vocab = vocabulary(rng, total + 5000);
  const tracked = vocab.slice(0, total);
  const filler = vocab.slice(total);

  // Which note each word comes from.
  const notePaths = Array.from({ length: o.notes }, (_, i) => `閱讀/文章-${String(i + 1).padStart(2, "0")}.md`);
  const sourceOf: (string | null)[] = tracked.map((_, i) => {
    if (i < o.articleWords) return ARTICLE_PATH;
    if (chance(rng, 0.05)) return null;
    return pick(rng, notePaths);
  });

  // Notes, with every tracked word marked where it was captured.
  const marksBy = new Map<string, string[]>();
  tracked.forEach((w, i) => {
    const p = sourceOf[i];
    if (p) (marksBy.get(p) ?? marksBy.set(p, []).get(p)!).push(w);
  });
  // Notes mix tracked words with others, like real reading.
  const noteVocab = [...filler.slice(0, 3000), ...tracked];
  const drafts: Draft[] = [];
  const lineOf = new Map<string, number>();
  const art = draftNote(rng, ARTICLE_PATH, "長文壓測：A long read", o.articleSections, noteVocab, marksBy.get(ARTICLE_PATH) ?? []);
  drafts.push(art.draft);
  art.lineOf.forEach((v, k) => lineOf.set(k, v));
  for (const p of notePaths) {
    const n = draftNote(rng, p, capitalize(pick(rng, filler)), int(rng, 12, 30), noteVocab, marksBy.get(p) ?? []);
    drafts.push(n.draft);
    n.lineOf.forEach((v, k) => lineOf.set(k, v));
  }

  // Entries.
  const entries: VocabEntry[] = tracked.map((word, i) => {
    const created = now - int(rng, 1, 400) * DAY - int(rng, 0, DAY);
    const updated = Math.min(now - 1000, created + int(rng, 0, 30) * DAY);
    const tags = shuffle(rng, LEVEL_TAGS).slice(0, chance(rng, 0.4) ? int(rng, 1, 2) : 0);
    const path = sourceOf[i];
    const e: VocabEntry = {
      id: String(1_690_000_000_000 + i * 7919),
      word,
      lang: "en",
      level: tags.join(", "),
      synonyms: chance(rng, 0.7) ? [pick(rng, filler), pick(rng, filler)].join(", ") : "",
      antonyms: chance(rng, 0.2) ? pick(rng, filler) : "",
      example: path ? prose(rng, noteVocab, 1, [word]) : "",
      definition: `${capitalize(prose(rng, filler, 1))}`,
      definitionZh: pick(rng, ZH),
      phonetic: `/${word.replace(/[aeiou]+/g, "ə")}/`,
      partOfSpeech: pick(rng, POS),
      grammar: chance(rng, 0.1) ? prose(rng, filler, 1) : "",
      source: path ? { path, line: lineOf.get(word) ?? 0 } : null,
      added: stamp(created),
      lastReviewed: stamp(updated),
      reviews: int(rng, 0, 9),
      createdAt: iso(created),
      updatedAt: iso(updated),
      rev: int(rng, 0, 6),
    };
    const card = srsCard(rng, now);
    if (card) e.srs = card;
    // Verb usage (L6) already generated for some verbs.
    if (e.partOfSpeech === "verb" && chance(rng, 0.3)) {
      e.usage = {
        patterns: [0, 1].map(() => ({ pattern: `${word} + ${pick(rng, ["名詞", "to V", "V-ing", "that 子句"])}`, meaningZh: pick(rng, ZH), example: prose(rng, filler, 1, [word]) })),
        related: [{ phrase: `${word} ${pick(rng, ["up", "out", "over", "away"])}`, zh: pick(rng, ZH) }],
        generatedAt: iso(updated),
        model: "claude-haiku-4-5",
      };
    }
    if (chance(rng, 0.3)) e.origin = "wordlist";
    // Wave 7 Y (1006report.md #23): this fixture predates the `liked`
    // field, so approximate what a one-time backfill would have computed
    // — real signals already on the entry (usage/reviews/srs/grammar),
    // minus word-thread activity (the threads below are built from `live`
    // words, after this map, so that signal isn't available here yet;
    // leaving it out only undercounts a few wordlist-origin entries as
    // unliked, which doesn't matter for perf/migration fixtures).
    e.liked = initialLiked(e, {
      hasWordThread: false,
      hasUsage: !!e.usage,
      hasReviewed: (e.reviews ?? 0) > 0 || e.srs !== undefined,
      hasEditedContent: !!e.grammar?.trim(),
    });
    if (i >= o.words) {
      e.deletedAt = iso(now - int(rng, 1, 20) * DAY);
      e.updatedAt = e.deletedAt;
    }
    return e;
  });
  const live = entries.slice(0, o.words);

  // Word threads.
  const threads: Thread[] = [];
  const withSource = shuffle(rng, live.filter((e) => e.source));
  for (const e of withSource.slice(0, o.wordThreads)) {
    const start = Date.parse(e.createdAt as string);
    const turns = rounds(rng, filler, WORD_TASKS, start, `w${e.id}`);
    threads.push({
      id: wordThreadId(e.id),
      anchor: { kind: "word", entryId: e.id, origin: { path: (e.source as { path: string }).path } },
      turns,
      createdAt: iso(start),
      updatedAt: turns[turns.length - 1].at,
      rev: turns.length / 2,
    });
  }

  // Paragraph threads: 60% in the long article, the rest elsewhere.
  const anchorable = (d: Draft) => d.sections.filter((s) => s.kind === "paragraph" || s.kind === "list" || s.kind === "quote");
  const inArticle = Math.round(o.paragraphThreads * 0.6);
  const targets: { d: Draft; s: StressSection }[] = shuffle(rng, anchorable(art.draft))
    .slice(0, inArticle)
    .map((s) => ({ d: art.draft, s }));
  const others = shuffle(
    rng,
    drafts.slice(1).flatMap((d) => anchorable(d).map((s) => ({ d, s })))
  );
  targets.push(...others.slice(0, o.paragraphThreads - targets.length));
  const usedIds = new Set<string>();
  targets.forEach(({ d, s }, k) => {
    const start = now - int(rng, 5, 200) * DAY;
    const original = sectionText(d, s);
    const turns = rounds(rng, filler, PARAGRAPH_TASKS, start, `p${k}`);
    const hashMode = chance(rng, 0.25);
    let blockId: string | undefined;
    if (!hashMode) {
      do blockId = `vt-${base36(rng, 6)}`;
      while (usedIds.has(blockId));
      usedIds.add(blockId);
      d.lines[s.lineEnd] = `${d.lines[s.lineEnd]} ^${blockId}`;
    }
    threads.push({
      id: `paragraph:${(start + k).toString(36)}-${base36(rng, 6)}`,
      anchor: { kind: "paragraph", path: d.path, ...(blockId ? { blockId } : {}), hash: paragraphHash(original), snapshot: plainParagraph(original) },
      turns,
      createdAt: iso(start),
      updatedAt: turns[turns.length - 1].at,
      rev: turns.length / 2,
    });
  });

  // Word families and saved trivia (learn.json).
  const families: Family[] = Array.from({ length: 12 }, (_, f) => {
    const members = shuffle(rng, live).slice(0, int(rng, 8, 15));
    const groups = [0, 1, 2].map((g) => ({
      label: `${pick(rng, ZH)}組`,
      members: members.filter((_, m) => m % 3 === g).map((e) => ({ entryId: e.id, word: e.word, zh: e.definitionZh })),
    }));
    groups[2].members.push({ word: pick(rng, filler), zh: pick(rng, ZH) } as { entryId: string; word: string; zh: string });
    const at = iso(now - int(rng, 1, 60) * DAY);
    return { id: `fam-${f}`, topic: pick(rng, filler), label: `${pick(rng, ZH)}家族`, source: "ai", groups, seedEntryIds: [members[0].id], entryCountAtGenerate: 900, createdAt: at, updatedAt: at, rev: 0 };
  });
  const trivia: TriviaItem[] = Array.from({ length: 15 }, (_, k) => {
    const subject = pick(rng, live);
    const others = shuffle(rng, live).slice(0, int(rng, 0, 3));
    const at = iso(now - int(rng, 1, 60) * DAY);
    return {
      id: `triv-${k}`,
      entryId: subject.id,
      mentions: others.map((e) => e.id),
      title: `${capitalize(subject.word)} ${pick(rng, filler)}`,
      body: prose(rng, [...filler.slice(0, 200), ...others.map((e) => e.word)], int(rng, 2, 4)),
      createdAt: at,
      updatedAt: at,
      rev: 0,
    };
  });

  const notes: StressNote[] = drafts.map((d) => ({ path: d.path, text: d.lines.join("\n"), sections: d.sections }));

  // Exam lists over the notes' vocabulary (tracked words and others).
  const pool = shuffle(rng, noteVocab);
  const wordlists = EXAM_TAGS.map((tag, i) => {
    const words = pool.slice(i * 900, i * 900 + 1500);
    const body = words.map((w) => (chance(rng, 0.3) ? `${w} ${pick(rng, ["n.", "v.", "adj."])} ${pick(rng, ZH)}` : w)).join("\n");
    return { path: `vocab-wordlists/${tag.replace("/", "-")}.md`, text: `# ${tag}\n\n${body}\n` };
  });

  const settings: PluginSettings = {
    schemaVersion: 2,
    updatedAt: iso(now - 10 * DAY),
    // AI switched on but no API key anywhere: the ✦ ghosts draw on every
    // paragraph (the heavier reading-view case), and §1.3's "no key" check
    // runs against the same data.
    ai: { ...defaultAiSettings(), enabled: true, updatedAt: iso(now - 10 * DAY) },
    // autoImport off: the wordlists above intentionally also cover filler
    // words no entry tracks (for examHighlight's underline, not import).
    // Wave 7 Y (1006 #25) made every note-open re-check for exam words the
    // vocab list lost, so with this on every boot would auto-import those
    // filler overlaps and enrich them (real network calls) — noise no
    // test here is about. highlight/inflections (the underline itself)
    // don't read this flag, so it's unaffected.
    wordlists: { highlight: true, inflections: true, autoImport: false, tags: {} },
  };

  const clone = <T>(x: T): T => structuredClone(x);
  return {
    now: o.now,
    seed: o.seed,
    entries,
    liveEntries: live,
    threads,
    article: notes[0],
    notes,
    wordlists,
    settings,
    data: () => clone({ schemaVersion: 2, settings, entries }),
    threadsShard: () => clone({ threads }),
    learnShard: () => clone({ families, trivia }),
    v1Data: () => ({ entries: live.map(toV1) }),
  };
}

// The same word as a pre-M1 data.json had it: no Record_ fields, no SRS,
// no origin. Every 10th one also lacks definitionZh, like the very first
// releases (89050ec).
export function toV1(e: VocabEntry, i = 0): VocabEntryV1 {
  const v1: VocabEntryV1 = {
    id: e.id,
    word: e.word,
    level: e.level,
    synonyms: e.synonyms,
    antonyms: e.antonyms,
    example: e.example,
    definition: e.definition,
    definitionZh: e.definitionZh,
    phonetic: e.phonetic,
    partOfSpeech: e.partOfSpeech,
    grammar: e.grammar,
    source: e.source ? { ...e.source } : null,
    added: e.added,
    lastReviewed: e.lastReviewed,
    reviews: e.reviews,
  };
  if (i % 10 === 9) delete (v1 as Partial<VocabEntryV1>).definitionZh;
  if (i % 7 === 3) v1.audio = `https://upload.example/${e.word}.ogg`;
  return v1;
}

// Tag lookup for a word list path, as WordlistService would derive it.
export function examTagOf(path: string): string {
  const base = path.split("/").pop()!.replace(/\.md$/, "");
  const i = base.indexOf("-");
  return i > 0 ? `${base.slice(0, i)}/${base.slice(i + 1)}` : base;
}
