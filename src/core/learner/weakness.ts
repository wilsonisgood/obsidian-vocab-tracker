import type { FocusRef, LearnEvent, Track } from "../model/learner";

// Weak spots, computed from events (規劃書 12 §1). Score of a focus = sum of
// exp(-daysAgo / 14) over its wrong answers, minus 0.5 for every correct
// answer after the last wrong one. Only focuses scoring above 0 are weak.

const DAY_MS = 86_400_000;
const HALF_LIFE_DAYS = 14;
const CORRECT_RELIEF = 0.5;

export interface WeakFocus {
  focus: FocusRef;
  track: Track;
  wrong: number;
  lastWrongAt: string;
  commonGiven?: string;
}

export function weakFocuses(
  events: readonly LearnEvent[],
  opts: { now: Date; track?: Track; scope?: ReadonlySet<string>; days?: number; limit?: number }
): WeakFocus[] {
  const nowMs = opts.now.getTime();
  const since = nowMs - (opts.days ?? 30) * DAY_MS;
  const limit = opts.limit ?? 8;

  const inWindow = events
    .filter((e) => {
      if (e.result !== "correct" && e.result !== "wrong") return false;
      if (opts.track && e.track !== opts.track) return false;
      if (opts.scope && !opts.scope.has(e.focus.id)) return false;
      const t = Date.parse(e.at);
      return !Number.isNaN(t) && t >= since;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  interface Acc {
    focus: FocusRef;
    track: Track;
    score: number;
    wrong: number;
    lastWrongAt: string;
    correctSince: number;
    given: Map<string, number>;
  }
  const byFocus = new Map<string, Acc>();
  for (const e of inWindow) {
    const key = `${e.focus.kind}:${e.focus.id}`;
    let acc = byFocus.get(key);
    if (!acc) {
      acc = { focus: e.focus, track: e.track, score: 0, wrong: 0, lastWrongAt: "", correctSince: 0, given: new Map() };
      byFocus.set(key, acc);
    }
    if (e.result === "wrong") {
      const days = Math.max(0, (nowMs - Date.parse(e.at)) / DAY_MS);
      acc.score += Math.exp(-days / HALF_LIFE_DAYS);
      acc.wrong++;
      acc.lastWrongAt = e.at;
      acc.track = e.track;
      acc.correctSince = 0;
      if (e.given) acc.given.set(e.given, (acc.given.get(e.given) ?? 0) + 1);
    } else {
      acc.correctSince++;
    }
  }

  const out: (WeakFocus & { score: number })[] = [];
  for (const acc of byFocus.values()) {
    if (acc.wrong === 0) continue;
    const score = acc.score - CORRECT_RELIEF * acc.correctSince;
    if (score <= 0) continue;
    let common: string | undefined;
    let best = 1;
    for (const [g, n] of acc.given) {
      if (n > best) {
        best = n;
        common = g;
      }
    }
    const w: WeakFocus & { score: number } = {
      focus: acc.focus,
      track: acc.track,
      wrong: acc.wrong,
      lastWrongAt: acc.lastWrongAt,
      score,
    };
    if (common !== undefined) w.commonGiven = common;
    out.push(w);
  }
  out.sort((a, b) => b.score - a.score || (a.lastWrongAt < b.lastWrongAt ? 1 : a.lastWrongAt > b.lastWrongAt ? -1 : 0));
  return out.slice(0, limit).map(({ score: _s, ...w }) => w);
}

function mmdd(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// One line per weak focus, for the AI's 〔學習弱點〕 block.
export function weaknessDigest(weak: readonly WeakFocus[], label?: (f: FocusRef) => string): string {
  return weak
    .map((w) => {
      const head = `${label ? label(w.focus) : w.focus.id}｜錯 ${w.wrong} 次（最近 ${mmdd(w.lastWrongAt)}）`;
      return w.commonGiven ? `${head}｜常選成 ${w.commonGiven}` : head;
    })
    .join("\n");
}
