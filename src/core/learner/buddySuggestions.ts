import { liveTurns, type Thread } from "../model/thread";

// 〔接著聊〕話題一｜話題二｜話題三 — the last line of a buddy answer: three
// light follow-up topics the quick buttons can offer. Pure.

export const SUGGESTION_MARK = "〔接著聊〕";
export const SUGGESTION_MAX_CHARS = 14;
const MAX_SUGGESTIONS = 3;

// The marker line and everything after it (the model puts it last).
const LINE_RE = /(?:^|\n)[ \t]*〔接著聊〕[^\n]*(?:\n[\s\S]*)?$/;

export function parseSuggestions(text: string): string[] {
  const m = /〔接著聊〕([^\n]*)/.exec(text);
  if (!m) return [];
  const out: string[] = [];
  for (const raw of m[1].split(/[｜|]/)) {
    const s = raw.trim().replace(/^[\s\-•\d.、]+/, "").trim();
    if (!s || [...s].length > SUGGESTION_MAX_CHARS * 2 || out.includes(s)) continue;
    out.push(s);
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

// The answer without its suggestion line. While streaming, a half-written
// marker ("〔接", "〔接著聊〕話題") at the very end is hidden too.
export function stripSuggestions(text: string): string {
  if (!text.includes("〔")) return text;
  let out = text.replace(LINE_RE, "");
  const tail = /(?:^|\n)[ \t]*(〔(?:接(?:著(?:聊)?)?)?)$/.exec(out);
  if (tail) out = out.slice(0, out.length - tail[0].length);
  return out === text ? text : out.replace(/\s+$/, "");
}

// The newest finished answer's suggestions; [] when it has none.
export function latestSuggestions(thread: Thread | undefined): string[] {
  const turns = liveTurns(thread);
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.role !== "assistant") continue;
    return t.status === "done" ? (t.suggestions ?? []) : [];
  }
  return [];
}

// Two of `pool` at random, never the same pair as `previous` twice in a row
// (when the pool allows). `random` in [0,1).
export function pickTwo(pool: readonly string[], previous: readonly string[], random: () => number): string[] {
  if (pool.length <= 2) return [...pool];
  const same = (a: readonly string[]) => a.length === previous.length && a.every((x) => previous.includes(x));
  for (let tries = 0; tries < 8; tries++) {
    const rest = [...pool];
    const pick: string[] = [];
    for (let k = 0; k < 2; k++) pick.push(rest.splice(Math.min(rest.length - 1, Math.floor(random() * rest.length)), 1)[0]);
    if (!same(pick)) return pick;
  }
  // Unlucky randomness: shift to the next pair.
  const i = pool.indexOf(previous[0]);
  return [pool[(i + 1) % pool.length], pool[(i + 2) % pool.length]];
}
