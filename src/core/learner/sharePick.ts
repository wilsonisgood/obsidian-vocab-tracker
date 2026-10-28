import type { VocabEntry } from "../model/entry";
import type { WordTouch } from "../model/learner";
import { liveTurns, type Thread } from "../model/thread";
import { noteTitle } from "../practice/paraphrase";
import { clip, PARAGRAPH_TEXT_MAX, plainParagraph } from "./recentDiscussions";

// 隨機分享最近讀的: the buddy picks one thing the learner read lately — a
// paragraph he discussed, a word he looked up or saved — and hands it over
// like a curious friend. Pure: the caller supplies the threads, entries,
// touches, clock and random source.

export const SHARE_DAYS = 14;
// Picks avoided for a while so the same thing doesn't come back at once.
export const SHARE_AVOID_RECENT = 5;
const DAY_MS = 86_400_000;
const MIN_PARAGRAPH_CHARS = 20;

export type ShareItem =
  | { kind: "paragraph"; key: string; title: string; text: string }
  | { kind: "word"; key: string; word: string; meaning?: string };

export interface ShareSources {
  threads: readonly Thread[];
  entries: readonly Pick<VocabEntry, "word" | "definitionZh" | "createdAt" | "deletedAt">[];
  touches: readonly Pick<WordTouch, "word" | "day" | "updatedAt">[];
  now: Date;
  days?: number;
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Everything readable from the last `days` days, one item per paragraph
// thread and per word (a word looked up and saved shows once).
export function collectShareItems(src: ShareSources): ShareItem[] {
  const since = src.now.getTime() - (src.days ?? SHARE_DAYS) * DAY_MS;
  const sinceDay = localDay(new Date(since));
  const items: ShareItem[] = [];

  for (const th of src.threads) {
    if (th.deletedAt || th.anchor.kind !== "paragraph") continue;
    const asked = liveTurns(th).some((turn) => turn.role === "user" && Date.parse(turn.at) >= since);
    if (!asked) continue;
    const text = clip(plainParagraph(th.anchor.snapshot), PARAGRAPH_TEXT_MAX);
    if ([...text].length < MIN_PARAGRAPH_CHARS) continue;
    items.push({ kind: "paragraph", key: `p:${th.id}`, title: noteTitle(th.anchor.path), text });
  }

  const meaningOf = new Map<string, string>();
  for (const e of src.entries) {
    if (e.deletedAt) continue;
    const zh = e.definitionZh?.trim();
    if (zh) meaningOf.set(e.word.trim().toLowerCase(), zh);
  }
  const seen = new Set<string>();
  const addWord = (raw: string) => {
    const word = raw.trim().toLowerCase();
    if (!word || seen.has(word)) return;
    seen.add(word);
    const meaning = meaningOf.get(word);
    items.push({ kind: "word", key: `w:${word}`, word, ...(meaning ? { meaning } : {}) });
  };
  for (const w of src.touches) if (w.day >= sinceDay) addWord(w.word);
  for (const e of src.entries) {
    if (e.deletedAt || !e.createdAt) continue;
    if (Date.parse(e.createdAt) >= since) addWord(e.word);
  }
  return items;
}

// null when there is nothing to pick. Items picked recently are skipped;
// when that would leave nothing, the whole pool is used again.
export function pickShare(items: readonly ShareItem[], recentKeys: readonly string[], random: () => number): ShareItem | null {
  if (!items.length) return null;
  const avoid = new Set(recentKeys.slice(-SHARE_AVOID_RECENT));
  const fresh = items.filter((i) => !avoid.has(i.key));
  const pool = fresh.length ? fresh : items;
  const i = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[i];
}

// Remembers a pick; only the newest SHARE_AVOID_RECENT stay.
export function rememberShare(recentKeys: readonly string[], key: string): string[] {
  return [...recentKeys.filter((k) => k !== key), key].slice(-SHARE_AVOID_RECENT);
}

// The text handed to the prompt; "" when nothing was picked.
export function shareBrief(item: ShareItem | null): string {
  if (!item) return "";
  if (item.kind === "word") return `單字：${item.word}${item.meaning ? `（${item.meaning}）` : ""}`;
  return `段落（出自「${item.title}」）：\n${item.text}`;
}
