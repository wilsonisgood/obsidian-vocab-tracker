import type { ReadingKind, ReadingVisit } from "../model/learner";

// Reading log helpers (第十九波 D1, 1016 #6-#8). Pure.

export const READING_KEEP_DAYS = 90;
const KIND_ORDER: readonly ReadingKind[] = ["word", "paragraph", "add"];

const pad = (n: number) => String(n).padStart(2, "0");

// Local calendar date, YYYY-MM-DD.
export function localDayOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Reading rows with a day before this are dropped (today − 90 days).
export function readingCutoffDay(nowMs: number): string {
  const d = new Date(nowMs);
  return localDayOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - READING_KEEP_DAYS));
}

export function readingId(day: string, path: string, heading?: string): string {
  return `${day}|${path}|${heading ?? ""}`;
}

// Lower-case, punctuation dropped, whitespace squeezed. A `|` separates parts
// (quote = 作者|句子) and survives; each part is normalized on its own.
export function normalizePickKey(raw: string): string {
  return raw
    .split("|")
    .map((part) =>
      part
        .toLowerCase()
        .replace(/[\p{P}\p{S}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .join("|");
}

export function sortKinds(kinds: Iterable<ReadingKind>): ReadingKind[] {
  const set = new Set(kinds);
  return KIND_ORDER.filter((k) => set.has(k));
}

export function basenameOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/\.md$/i, "");
}

// Title = first H1 (else `fallbackTitle`); heading = nearest H2/H3 at or above
// `line` (0-based; null or negative → none). `#` lines inside frontmatter or
// code fences don't count.
export function headingContext(
  text: string,
  line: number | null,
  fallbackTitle = ""
): { title: string; heading?: string } {
  const lines = text.split("\n");
  let i = 0;
  if (lines[0]?.trim() === "---") {
    let end = -1;
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === "---" || lines[j].trim() === "...") {
        end = j;
        break;
      }
    }
    if (end > 0) i = end + 1;
  }
  let title: string | undefined;
  let heading: string | undefined;
  let fence: string | null = null;
  for (; i < lines.length; i++) {
    const l = lines[i];
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(l);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h = /^ {0,3}(#{1,3})\s+(.*?)\s*#*\s*$/.exec(l);
    if (!h) continue;
    const text2 = h[2].trim();
    if (!text2) continue;
    if (h[1].length === 1) {
      if (title === undefined) title = text2;
    } else if (line !== null && line >= 0 && i <= line) {
      heading = text2;
    }
    if (title !== undefined && (line === null || line < 0 || i > line)) {
      // nothing more can change the answer
      break;
    }
  }
  const out: { title: string; heading?: string } = { title: title ?? fallbackTitle };
  if (heading) out.heading = heading;
  return out;
}

// Same id: kinds union, at earliest, updatedAt latest (title/path from the newer).
export function mergeVisit(a: ReadingVisit, b: ReadingVisit): ReadingVisit {
  const newer = Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
  return {
    ...newer,
    at: Date.parse(b.at) < Date.parse(a.at) ? b.at : a.at,
    updatedAt: Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b.updatedAt : a.updatedAt,
    kinds: sortKinds([...a.kinds, ...b.kinds]),
  };
}

export function mergeReading(local: readonly ReadingVisit[], remote: readonly ReadingVisit[]): ReadingVisit[] {
  const map = new Map<string, ReadingVisit>();
  for (const v of [...local, ...remote]) {
    const cur = map.get(v.id);
    map.set(v.id, cur ? mergeVisit(cur, v) : v);
  }
  return [...map.values()];
}
