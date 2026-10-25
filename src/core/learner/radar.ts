import type { ReportData } from "./report";

// 學習週報的多邊形圖 (第二十二波 R6): per-area *activity* (not skill), plus
// the plain geometry the `vocab-report-radar` block draws. Pure.

export interface RadarAxis {
  name: string;
  // 0–1, how much the learner did in this area.
  value: number;
  // false = not enough records to say anything about this area.
  clear: boolean;
  hint?: string;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function taskCount(data: ReportData, ...ids: string[]): number {
  return data.ai.byTask.filter((t) => ids.includes(t.key)).reduce((s, t) => s + t.count, 0);
}
function trackTotal(data: ReportData, track: string): number {
  return data.practice.tracks.find((t) => t.track === track)?.total ?? 0;
}

export function baselineAxes(data: ReportData): RadarAxis[] {
  const grammarQs = trackTotal(data, "grammar");
  const grammar = grammarQs + taskCount(data, "paragraph.grammar");
  const wordsDone = data.vocab.reviews + data.vocab.newSaved;
  const poly = trackTotal(data, "poly");
  const longSentence = taskCount(data, "paragraph.translate", "paragraph.grammar");
  const writing = taskCount(data, "buddy.review", "buddy.writing", "word.sentence");
  const axis = (name: string, count: number, target: number, ok: boolean, hint: string): RadarAxis => ({
    name,
    value: clamp01(count / target),
    clear: ok,
    ...(ok ? {} : { hint }),
  });
  return [
    axis("文法", grammar, 30, grammarQs >= 10, "做 10 題以上的文法練習，就能看出文法的程度"),
    axis("單字", wordsDone, 50, data.vocab.reviews >= 20, "複習 20 次以上的單字卡，就能看出單字的熟悉度"),
    axis("閱讀", data.activity.articles, 5, data.activity.articles >= 3, "讀 3 篇以上的文章（段落有互動才算）"),
    axis("多義字", poly, 20, poly >= 10, "做 10 題以上的多義字練習"),
    axis("長句理解", longSentence, 10, longSentence >= 5, "遇到長句時用「翻譯」或「文法解析」問 AI 5 次以上"),
    axis("寫作", writing, 6, writing >= 3, "用「造句」或「一起看看我寫的」寫 3 次以上"),
  ];
}

// ── Geometry ──

export interface RadarPoint {
  x: number;
  y: number;
}
export type RadarAnchor = "start" | "middle" | "end";
export interface RadarLabel extends RadarPoint {
  text: string;
  anchor: RadarAnchor;
  clear: boolean;
}
export interface RadarLayout {
  size: number;
  cx: number;
  cy: number;
  radius: number;
  // `points` attribute strings of the grid polygons, inner → outer.
  rings: string[];
  // Outer end of each axis line.
  spokes: (RadarPoint & { clear: boolean })[];
  // Data polygon's vertices and its `points` attribute.
  vertices: (RadarPoint & { clear: boolean })[];
  polygon: string;
  labels: RadarLabel[];
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const pts = (ps: RadarPoint[]) => ps.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ");

// Axis i of n, first one straight up, clockwise. r in px from the centre.
export function radarPoint(i: number, n: number, r: number, cx: number, cy: number): RadarPoint {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export function labelAnchor(i: number, n: number): RadarAnchor {
  const c = Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n);
  return c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
}

// `size` is the square viewBox side; the labels need room around the plot,
// so the radius is a bit under a third of it.
export function radarLayout(axes: readonly RadarAxis[], size = 300): RadarLayout {
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32;
  const ring = (f: number) => pts(axes.map((_, i) => radarPoint(i, n, radius * f, cx, cy)));
  const vertices = axes.map((a, i) => ({ ...radarPoint(i, n, radius * clamp01(a.value), cx, cy), clear: a.clear }));
  return {
    size,
    cx,
    cy,
    radius,
    rings: [ring(0.5), ring(1)],
    spokes: axes.map((a, i) => ({ ...radarPoint(i, n, radius, cx, cy), clear: a.clear })),
    vertices,
    polygon: pts(vertices),
    labels: axes.map((a, i) => {
      const anchor = labelAnchor(i, n);
      const p = radarPoint(i, n, radius + 14, cx, cy);
      // Labels at the top / bottom sit a little further out vertically.
      const dy = Math.abs(p.x - cx) < 1 ? (p.y < cy ? -2 : 10) : 4;
      return { x: p.x, y: p.y + dy, text: a.clear ? a.name : `${a.name}？`, anchor, clear: a.clear };
    }),
  };
}

// The block body: {"axes":[…]}. null when it can't be read or has < 3 axes.
export function parseRadarSource(source: string): RadarAxis[] | null {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    return null;
  }
  const raw = (json as { axes?: unknown } | null)?.axes;
  if (!Array.isArray(raw)) return null;
  const axes: RadarAxis[] = [];
  for (const a of raw) {
    if (typeof a !== "object" || a === null) continue;
    const r = a as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) continue;
    axes.push({
      name,
      value: clamp01(Number(r.value)),
      clear: r.clear !== false,
      ...(typeof r.hint === "string" && r.hint.trim() ? { hint: r.hint.trim() } : {}),
    });
  }
  return axes.length >= 3 ? axes : null;
}
