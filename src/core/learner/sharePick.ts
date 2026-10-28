import type { VocabEntry } from "../model/entry";
import type { WordTouch } from "../model/learner";
import { liveTurns, type ShareSource, type Thread } from "../model/thread";
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
  | { kind: "word"; key: string; word: string; meaning?: string; sourceTitle?: string; sourceParagraph?: string };

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

// Share of picks that go to a paragraph when both kinds are available.
export const PARAGRAPH_BIAS = 0.6;

// null when there is nothing to pick. Items picked recently are skipped
// (when that would leave nothing, the whole pool is used again). Words and
// paragraphs take turns: after a word comes a paragraph when there is one;
// otherwise a paragraph wins PARAGRAPH_BIAS of the time.
export function pickShare(
  items: readonly ShareItem[],
  recentKeys: readonly string[],
  random: () => number,
  lastKind?: ShareItem["kind"]
): ShareItem | null {
  if (!items.length) return null;
  const avoid = new Set(recentKeys.slice(-SHARE_AVOID_RECENT));
  const fresh = items.filter((i) => !avoid.has(i.key));
  const pool = fresh.length ? fresh : items;
  const paragraphs = pool.filter((i) => i.kind === "paragraph");
  const words = pool.filter((i) => i.kind === "word");
  let group = pool;
  if (paragraphs.length && words.length) {
    const wantParagraph = lastKind === "word" ? true : random() < PARAGRAPH_BIAS;
    group = wantParagraph ? paragraphs : words;
  }
  const i = Math.min(group.length - 1, Math.floor(random() * group.length));
  return group[i];
}

// ── 出題方式：每次換一種，不連續重複 ──

export interface ShareStyle {
  id: string;
  // Told to the model as this round's way of asking.
  text: string;
  scope: "both" | "word" | "paragraph";
}

export const SHARE_STYLES: readonly ShareStyle[] = [
  { id: "guess", scope: "both", text: "請他猜猜看，這個字（或這段）是什麼意思" },
  { id: "choice", scope: "both", text: "給兩個可能的意思讓他二選一（其中一個是對的，另一個是看起來像的干擾）" },
  { id: "scenario", scope: "both", text: "先描述一個生活情境，請他猜猜在這個情境裡它是什麼意思" },
  { id: "sentence", scope: "word", text: "請他用這個字造一個句子" },
  { id: "assoc", scope: "both", text: "問他看到這個字（或這段）會讓他想到什麼" },
  { id: "rephrase", scope: "paragraph", text: "請他用自己的話把這一段換句話說" },
  { id: "gist", scope: "paragraph", text: "請他用一句話說說這段在講什麼、作者想表達什麼" },
];

// 抓段落主旨 is the favorite: this share of paragraph rounds.
export const GIST_BIAS = 0.4;

export function pickShareStyle(kind: ShareItem["kind"], lastId: string | undefined, random: () => number): ShareStyle {
  const fit = SHARE_STYLES.filter((s) => s.scope === "both" || s.scope === kind);
  if (kind === "paragraph" && lastId !== "gist" && random() < GIST_BIAS) return fit.find((s) => s.id === "gist") as ShareStyle;
  const others = fit.filter((s) => s.id !== "gist");
  const pool = others.filter((s) => s.id !== lastId);
  const from = pool.length ? pool : others;
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))];
}

export interface WordSourceText {
  title: string;
  paragraph: string;
}

// Words that came from a note carry that paragraph (cleaned like the
// discussion summaries, clipped) so the buddy can ask in context.
export function attachWordSources(items: readonly ShareItem[], sourceOf: (word: string) => WordSourceText | null | undefined): ShareItem[] {
  return items.map((item) => {
    if (item.kind !== "word") return item;
    const src = sourceOf(item.word);
    const paragraph = src ? clip(plainParagraph(src.paragraph), PARAGRAPH_TEXT_MAX) : "";
    return paragraph ? { ...item, sourceTitle: src?.title, sourceParagraph: paragraph } : item;
  });
}

// What the prompt gets for the pick's origin; undefined without one.
export function shareSource(item: ShareItem | null): { sourceTitle: string; sourceParagraph: string } | undefined {
  if (item?.kind !== "word" || !item.sourceParagraph) return undefined;
  return { sourceTitle: item.sourceTitle ?? "", sourceParagraph: item.sourceParagraph };
}

// What a stored turn remembers of the pick: the word, or 〈note title〉.
export function shareSubject(item: ShareItem | null): string | undefined {
  if (!item) return undefined;
  return item.kind === "word" ? item.word : `〈${item.title}〉`;
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

// What the turn remembers of the pick, for the quote card.
export function shareSourceOf(item: ShareItem | null): ShareSource | undefined {
  if (!item) return undefined;
  if (item.kind === "paragraph") return { kind: "paragraph", title: item.title, text: item.text };
  return {
    kind: "word",
    word: item.word,
    ...(item.meaning ? { meaning: item.meaning } : {}),
    ...(item.sourceTitle ? { title: item.sourceTitle } : {}),
    ...(item.sourceParagraph ? { text: item.sourceParagraph } : {}),
  };
}

// ── quote card ──

export interface Segment {
  text: string;
  hit: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// `text` split so the word (any case, common endings: -s -ed -ing, a dropped
// final e or y) is marked. Irregular forms simply aren't found.
export function highlightWord(text: string, word: string): Segment[] {
  const w = word.trim();
  if (!w) return [{ text, hit: false }];
  const stem = w.length > 4 ? w.replace(/(?:e|y)$/i, "") : w;
  const re = new RegExp(`(?<![A-Za-z])${escapeRe(stem)}[A-Za-z]{0,4}(?![A-Za-z])`, "gi");
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), hit: false });
    out.push({ text: m[0], hit: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length ? out : [{ text, hit: false }];
}

export interface QuoteCard {
  // 「出自〈title〉」; null when there is no source.
  heading: string | null;
  // The paragraph with the picked word marked; [] for a word with no source.
  body: Segment[];
  // A word with no source paragraph: the word and its meaning.
  wordLine?: { word: string; meaning?: string };
}

export function quoteCard(src: ShareSource | undefined): QuoteCard | null {
  if (!src) return null;
  const title = src.title?.trim();
  const heading = title ? `出自〈${title}〉` : null;
  const text = src.text?.trim();
  if (src.kind === "paragraph") return text ? { heading, body: [{ text, hit: false }] } : null;
  const word = src.word?.trim();
  if (!word) return null;
  if (!text) return { heading: null, body: [], wordLine: { word, ...(src.meaning ? { meaning: src.meaning } : {}) } };
  return { heading, body: highlightWord(text, word) };
}
