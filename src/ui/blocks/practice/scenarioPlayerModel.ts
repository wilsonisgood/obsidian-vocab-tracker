// Pure logic of the scenario player (第十六波 P): text segmentation, the
// answered line, state transitions, history trimming, keyboard mapping.
// No DOM here — scenarioPlayer.ts renders what this decides.
import { t } from "../../../core/i18n";
import type { PlayerKind, PlayerLine, PlayerQuestion } from "./playerTypes";

// ---------- segmentation ----------

export type Seg =
  | { t: "text"; text: string }
  | { t: "blank" } // "____"
  | { t: "target"; text: string } // [[word]]
  | { t: "frag"; text: string; optionId: string }; // find-error clickable piece

export function segmentBlanks(text: string): Seg[] {
  const out: Seg[] = [];
  const parts = text.split(/_{3,}/);
  parts.forEach((p, i) => {
    if (p) out.push({ t: "text", text: p });
    if (i < parts.length - 1) out.push({ t: "blank" });
  });
  return out;
}

export function segmentTargets(text: string): Seg[] {
  const out: Seg[] = [];
  const re = /\[\[(.+?)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: "text", text: text.slice(last, m.index) });
    out.push({ t: "target", text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", text: text.slice(last) });
  return out;
}

// Each option text is located at its first occurrence that does not overlap
// an earlier option's range (so a repeated word maps to different spots).
export function segmentFragments(text: string, options: readonly { id: string; text: string }[]): Seg[] {
  const claimed: { start: number; end: number; optionId: string }[] = [];
  for (const o of options) {
    if (!o.text) continue;
    let from = 0;
    for (;;) {
      const i = text.indexOf(o.text, from);
      if (i < 0) break;
      const end = i + o.text.length;
      if (!claimed.some((c) => i < c.end && end > c.start)) {
        claimed.push({ start: i, end, optionId: o.id });
        break;
      }
      from = i + 1;
    }
  }
  claimed.sort((a, b) => a.start - b.start);
  const out: Seg[] = [];
  let pos = 0;
  for (const c of claimed) {
    if (c.start > pos) out.push({ t: "text", text: text.slice(pos, c.start) });
    out.push({ t: "frag", text: text.slice(c.start, c.end), optionId: c.optionId });
    pos = c.end;
  }
  if (pos < text.length) out.push({ t: "text", text: text.slice(pos) });
  return out;
}

export function questionSegments(q: PlayerQuestion): Seg[] {
  switch (q.kind) {
    case "find-error":
      return segmentFragments(q.text, q.options);
    case "which-sense":
    case "same-sense":
      return segmentTargets(q.text);
    default:
      return segmentBlanks(q.text);
  }
}

// ---------- answered line ----------

export type AnsweredPart = { t: "text" | "target" | "strike" | "fix"; text: string };

function optionText(q: PlayerQuestion, id: string): string {
  return q.options.find((o) => o.id === id)?.text ?? "";
}

// The line as it stays in the history.
export function answeredParts(q: PlayerQuestion): AnsweredPart[] {
  if (q.kind === "find-error") {
    const wrong = optionText(q, q.answerId);
    const parts: AnsweredPart[] = questionSegments(q).map((s): AnsweredPart => {
      if (s.t === "frag") return { t: s.optionId === q.answerId ? "strike" : "text", text: s.text };
      return { t: "text", text: s.t === "blank" ? "" : s.text };
    });
    if (!parts.some((p) => p.t === "strike") && wrong) parts.push({ t: "strike", text: wrong });
    if (q.answered && q.answered !== q.text) parts.push({ t: "fix", text: q.answered });
    return parts;
  }
  if (q.answered) return [{ t: "text", text: q.answered }];
  if (q.kind === "which-sense" || q.kind === "same-sense") {
    return segmentTargets(q.text).map((s): AnsweredPart =>
      s.t === "target" ? { t: "target", text: s.text } : { t: "text", text: s.t === "text" ? s.text : "" }
    );
  }
  const ans = optionText(q, q.answerId);
  return [{ t: "text", text: q.text.replace(/_{3,}/g, ans) }];
}

export function answeredText(q: PlayerQuestion): string {
  return answeredParts(q)
    .map((p) => (p.t === "fix" ? ` → ${p.text}` : p.text))
    .join("");
}

// ---------- state ----------

export type Phase = "asking" | "feedback" | "empty";

export interface HistoryItem {
  qid: string;
  scenarioId?: string;
  scene?: string;
  lead: PlayerLine[];
  speaker?: string;
  parts?: AnsweredPart[]; // absent: retired before answering (leads only)
  skipped: boolean;
}

export interface PlayerState {
  phase: Phase;
  current: PlayerQuestion | null;
  chosen?: string;
  correct?: boolean;
  hinted: boolean;
  hintShown: boolean;
  done: string[]; // ids answered / skipped / retired this session
  history: HistoryItem[];
  answered: number;
  correctCount: number;
}

export function initialState(): PlayerState {
  return { phase: "empty", current: null, hinted: false, hintShown: false, done: [], history: [], answered: 0, correctCount: 0 };
}

function pickNext(done: readonly string[], questions: readonly PlayerQuestion[]): PlayerQuestion | null {
  return questions.find((q) => !done.includes(q.id)) ?? null;
}

function withCurrent(s: PlayerState, q: PlayerQuestion | null): PlayerState {
  return {
    ...s,
    current: q,
    phase: q ? "asking" : "empty",
    chosen: undefined,
    correct: undefined,
    hinted: false,
    hintShown: false,
  };
}

// Re-read questions(): the question on screen stays, unless it was never
// answered and has been moved out of the pool meanwhile.
export function refreshState(s: PlayerState, questions: readonly PlayerQuestion[]): PlayerState {
  if (s.current) {
    if (s.phase === "feedback") return s;
    if (questions.some((q) => q.id === s.current!.id)) return s;
  }
  const next = pickNext(s.done, questions);
  if (!next && !s.current) return s;
  return withCurrent(s, next);
}

export function canHint(s: PlayerState): boolean {
  return s.phase === "asking" && !!s.current?.hints && Object.keys(s.current.hints).length > 0;
}

// 💡 only counts before answering.
export function showHint(s: PlayerState): PlayerState {
  if (!canHint(s)) return s;
  return { ...s, hinted: true, hintShown: true };
}

export function answerState(s: PlayerState, optionId: string): { state: PlayerState; correct: boolean } | null {
  const q = s.current;
  if (s.phase !== "asking" || !q || !q.options.some((o) => o.id === optionId)) return null;
  const correct = optionId === q.answerId;
  return {
    correct,
    state: {
      ...s,
      phase: "feedback",
      chosen: optionId,
      correct,
      answered: s.answered + 1,
      correctCount: s.correctCount + (correct ? 1 : 0),
    },
  };
}

function toHistory(q: PlayerQuestion, skipped: boolean, withLine: boolean): HistoryItem {
  return {
    qid: q.id,
    scenarioId: q.scenarioId,
    scene: q.scene,
    lead: q.lead ?? [],
    speaker: q.speaker,
    parts: withLine ? answeredParts(q) : undefined,
    skipped,
  };
}

function advance(s: PlayerState, item: HistoryItem, questions: readonly PlayerQuestion[]): PlayerState {
  const done = [...s.done, item.qid];
  return withCurrent({ ...s, done, history: [...s.history, item] }, pickNext(done, questions));
}

// 「下一題」 (feedback → next question).
export function nextState(s: PlayerState, questions: readonly PlayerQuestion[]): PlayerState {
  if (s.phase !== "feedback" || !s.current) return s;
  return advance(s, toHistory(s.current, false, true), questions);
}

// 跳過: before answering. In feedback there is nothing to skip → same as next.
export function skipState(s: PlayerState, questions: readonly PlayerQuestion[]): { state: PlayerState; skipped: boolean } {
  if (!s.current || s.phase === "empty") return { state: s, skipped: false };
  if (s.phase === "feedback") return { state: nextState(s, questions), skipped: false };
  return { state: advance(s, toHistory(s.current, true, true), questions), skipped: true };
}

// 👎: works in both phases; an answered line stays in the history.
export function retireState(s: PlayerState, questions: readonly PlayerQuestion[]): PlayerState {
  if (!s.current || s.phase === "empty") return s;
  return advance(s, toHistory(s.current, false, s.phase === "feedback"), questions);
}

export function feedbackNote(s: PlayerState): string | undefined {
  const q = s.current;
  if (!q || s.phase !== "feedback" || s.correct || !s.chosen) return undefined;
  return q.optionNotes?.[s.chosen];
}

// ---------- history ----------

export type HistoryEntry =
  | { type: "scene"; text: string }
  | { type: "line"; speaker?: string; parts: AnsweredPart[]; skipped: boolean; lead: boolean };

export function historyEntries(items: readonly HistoryItem[]): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  let sid: string | undefined;
  for (const it of items) {
    if (it.scenarioId && it.scenarioId !== sid && it.scene) out.push({ type: "scene", text: it.scene });
    if (it.scenarioId) sid = it.scenarioId;
    for (const l of it.lead) out.push({ type: "line", speaker: l.speaker, parts: [{ t: "text", text: l.text }], skipped: false, lead: true });
    if (it.parts) out.push({ type: "line", speaker: it.speaker, parts: it.parts, skipped: it.skipped, lead: false });
  }
  return out;
}

// Keep the last `limit` lines (scene headings don't count); a heading right
// above the first kept line stays with it.
export function trimHistory(entries: readonly HistoryEntry[], limit: number): { shown: HistoryEntry[]; hidden: number } {
  const lineIdx = entries.flatMap((e, i) => (e.type === "line" ? [i] : []));
  if (limit <= 0 || lineIdx.length <= limit) return { shown: [...entries], hidden: 0 };
  const firstKept = lineIdx[lineIdx.length - limit];
  let start = firstKept;
  if (start > 0 && entries[start - 1].type === "scene") start -= 1;
  return { shown: entries.slice(start), hidden: lineIdx.length - limit };
}

export const MOBILE_HISTORY_LIMIT = 3;

// First speaker seen → left, second → right, everyone else left.
export function speakerSides(speakers: readonly (string | undefined)[]): (speaker: string | undefined) => "left" | "right" {
  const order: string[] = [];
  for (const s of speakers) if (s && !order.includes(s)) order.push(s);
  return (sp) => (sp && order.indexOf(sp) === 1 ? "right" : "left");
}

export function entrySpeakers(entries: readonly HistoryEntry[], current?: PlayerQuestion | null): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  for (const e of entries) if (e.type === "line") out.push(e.speaker);
  if (current) {
    for (const l of current.lead ?? []) out.push(l.speaker);
    out.push(current.speaker);
  }
  return out;
}

// ---------- paraphrase option differences ----------

// 換句話說: the options are near-identical sentences, so the words where
// they differ are underlined. A word is "shared" when it is part of the
// longest word sequence common to every option (case and punctuation
// ignored); everything else in an option is a difference.

export interface OptionPart {
  text: string;
  diff: boolean;
}

const MIN_SHARED_WORDS = 3;

const normWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");

// Index pairs [i in a, j in b] of one longest common subsequence.
function lcsPairs(a: readonly string[], b: readonly string[]): [number, number][] {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

const isSpace = (t: string) => /^\s+$/.test(t);

// Each option split into parts; neighbouring different words make one
// underlined run (the space between them included). Options with too
// little in common (unrelated sentences) aren't marked at all.
export function optionDiffParts(options: readonly { text: string }[]): OptionPart[][] {
  const tokens = options.map((o) => o.text.split(/(\s+)/).filter((t) => t !== ""));
  const words = tokens.map((ts) => ts.filter((t) => !isSpace(t)).map(normWord));
  let shared = words[0] ?? [];
  for (const w of words.slice(1)) shared = lcsPairs(shared, w).map(([i]) => shared[i]);
  if (options.length < 2 || shared.filter(Boolean).length < MIN_SHARED_WORDS) {
    return options.map((o) => [{ text: o.text, diff: false }]);
  }

  return tokens.map((ts, k) => {
    const same = new Set(lcsPairs(words[k], shared).map(([i]) => i));
    // Punctuation-only "words" never count as a difference.
    const differs = (wi: number) => !same.has(wi) && words[k][wi] !== "";
    const parts: OptionPart[] = [];
    let wi = 0;
    for (const t of ts) {
      if (isSpace(t)) {
        // wi is the next word here: a space is underlined only between two different words.
        push(parts, t, parts.length > 0 && parts[parts.length - 1].diff && wi < words[k].length && differs(wi));
      } else push(parts, t, differs(wi++));
    }
    return parts;
  });
}

function push(parts: OptionPart[], text: string, diff: boolean): void {
  const last = parts[parts.length - 1];
  if (last && last.diff === diff) last.text += text;
  else parts.push({ text, diff });
}

// ---------- misc ----------

// The question shown under the sentence (第十八波 R): the sentence itself
// never carries it.
export function askLine(q: PlayerQuestion): string {
  switch (q.kind) {
    case "which-sense": {
      const word = questionSegments(q).find((s) => s.t === "target");
      return t("practice.player.ask.which-sense", { word: word && word.t === "target" ? word.text : "" });
    }
    case "same-sense": {
      const word = questionSegments(q).find((s) => s.t === "target");
      return t("practice.player.ask.same-sense", { word: word && word.t === "target" ? word.text : "" });
    }
    case "pick-word":
    case "choice":
      return t("practice.player.ask.pick");
    case "find-error":
      return t("practice.player.ask.find-error");
    case "paraphrase":
      return t("practice.player.ask.paraphrase");
  }
}

// same-sense / paraphrase options are sentences → always one column.
export function optionColumns(kind: PlayerKind, mobile: boolean): 1 | 2 {
  if (kind === "same-sense" || kind === "paraphrase" || mobile) return 1;
  return 2;
}

export type KeyAction = { type: "pick"; index: number } | { type: "next" } | { type: "skip" } | { type: "hint" };

export function keyAction(key: string, s: PlayerState): KeyAction | null {
  if (!s.current || s.phase === "empty") return null;
  if (/^[1-9]$/.test(key)) {
    const index = Number(key) - 1;
    return s.phase === "asking" && index < Math.min(4, s.current.options.length) ? { type: "pick", index } : null;
  }
  if (key === "Enter") return s.phase === "feedback" ? { type: "next" } : null;
  const k = key.toLowerCase();
  if (k === "s") return { type: "skip" };
  if (k === "h") return canHint(s) ? { type: "hint" } : null;
  return null;
}
