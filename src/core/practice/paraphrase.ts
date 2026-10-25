import { splitSentences } from "../grammar/sentences";
import type { Thread } from "../model/thread";

// 換句話說 (paragraph paraphrase practice): pure helpers that turn the
// learner's paragraph discussions into what the AI writes questions from —
// the paragraph's sentences and the spots the learner asked about.

export const PARA_MIN_WORDS = 6;
export const PARA_MAX_WORDS = 60;
export const MAX_PARA_SENTENCES = 12;
export const MAX_DISCUSSED = 8;
const MAX_POINT_CHARS = 80;

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;
const CJK_RE = /[぀-ヿ㐀-鿿가-힯]/g;

export interface ParagraphRef {
  // The paragraph discussion's thread id (the questions' focus id).
  threadId: string;
  path: string;
  // The note's name, for 「段落 · <title>」 and the prompt.
  title: string;
  // The paragraph's usable English sentences, in order.
  sentences: string[];
  // 〔討論過的地方〕: highlighted text and questions from the discussion.
  discussed: string[];
}

// A sentence worth paraphrasing: 6–60 English words, mostly English.
export function isParaphrasable(s: string): boolean {
  const n = (s.match(WORD_RE) ?? []).length;
  if (n < PARA_MIN_WORDS || n > PARA_MAX_WORDS) return false;
  return (s.match(CJK_RE) ?? []).length <= s.length * 0.1;
}

export function paragraphSentences(snapshot: string): string[] {
  return splitSentences(snapshot).filter(isParaphrasable).slice(0, MAX_PARA_SENTENCES);
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const cut = (s: string) => (s.length > MAX_POINT_CHARS ? `${s.slice(0, MAX_POINT_CHARS - 1).trimEnd()}…` : s);

// What the learner asked about in the discussion: each live question turn's
// highlighted text and typed question (quick actions without either add
// nothing), newest first, deduplicated.
export function discussedPoints(thread: Thread): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const turns = thread.turns.filter((t) => t.role === "user" && !t.deletedAt);
  for (let i = turns.length - 1; i >= 0 && out.length < MAX_DISCUSSED; i--) {
    const sel = cut(flat(turns[i].selection ?? ""));
    const q = cut(flat(turns[i].question ?? ""));
    const line = sel && q ? `「${sel}」｜${q}` : sel ? `「${sel}」` : q;
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    out.push(line);
  }
  return out;
}

export function noteTitle(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

// A discussion as a ParagraphRef; null when it isn't a paragraph discussion
// or its paragraph has no sentence to ask about.
export function paragraphRef(thread: Thread): ParagraphRef | null {
  if (thread.deletedAt || thread.anchor.kind !== "paragraph") return null;
  const sentences = paragraphSentences(thread.anchor.snapshot);
  if (!sentences.length) return null;
  const path = thread.anchor.path;
  return { threadId: thread.id, path, title: noteTitle(path), sentences, discussed: discussedPoints(thread) };
}

// ── 出題範圍 (the tab's filter, synced through the learner shard) ─────

export type ParaFilter = { scope: "all" } | { scope: "note"; path: string } | { scope: "thread"; threadId: string };

export function parseParaFilter(raw: unknown): ParaFilter {
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    if (r.scope === "note" && typeof r.path === "string" && r.path) return { scope: "note", path: r.path };
    if (r.scope === "thread" && typeof r.threadId === "string" && r.threadId) {
      return { scope: "thread", threadId: r.threadId };
    }
  }
  return { scope: "all" };
}

const lastTouched = (th: Thread): string => {
  let at = th.updatedAt ?? th.createdAt ?? "";
  for (const t of th.turns) if (!t.deletedAt && t.at > at) at = t.at;
  return at;
};

// The paragraphs the filter covers, most recently discussed first. A filter
// naming a note or thread that's gone covers nothing (the tab falls back).
export function paragraphsInFilter(threads: readonly Thread[], filter: ParaFilter): ParagraphRef[] {
  const picked = threads.filter((th) => {
    if (th.deletedAt || th.anchor.kind !== "paragraph") return false;
    if (filter.scope === "note") return th.anchor.path === filter.path;
    if (filter.scope === "thread") return th.id === filter.threadId;
    return true;
  });
  return [...picked]
    .sort((a, b) => lastTouched(b).localeCompare(lastTouched(a)))
    .map(paragraphRef)
    .filter((r): r is ParagraphRef => r !== null);
}

export interface ParaScopeOption {
  filter: ParaFilter;
  // "all" / the note path / the thread id.
  key: string;
  title: string;
  count: number;
}

// The 出題範圍 dropdown: everything, then each note with paragraphs to ask
// about (most paragraphs first). A thread filter shows as its own option.
export function paraScopeOptions(threads: readonly Thread[]): { all: number; notes: ParaScopeOption[] } {
  const refs = paragraphsInFilter(threads, { scope: "all" });
  const byPath = new Map<string, number>();
  for (const r of refs) byPath.set(r.path, (byPath.get(r.path) ?? 0) + 1);
  const notes = [...byPath.entries()]
    .map(([path, count]): ParaScopeOption => ({ filter: { scope: "note", path }, key: path, title: noteTitle(path), count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  return { all: refs.length, notes };
}

export function filterKey(f: ParaFilter): string {
  return f.scope === "all" ? "all" : f.scope === "note" ? `note:${f.path}` : `thread:${f.threadId}`;
}

// The next paragraph to ask about: the one with the fewest questions so far;
// ties go to the more recently discussed one (refs come in that order).
export function nextParagraph(refs: readonly ParagraphRef[], asked: (threadId: string) => number): ParagraphRef | undefined {
  let best: ParagraphRef | undefined;
  let bestN = Infinity;
  for (const r of refs) {
    const n = asked(r.threadId);
    if (n < bestN) {
      best = r;
      bestN = n;
    }
  }
  return best;
}

export function excerpt(text: string, max = 40): string {
  const s = flat(text);
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
