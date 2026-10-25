import type { LearnEvent } from "../model/learner";
import { pairTurns, type Thread } from "../model/thread";
import { localDayOf } from "./reading";
import { taskName } from "./reportMarkdown";
import type { CefrLevel } from "../model/settings";

// Material for report.analyze (第二十一波 R4, 規劃書 15 §6): every AI
// discussion round of the period (tombstones included), the wrong practice
// answers, the word touches and the report digest. Pure; the service
// supplies the lookups.

export const MATERIAL_MAX_CHARS = 60_000;
export const ANSWER_MAX = 800;
export const SNAPSHOT_MAX = 500;
export const WRONG_MAX = 60;
export const WORDS_MAX = 20;

export interface WordLists {
  repeated: readonly { word: string; days: number; lookups: number }[];
  savedStillLooked: readonly { word: string; lookups: number }[];
  mostPronounced: readonly { word: string; pronounce: number }[];
}

export interface AnalysisInput {
  period: { from: string; to: string };
  threads: readonly Thread[];
  events: readonly LearnEvent[];
  // questionId → the question, when it can still be found.
  questionOf?: (id: string) => { prompt: string; answer: string } | undefined;
  // entryId → "word（中文意思）" for word discussions.
  entryLabel?: (entryId: string) => string | undefined;
  words: WordLists;
  digest: string;
  level: CefrLevel | "";
}

export interface AnalysisMaterial {
  text: string;
  rounds: number;
  totalRounds: number;
}

const cut = (s: string, n: number): string => {
  const a = [...s];
  return a.length > n ? a.slice(0, n).join("") + "…" : s;
};
const inPeriod = (iso: string, p: { from: string; to: string }): boolean => {
  const d = localDayOf(new Date(iso));
  return d >= p.from && d <= p.to;
};

interface Round {
  at: string;
  text: string;
}

function subjectOf(th: Thread, label: (id: string) => string | undefined, topic: string): string {
  const a = th.anchor;
  if (a.kind === "word") return label(a.entryId) ?? a.entryId;
  if (a.kind === "paragraph") return cut(a.snapshot.trim(), SNAPSHOT_MAX);
  return topic;
}

function roundsOf(input: AnalysisInput): Round[] {
  const out: Round[] = [];
  const label = input.entryLabel ?? (() => undefined);
  for (const th of input.threads) {
    for (const pair of pairTurns(th.turns)) {
      const u = pair.user;
      if (!inPeriod(u.at, input.period)) continue;
      const question = (u.question ?? u.content ?? "").trim();
      const topic = question || u.selection?.trim() || "";
      const deleted = !!(u.deletedAt || pair.assistant?.deletedAt);
      const head = `類型：${taskName(u.taskId ?? "")}｜對象：${subjectOf(th, label, cut(topic, 80))}${deleted ? "（已刪除）" : ""}`;
      const lines = [head];
      if (u.selection?.trim()) lines.push(`選取文字：${u.selection.trim()}`);
      lines.push(`你的問題：${question || "（無）"}`);
      lines.push(`AI 回答：${pair.assistant?.content ? cut(pair.assistant.content.trim(), ANSWER_MAX) : "（沒有回答）"}`);
      out.push({ at: u.at, text: lines.join("\n") });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

function wrongSection(input: AnalysisInput): string {
  const wrong = input.events
    .filter((e) => e.result === "wrong" && inPeriod(e.at, input.period))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .slice(-WRONG_MAX);
  if (!wrong.length) return "";
  const lines = wrong.map((e) => {
    const q = e.questionId ? input.questionOf?.(e.questionId) : undefined;
    const parts = [q ? `題目：${q.prompt}` : `題目：（查不到）${e.focus.id}`];
    if (e.given) parts.push(`你選的：${e.given}`);
    if (q) parts.push(`正確答案：${q.answer}`);
    if (e.errorTag) parts.push(`錯誤類型：${e.errorTag}`);
    return `- ${parts.join("｜")}`;
  });
  return `## 練習錯題（最近 ${wrong.length} 題）\n${lines.join("\n")}`;
}

function wordsSection(w: WordLists): string {
  const l: string[] = [];
  if (w.repeated.length) l.push(`- 反覆查：${w.repeated.slice(0, WORDS_MAX).map((x) => `${x.word}（${x.days} 天）`).join("、")}`);
  if (w.savedStillLooked.length) l.push(`- 收藏卻還在查：${w.savedStillLooked.slice(0, WORDS_MAX).map((x) => `${x.word}（${x.lookups}）`).join("、")}`);
  if (w.mostPronounced.length) l.push(`- 聽最多次：${w.mostPronounced.slice(0, WORDS_MAX).map((x) => `${x.word}（${x.pronounce}）`).join("、")}`);
  return l.length ? `## 查字／發音\n${l.join("\n")}` : "";
}

export function collectAnalysisMaterial(input: AnalysisInput): AnalysisMaterial {
  const rounds = roundsOf(input);
  const fixed = [
    `〔自述程度〕${input.level || "未指定"}`,
    `## 這期報告摘要\n${input.digest}`,
    wrongSection(input),
    wordsSection(input.words),
  ].filter(Boolean);
  const fixedLen = fixed.join("\n\n").length;

  // Keep the newest rounds that fit; the oldest are dropped first.
  const kept: string[] = [];
  let used = fixedLen + 200; // room for the heading and the truncation note
  for (let i = rounds.length - 1; i >= 0; i--) {
    const len = rounds[i].text.length + 20;
    if (used + len > MATERIAL_MAX_CHARS) break;
    used += len;
    kept.unshift(rounds[i].text);
  }
  const numbered = kept.map((t, i) => `【第 ${i + 1} 輪】${t}`);
  const sections: string[] = [];
  if (kept.length < rounds.length) sections.push(`（只附上最近 ${kept.length} 輪討論，共 ${rounds.length} 輪）`);
  sections.push(fixed[0], fixed[1]);
  sections.push(numbered.length ? `## AI 討論（${kept.length} 輪）\n\n${numbered.join("\n\n")}` : "## AI 討論\n這段期間沒有 AI 討論。");
  sections.push(...fixed.slice(2));
  return { text: sections.join("\n\n"), rounds: kept.length, totalRounds: rounds.length };
}


// ── Month / quarter review material ──────────────────────────────────────

export const REVIEW_WEEK_MAX = 800;
const REVIEW_SECTIONS = ["程度建議", "給你的建議", "詳細分析"] as const;
const MARKER_LINE = /^[ \t]*%%[ \t]*vt:(?:begin|end)[ \t]+[a-z0-9-]+[ \t]*%%[ \t]*$/;

// The body of "## <title>" (up to the next "## " heading), managed-block
// markers and the placeholder grey span removed. "" when absent.
export function extractReportSection(text: string, title: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${title}`);
  if (start < 0) return "";
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    // The analyze button block closes the file; it isn't prose.
    if (/^```vocab-report-analyze/.test(lines[i])) break;
    if (MARKER_LINE.test(lines[i])) continue;
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

export interface ReviewWeek {
  key: string;
  text: string;
}

export function collectReviewMaterial(weeks: readonly ReviewWeek[]): { text: string; weeks: number; truncated: boolean } {
  const sorted = [...weeks].sort((a, b) => (a.key < b.key ? -1 : 1));
  const parts = sorted.map((w) => {
    const sec = Object.fromEntries(REVIEW_SECTIONS.map((n) => [n, extractReportSection(w.text, n)])) as Record<(typeof REVIEW_SECTIONS)[number], string>;
    return { key: w.key, sec };
  });
  const render = (p: (typeof parts)[number], order: readonly (typeof REVIEW_SECTIONS)[number][], limit?: number): string => {
    const body = order
      .filter((n) => p.sec[n])
      .map((n) => `【${n}】\n${p.sec[n]}`)
      .join("\n\n");
    return `# 週報 ${p.key}\n${limit ? cut(body, limit) : body}`;
  };
  const full = parts.map((p) => render(p, REVIEW_SECTIONS)).join("\n\n");
  if ([...full].length <= MATERIAL_MAX_CHARS) return { text: full, weeks: parts.length, truncated: false };
  // Too long: 800 characters per week, the detailed analysis first.
  const short = parts.map((p) => render(p, ["詳細分析", "給你的建議", "程度建議"], REVIEW_WEEK_MAX)).join("\n\n");
  return { text: short, weeks: parts.length, truncated: true };
}
