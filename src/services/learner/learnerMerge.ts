import { PRACTICE_KINDS } from "../../core/model/practice";
import type { PracticeQuestion, ScenarioTrack } from "../../core/model/practice";
import { DIARY_PICK_KINDS, FOCUS_KINDS, LEARN_RESULTS, READING_KINDS, TRACKS } from "../../core/model/learner";
import { localDayOf, mergeReading, readingCutoffDay, sortKinds } from "../../core/learner/reading";
import { ASK_SURFACES } from "../../core/model/learner";
import type {
  AskEvent,
  DiaryPick,
  FocusRef,
  GlossWord,
  LearnEvent,
  LearnerShard,
  MistakeItem,
  ParagraphGloss,
  PoolItem,
  PoolRemoveReason,
  ReadingKind,
  ReadingVisit,
  Track,
  TrackFilter,
  WordCefr,
  WordTouch,
} from "../../core/model/learner";
import { isCefrTier } from "../../core/wordlists/cefr";
import { mergeRecords } from "../learn/learnMerge";

// Multi-device merge for store/learner.json (規劃書 12 §1). Events are
// append-only: unioned by id, the local copy standing. Pool, mistakes and
// filters follow the learn.json rule (same id → newer updatedAt wins), so a
// removal tombstone is not resurrected by an older copy. Pure.

const DAY_MS = 86_400_000;
export const POOL_TOMBSTONE_TTL_MS = 30 * DAY_MS;
export const MISTAKE_RESOLVED_TTL_MS = 90 * DAY_MS;
export const EVENT_TTL_MS = 365 * DAY_MS;
// A stored question nobody points at (not in a live pool item or an open
// mistake) is kept this long after it was written.
export const QUESTION_TTL_MS = 30 * DAY_MS;

function ms(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : 0;
  return Number.isNaN(t) ? 0 : t;
}

export function emptyLearnerShard(): LearnerShard {
  return { events: [], pool: [], mistakes: [], filters: [], questions: [], meta: {}, reading: [], diaryPicks: [], asks: [], wordTouches: [], wordCefr: [], glosses: [] };
}

const str = (v: unknown): v is string => typeof v === "string" && v !== "";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => str(v) && !Number.isNaN(Date.parse(v));
const isTrack = (v: unknown): v is Track => TRACKS.includes(v as Track);
const REASONS: readonly PoolRemoveReason[] = ["answered", "skipped", "retired", "filtered"];

function focusOf(raw: unknown): FocusRef | null {
  if (!isObj(raw) || !str(raw.id) || !FOCUS_KINDS.includes(raw.kind as FocusRef["kind"])) return null;
  return { kind: raw.kind as FocusRef["kind"], id: raw.id };
}

function normalizeEvent(raw: unknown): LearnEvent | null {
  if (!isObj(raw) || !str(raw.id) || !isIso(raw.at) || !isTrack(raw.track)) return null;
  const focus = focusOf(raw.focus);
  if (!focus || !LEARN_RESULTS.includes(raw.result as LearnEvent["result"])) return null;
  const e: LearnEvent = { id: raw.id, at: raw.at, track: raw.track, focus, result: raw.result as LearnEvent["result"] };
  if (typeof raw.given === "string") e.given = raw.given;
  if (str(raw.errorTag)) e.errorTag = raw.errorTag;
  if (str(raw.questionId)) e.questionId = raw.questionId;
  return e;
}

function normalizePool(raw: unknown): PoolItem | null {
  if (!isObj(raw) || !str(raw.id) || !isTrack(raw.track) || !str(raw.questionId)) return null;
  if (!isIso(raw.addedAt)) return null;
  const p: PoolItem = {
    id: raw.id,
    track: raw.track,
    questionId: raw.questionId,
    seq: typeof raw.seq === "number" && Number.isFinite(raw.seq) ? raw.seq : 0,
    addedAt: raw.addedAt,
    updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : raw.addedAt,
  };
  if (str(raw.scenarioId)) p.scenarioId = raw.scenarioId;
  if (isIso(raw.removedAt)) {
    p.removedAt = raw.removedAt;
    p.removeReason = REASONS.includes(raw.removeReason as PoolRemoveReason) ? (raw.removeReason as PoolRemoveReason) : "answered";
  }
  return p;
}

function normalizeMistake(raw: unknown): MistakeItem | null {
  if (!isObj(raw) || !str(raw.id) || !isTrack(raw.track) || !str(raw.questionId)) return null;
  const focus = focusOf(raw.focus);
  if (!focus || !isIso(raw.lastWrongAt)) return null;
  const addedAt = isIso(raw.addedAt) ? raw.addedAt : raw.lastWrongAt;
  const m: MistakeItem = {
    id: raw.id,
    track: raw.track,
    questionId: raw.questionId,
    focus,
    addedAt,
    lastWrongAt: raw.lastWrongAt,
    updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : raw.lastWrongAt,
  };
  if (isIso(raw.resolvedAt)) m.resolvedAt = raw.resolvedAt;
  return m;
}

function normalizeFilter(raw: unknown): TrackFilter | null {
  if (!isObj(raw) || !isTrack(raw.id)) return null;
  return { id: raw.id, value: raw.value, updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : "" };
}

const SCENARIO_TRACKS: readonly ScenarioTrack[] = ["poly", "vocab", "mix", "para"];

function normalizeQuestion(raw: unknown): PracticeQuestion | null {
  if (!isObj(raw) || !str(raw.id) || !SCENARIO_TRACKS.includes(raw.track as ScenarioTrack)) return null;
  if (!PRACTICE_KINDS.includes(raw.kind as PracticeQuestion["kind"])) return null;
  if (!str(raw.text) || !str(raw.answerId) || !str(raw.explanation)) return null;
  const focus = focusOf(raw.focus);
  if (!focus || !isObj(raw.scenario) || !str(raw.scenario.id) || !str(raw.scenario.scene)) return null;
  if (!Array.isArray(raw.options)) return null;
  const options: { id: string; text: string }[] = [];
  for (const o of raw.options) {
    if (isObj(o) && str(o.id) && typeof o.text === "string" && o.text !== "") options.push({ id: o.id, text: o.text });
  }
  if (options.length < 2 || !options.some((o) => o.id === raw.answerId)) return null;
  const sc = raw.scenario;
  const scenario: PracticeQuestion["scenario"] = {
    id: sc.id as string,
    scene: sc.scene as string,
    seq: typeof sc.seq === "number" && Number.isFinite(sc.seq) ? sc.seq : 0,
  };
  if (str(sc.speaker)) scenario.speaker = sc.speaker;
  if (Array.isArray(sc.lead)) {
    const lead: { speaker?: string; text: string }[] = [];
    for (const l of sc.lead) {
      if (!isObj(l) || !str(l.text)) continue;
      lead.push(str(l.speaker) ? { speaker: l.speaker, text: l.text } : { text: l.text });
    }
    if (lead.length) scenario.lead = lead;
  }
  const createdAt = isIso(raw.createdAt) ? raw.createdAt : isIso(raw.updatedAt) ? raw.updatedAt : "1970-01-01T00:00:00.000Z";
  const q: PracticeQuestion = {
    id: raw.id,
    track: raw.track as ScenarioTrack,
    scenario,
    kind: raw.kind as PracticeQuestion["kind"],
    text: raw.text,
    options,
    answerId: raw.answerId,
    explanation: raw.explanation,
    focus,
    createdAt,
    updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : createdAt,
  };
  if (isObj(raw.optionNotes)) {
    const notes: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.optionNotes)) if (str(v)) notes[k] = v;
    if (Object.keys(notes).length) q.optionNotes = notes;
  }
  if (str(raw.sentenceZh)) q.sentenceZh = raw.sentenceZh;
  if (str(raw.errorTag)) q.errorTag = raw.errorTag;
  if (isIso(raw.retiredAt)) q.retiredAt = raw.retiredAt;
  return q;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeVisit(raw: unknown): ReadingVisit | null {
  if (!isObj(raw) || !str(raw.id) || !str(raw.path) || !str(raw.day) || !DAY_RE.test(raw.day) || !isIso(raw.at)) return null;
  const kinds = Array.isArray(raw.kinds) ? sortKinds(raw.kinds.filter((k): k is ReadingKind => READING_KINDS.includes(k as ReadingKind))) : [];
  if (kinds.length === 0) return null;
  const v: ReadingVisit = {
    id: raw.id,
    day: raw.day,
    at: raw.at,
    updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : raw.at,
    path: raw.path,
    title: typeof raw.title === "string" ? raw.title : "",
    kinds,
  };
  if (str(raw.heading)) v.heading = raw.heading;
  return v;
}

function normalizePick(raw: unknown): DiaryPick | null {
  if (!isObj(raw) || !str(raw.id) || !str(raw.key) || !str(raw.day) || !isIso(raw.at)) return null;
  if (!DIARY_PICK_KINDS.includes(raw.kind as DiaryPick["kind"])) return null;
  return { id: raw.id, kind: raw.kind as DiaryPick["kind"], key: raw.key, day: raw.day, at: raw.at };
}

function mergePicks(a: readonly DiaryPick[], b: readonly DiaryPick[]): DiaryPick[] {
  const map = new Map<string, DiaryPick>();
  for (const p of [...a, ...b]) {
    const cur = map.get(p.id);
    if (!cur || ms(p.at) < ms(cur.at)) map.set(p.id, p);
  }
  return [...map.values()];
}

function normalizeAsk(raw: unknown): AskEvent | null {
  if (!isObj(raw) || !str(raw.id) || !isIso(raw.at) || typeof raw.taskId !== "string") return null;
  const e: AskEvent = {
    id: raw.id,
    at: raw.at,
    surface: ASK_SURFACES.includes(raw.surface as AskEvent["surface"]) ? (raw.surface as AskEvent["surface"]) : "other",
    taskId: raw.taskId,
    custom: raw.custom === true,
    ok: raw.ok === true,
  };
  if (str(raw.entryId)) e.entryId = raw.entryId;
  if (str(raw.path)) e.path = raw.path;
  if (str(raw.selection)) e.selection = raw.selection;
  if (str(raw.question)) e.question = raw.question;
  return e;
}

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function normalizeTouch(raw: unknown): WordTouch | null {
  if (!isObj(raw) || !str(raw.word) || !str(raw.day) || !DAY_RE.test(raw.day)) return null;
  const lookup = count(raw.lookup);
  const pronounce = count(raw.pronounce);
  if (lookup + pronounce === 0) return null;
  const word = raw.word.toLowerCase();
  const id = `${raw.day}|${word}`;
  return { id, day: raw.day, word, lookup, pronounce, saved: raw.saved === true, updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : `${raw.day}T00:00:00.000Z` };
}

function normalizeWordCefr(raw: unknown): WordCefr | null {
  if (!isObj(raw) || !str(raw.id) || !isCefrTier(raw.level) || !isIso(raw.at)) return null;
  const id = raw.id.trim().toLowerCase();
  return id ? { id, level: raw.level, at: raw.at } : null;
}

function mergeWordCefr(a: readonly WordCefr[], b: readonly WordCefr[]): WordCefr[] {
  const map = new Map<string, WordCefr>();
  for (const w of [...a, ...b]) {
    const cur = map.get(w.id);
    if (!cur || ms(w.at) > ms(cur.at)) map.set(w.id, w);
  }
  return [...map.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

function normalizeGloss(raw: unknown): ParagraphGloss | null {
  if (!isObj(raw) || !str(raw.id) || typeof raw.path !== "string" || !isIso(raw.at) || !Array.isArray(raw.words)) return null;
  const words: GlossWord[] = [];
  for (const w of raw.words) {
    if (!isObj(w) || !str(w.w) || typeof w.zh !== "string" || typeof w.en !== "string") continue;
    const g: GlossWord = { w: w.w.toLowerCase(), zh: w.zh, en: w.en };
    if (str(w.pos)) g.pos = w.pos;
    words.push(g);
  }
  return { id: raw.id, path: raw.path, words, at: raw.at };
}

// The newer gloss of a paragraph wins.
function mergeGlosses(a: readonly ParagraphGloss[], b: readonly ParagraphGloss[]): ParagraphGloss[] {
  const map = new Map<string, ParagraphGloss>();
  for (const g of [...a, ...b]) {
    const cur = map.get(g.id);
    if (!cur || ms(g.at) > ms(cur.at)) map.set(g.id, g);
  }
  return [...map.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

function mergeAsks(a: readonly AskEvent[], b: readonly AskEvent[]): AskEvent[] {
  const map = new Map<string, AskEvent>();
  for (const e of [...a, ...b]) {
    const cur = map.get(e.id);
    if (!cur || ms(e.at) > ms(cur.at)) map.set(e.id, e);
  }
  return [...map.values()].sort((x, y) => ms(x.at) - ms(y.at) || (x.id < y.id ? -1 : 1));
}

function mergeTouches(a: readonly WordTouch[], b: readonly WordTouch[]): WordTouch[] {
  const map = new Map<string, WordTouch>();
  for (const t of [...a, ...b]) {
    const cur = map.get(t.id);
    if (!cur) {
      map.set(t.id, { ...t });
      continue;
    }
    map.set(t.id, {
      ...cur,
      lookup: Math.max(cur.lookup, t.lookup),
      pronounce: Math.max(cur.pronounce, t.pronounce),
      saved: cur.saved || t.saved,
      updatedAt: ms(t.updatedAt) > ms(cur.updatedAt) ? t.updatedAt : cur.updatedAt,
    });
  }
  return [...map.values()];
}

function normList<T>(raw: unknown, one: (r: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const r of raw) {
    const v = one(r);
    if (v) out.push(v);
  }
  return out;
}

export function normalizeLearnerShard(raw: unknown): LearnerShard {
  const s = isObj(raw) ? raw : {};
  const meta: LearnerShard["meta"] = {};
  if (isObj(s.meta) && isIso(s.meta.grammarMigratedAt)) meta.grammarMigratedAt = s.meta.grammarMigratedAt;
  if (isObj(s.meta) && isIso(s.meta.asksMigratedAt)) meta.asksMigratedAt = s.meta.asksMigratedAt;
  return {
    events: sortEvents(normList(s.events, normalizeEvent)),
    pool: normList(s.pool, normalizePool),
    mistakes: normList(s.mistakes, normalizeMistake),
    filters: normList(s.filters, normalizeFilter),
    questions: normList(s.questions, normalizeQuestion),
    meta,
    reading: normList(s.reading, normalizeVisit),
    diaryPicks: normList(s.diaryPicks, normalizePick),
    asks: normList(s.asks, normalizeAsk),
    wordTouches: normList(s.wordTouches, normalizeTouch),
    wordCefr: mergeWordCefr(normList(s.wordCefr, normalizeWordCefr), []),
    glosses: mergeGlosses(normList(s.glosses, normalizeGloss), []),
  };
}

export function sortEvents(list: LearnEvent[]): LearnEvent[] {
  return list.sort((a, b) => ms(a.at) - ms(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function mergeLearner(local: LearnerShard, remote: LearnerShard): LearnerShard {
  const a = local.meta.grammarMigratedAt;
  const b = remote.meta.grammarMigratedAt;
  const migrated = a && b ? (ms(a) <= ms(b) ? a : b) : a ?? b;
  const aa = local.meta.asksMigratedAt;
  const ab = remote.meta.asksMigratedAt;
  const asksMigrated = aa && ab ? (ms(aa) <= ms(ab) ? aa : ab) : aa ?? ab;
  const meta: LearnerShard["meta"] = {};
  if (migrated) meta.grammarMigratedAt = migrated;
  if (asksMigrated) meta.asksMigratedAt = asksMigrated;
  return {
    events: sortEvents(mergeRecords(local.events, remote.events, (l) => l)),
    pool: mergeRecords(local.pool, remote.pool),
    mistakes: mergeRecords(local.mistakes, remote.mistakes),
    filters: mergeRecords(local.filters, remote.filters),
    questions: mergeRecords(local.questions, remote.questions),
    meta,
    reading: mergeReading(local.reading ?? [], remote.reading ?? []),
    diaryPicks: mergePicks(local.diaryPicks ?? [], remote.diaryPicks ?? []),
    asks: mergeAsks(local.asks ?? [], remote.asks ?? []),
    wordTouches: mergeTouches(local.wordTouches ?? [], remote.wordTouches ?? []),
    wordCefr: mergeWordCefr(local.wordCefr ?? [], remote.wordCefr ?? []),
    glosses: mergeGlosses(local.glosses ?? [], remote.glosses ?? []),
  };
}

// What a merge can change, for deciding whether to write the union back.
export function learnerFingerprint(shard: LearnerShard): string {
  const rows: string[] = [`m|${shard.meta.grammarMigratedAt ?? ""}|${shard.meta.asksMigratedAt ?? ""}`];
  for (const e of shard.events) rows.push(`e|${e.id}`);
  for (const p of shard.pool) rows.push(`p|${p.id}|${p.updatedAt}|${p.removedAt ?? ""}`);
  for (const m of shard.mistakes) rows.push(`x|${m.id}|${m.updatedAt}|${m.resolvedAt ?? ""}`);
  for (const f of shard.filters) rows.push(`f|${f.id}|${f.updatedAt}`);
  for (const q of shard.questions) rows.push(`q|${q.id}|${q.updatedAt}`);
  for (const r of shard.reading ?? []) rows.push(`r|${r.id}|${r.at}|${r.updatedAt}|${r.kinds.join(",")}`);
  for (const d of shard.diaryPicks ?? []) rows.push(`d|${d.id}|${d.at}`);
  for (const a of shard.asks ?? []) rows.push(`a|${a.id}|${a.ok}`);
  for (const w of shard.wordTouches ?? []) rows.push(`w|${w.id}|${w.lookup}|${w.pronounce}|${w.saved}`);
  for (const c of shard.wordCefr ?? []) rows.push(`c|${c.id}|${c.level}|${c.at}`);
  for (const g of shard.glosses ?? []) rows.push(`g|${g.id}|${g.at}`);
  return rows.sort().join("\n");
}

export function pruneLearner(shard: LearnerShard, now: number): LearnerShard {
  const cutoff = readingCutoffDay(now);
  const touchCutoff = localDayOf(new Date(now - EVENT_TTL_MS));
  return {
    events: shard.events.filter((e) => now - ms(e.at) < EVENT_TTL_MS),
    pool: shard.pool.filter((p) => !p.removedAt || now - ms(p.removedAt) < POOL_TOMBSTONE_TTL_MS),
    mistakes: shard.mistakes.filter((m) => !m.resolvedAt || now - ms(m.resolvedAt) < MISTAKE_RESOLVED_TTL_MS),
    filters: shard.filters,
    questions: pruneQuestions(shard, now),
    meta: shard.meta,
    reading: (shard.reading ?? []).filter((r) => r.day >= cutoff),
    diaryPicks: shard.diaryPicks ?? [],
    asks: (shard.asks ?? []).filter((a) => now - ms(a.at) < EVENT_TTL_MS),
    wordTouches: (shard.wordTouches ?? []).filter((w) => w.day >= touchCutoff),
    wordCefr: shard.wordCefr ?? [],
    glosses: shard.glosses ?? [],
  };
}

// Questions that no live pool item and no open mistake points at go once
// they're older than QUESTION_TTL_MS.
function pruneQuestions(shard: LearnerShard, now: number): PracticeQuestion[] {
  const used = new Set<string>();
  for (const p of shard.pool) if (!p.removedAt) used.add(p.questionId);
  for (const m of shard.mistakes) if (!m.resolvedAt) used.add(m.questionId);
  return shard.questions.filter((q) => used.has(q.id) || now - ms(q.createdAt) < QUESTION_TTL_MS);
}
