import { topicById } from "../grammar/catalog";
import type { CefrLevel } from "../model/settings";
import { baselineLevels, type LevelEstimate } from "./levelEstimate";
import { baselineAxes, type RadarAxis } from "./radar";
import type { ReportData, LevelAdvice } from "./report";
import type { ReportAdvice } from "./reportAdvice";

// Report file text (規劃書 15 §4). Pure; Traditional Chinese is hard-coded.

export interface ReportMeta {
  key: string;
  // First report ever: the period runs from the earliest record (round 2 Q1).
  first?: boolean;
  // The AI's letter, levels, advice; absent → `aiNote` explains why.
  advice?: ReportAdvice;
  aiNote?: string;
  // Without `advice`: the rule-based fallbacks (default: computed from data).
  axes?: RadarAxis[];
  levels?: LevelEstimate[];
}

export const TASK_NAMES: Record<string, string> = {
  "paragraph.grammar": "文法解析",
  "paragraph.translate": "翻譯",
  "paragraph.vocab": "生字整理",
  "paragraph.paraphrase": "換句話說",
  "paragraph.custom": "段落自問",
  "word.usage": "用法",
  "word.compare": "比較",
  "word.sentence": "造句",
  "word.mnemonic": "記憶法",
  "word.custom": "單字自問",
};

export function taskName(id: string): string {
  if (id.startsWith("trivia.")) return "小知識";
  return TASK_NAMES[id] ?? id;
}

const TRACK_NAMES: Record<string, string> = { grammar: "文法", poly: "多義字", vocab: "單字", mix: "混合", para: "段落" };
const pct = (r: number) => `${Math.round(r * 100)}%`;

export function verdictHeadline(verdict: LevelAdvice["verdict"], suggestedLevel?: CefrLevel | string): string {
  switch (verdict) {
    case "up":
      return suggestedLevel ? `可以往上一級試試（建議 ${suggestedLevel}）` : "可以往上一級試試";
    case "down":
      return "建議先回頭補基礎";
    case "keep":
      return "維持目前程度";
    default:
      return "資料不夠，下期再看";
  }
}

function delta(cur: number, prev: number | null): string {
  if (prev === null || cur === prev) return "";
  return cur > prev ? ` ▲${cur - prev}` : ` ▼${prev - cur}`;
}
function deltaRate(cur: number, prev: number | null): string {
  if (prev === null) return "";
  const d = Math.round((cur - prev) * 100);
  return d === 0 ? "" : d > 0 ? ` ▲${d}%` : ` ▼${-d}%`;
}

function weakLabel(f: ReportData["practice"]["weak"][number]): string {
  if (f.focus.kind === "grammar-objective") {
    const t = topicById(f.focus.id.split("/")[0]);
    if (t) return t.title;
  }
  return f.focus.id;
}

function section(title: string, lines: string[]): string[] {
  return lines.length ? [`### ${title}`, ...lines, ""] : [];
}

export function reportTitle(meta: Pick<ReportMeta, "key" | "first">): string {
  return meta.first ? `# 到目前為止的你 · ${meta.key}` : `# 這週的你 · ${meta.key}`;
}

function numbers(data: ReportData): string[] {
  const out: string[] = [];
  const a = data.activity;
  out.push(...section("活躍", [`- 活躍 ${a.activeDays} 天，讀了 ${a.articles} 篇文章（${a.sections} 個段落）`]));

  const ai = data.ai;
  if (ai.total > 0) {
    const l = [`- 共 ${ai.total} 次${ai.prevTotal !== null ? `（上期 ${ai.prevTotal}${delta(ai.total, ai.prevTotal)}）` : ""}，其中自問 ${ai.custom} 次`];
    for (const t of ai.byTask) l.push(`- ${taskName(t.key)}：${t.count}`);
    if (ai.topWords.length) l.push(`- 最常問的字：${ai.topWords.map((w) => `${w.word}（${w.count}）`).join("、")}`);
    out.push(...section("AI 討論", l));
  }

  const w = data.words;
  const wl: string[] = [];
  if (w.lookups > 0) wl.push(`- 查字 ${w.lookups} 次`);
  if (w.repeated.length) wl.push(`- 反覆查：${w.repeated.map((x) => `${x.word}（${x.days} 天）`).join("、")}`);
  if (w.savedStillLooked.length) wl.push(`- 收藏卻還在查：${w.savedStillLooked.map((x) => `${x.word}（${x.lookups}）`).join("、")}`);
  if (w.mostPronounced.length) wl.push(`- 聽最多次：${w.mostPronounced.map((x) => `${x.word}（${x.pronounce}）`).join("、")}`);
  out.push(...section("查字／發音", wl));

  const v = data.vocab;
  const vl: string[] = [];
  if (v.newSaved > 0) vl.push(`- 新收藏 ${v.newSaved} 個字`);
  if (v.reviews > 0) {
    const rate = v.recallRate === null ? "" : `，記住率 ${pct(v.recallRate)}${deltaRate(v.recallRate, v.prevRecallRate)}`;
    vl.push(`- 複習 ${v.reviews} 次${rate}${v.avgSeconds !== null ? `，平均停留 ${v.avgSeconds} 秒` : ""}`);
  }
  out.push(...section("單字複習", vl));

  const pl: string[] = data.practice.tracks.map(
    (t) => `- ${TRACK_NAMES[t.track] ?? t.track}：${t.correct}/${t.total}（${pct(t.rate)}${t.prevRate !== null ? deltaRate(t.rate, t.prevRate) : ""}）`
  );
  out.push(...section("練習答對率", pl));
  if (data.practice.weak.length) {
    out.push(...section("弱點", data.practice.weak.map((f) => `- ${weakLabel(f)}（錯 ${f.wrong} 次）`)));
  }

  const gl: string[] = [];
  const bands = data.grammar.bands.filter((b) => b.total > 0 && b.rate !== null);
  if (data.grammar.mastered > 0) gl.push(`- 已精熟 ${data.grammar.mastered} 個文法主題`);
  for (const b of bands) gl.push(`- 難度 ${b.label}：${b.correct}/${b.total}（${pct(b.rate as number)}）`);
  out.push(...section("文法精熟", gl));

  if (data.tags.length) out.push(...section("考試標籤", [`- ${data.tags.map((t) => `${t.key}（${t.count}）`).join("、")}`]));
  return out;
}

export const RADAR_LANG = "vocab-report-radar";
const GREY = (text: string) => `<span style="color: gray">${text}</span>`;

// Every line of a callout starts with ">" (blank ones are a bare ">").
export function calloutLines(kind: string, fold: "+" | "-", title: string, body: readonly string[]): string[] {
  const trimmed = [...body];
  while (trimmed.length && trimmed[trimmed.length - 1] === "") trimmed.pop();
  return [`> [!${kind}]${fold} ${title}`, ...trimmed.map((l) => (l === "" ? ">" : `> ${l}`))];
}

const cell = (s: string) => s.replace(/\|/g, "／").replace(/\s*\n\s*/g, " ").trim();

function levelTable(levels: readonly LevelEstimate[]): string[] {
  const rows = levels.map((l) => {
    const detail = l.detail ? `（${l.detail}）` : "";
    const rough = l.rough ? "（粗估）" : "";
    return `| ${cell(l.area)} | ${cell(l.level)}${cell(detail)}${rough} | ${cell(l.basis)} |`;
  });
  return ["| 面向 | 程度 | 依據 |", "| --- | --- | --- |", ...rows];
}

export function radarFence(axes: readonly RadarAxis[]): string[] {
  const json = JSON.stringify({
    axes: axes.map((a) => ({ name: a.name, value: Math.round(a.value * 100) / 100, clear: a.clear, ...(a.hint ? { hint: a.hint } : {}) })),
  });
  return ["```" + RADAR_LANG, json, "```"];
}

export function renderReportFile(data: ReportData, meta: ReportMeta): string {
  const adv = data.advice;
  const fm = [
    "---",
    "vocab-tracker: report",
    `vocab-tracker-id: report-${meta.key}`,
    `period: ${data.period.from}~${data.period.to}`,
    `verdict: ${adv.verdict}`,
    ...(adv.suggestedLevel ? [`suggested-level: ${adv.suggestedLevel}`] : []),
    "---",
    "",
  ];
  const ai = meta.advice;
  const axes = ai?.axes ?? meta.axes ?? baselineAxes(data);
  const levels = ai?.levels ?? meta.levels ?? baselineLevels(data, "");
  const note = GREY(meta.aiNote ?? "AI 這次沒寫成功");

  const body: string[] = [reportTitle(meta), "", GREY(`${data.period.from} ～ ${data.period.to}`), ""];
  if (ai?.letter) body.push(ai.letter, "");

  // 現在的程度
  const now: string[] = [...radarFence(axes), "", ...levelTable(levels), "", "#### 程度建議", "", `**${verdictHeadline(adv.verdict, adv.suggestedLevel)}**`, ""];
  for (const s of adv.signals) now.push(`- ${s.reason}`);
  body.push(...calloutLines("abstract", "+", "現在的程度", now), "");

  // 接下來的建議
  const next: string[] = ["#### 照你的程度可以加強", ""];
  if (ai?.focus.length) next.push(...ai.focus.map((p) => `- ${p}`), "");
  else next.push(note, "");
  if (ai?.tryNext.length) next.push("#### 下週一起試試", "", ...ai.tryNext.map((p) => `- [ ] ${p}`), "");
  if (ai?.reading.length) next.push("#### 適合你的閱讀", "", ...ai.reading.map((p) => `- ${p}`), "");
  body.push(...calloutLines("tip", "+", "接下來的建議", next), "");

  const nums = numbers(data);
  body.push(...calloutLines("note", "-", "數字明細", nums.length ? nums : ["這週還沒有數字可以列。"]), "");
  // 詳細分析 buttons (第二十一波 R4); the analysis itself sits inside the callouts above.
  body.push(analyzeFence(meta.key), "");
  return [...fm, ...body].join("\n").replace(/\n+$/, "\n");
}

export const ANALYZE_LANG = "vocab-report-analyze";
export const ANALYSIS_HEADING = "## 詳細分析";

export function analyzeFence(key: string): string {
  return ["```" + ANALYZE_LANG, `key: ${key}`, "```"].join("\n");
}

export function removeFrontmatterField(text: string, key: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return text;
  const re = new RegExp(`^${key}:.*(?:\\r?\\n|$)`, "m");
  if (!re.test(m[1])) return text;
  const fm = m[1].replace(re, "").replace(/\r?\n$/, "");
  return text.slice(0, m.index) + `---\n${fm}\n---` + text.slice(m.index + m[0].length);
}

export function setFrontmatterField(text: string, key: string, value: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!m) return `---\n${key}: ${value}\n---\n\n${text}`;
  const re = new RegExp(`^${key}:.*$`, "m");
  const fm = re.test(m[1]) ? m[1].replace(re, `${key}: ${value}`) : `${m[1]}\n${key}: ${value}`;
  return text.slice(0, m.index) + `---\n${fm}\n---` + m[2] + text.slice(m.index + m[0].length);
}

export function renderReviewFile(key: string, period: { from: string; to: string }, body: string): string {
  const label = key.includes("Q") ? "季" : "月";
  return [
    "---",
    "vocab-tracker: report",
    `vocab-tracker-id: review-${key}`,
    `period: ${period.from}~${period.to}`,
    "---",
    "",
    `# 學習回顧 ${key}（${period.from} ～ ${period.to}，這${label}）`,
    "",
    body.trim(),
    "",
  ].join("\n");
}

// Plain-text summary for the advice prompt. Numbers only: no article text,
// no free-typed questions (ReportData holds none).
export function reportDigest(data: ReportData): string {
  const L: string[] = [`期間：${data.period.from} ～ ${data.period.to}`];
  const a = data.activity;
  L.push(`活躍 ${a.activeDays} 天，讀 ${a.articles} 篇文章`);
  if (data.ai.total) L.push(`AI 討論 ${data.ai.total} 次：${data.ai.byTask.map((t) => `${taskName(t.key)} ${t.count}`).join("、")}`);
  const w = data.words;
  if (w.lookups) L.push(`查字 ${w.lookups} 次`);
  if (w.repeated.length) L.push(`反覆查的字：${w.repeated.map((x) => x.word).join("、")}`);
  if (w.savedStillLooked.length) L.push(`收藏卻還在查：${w.savedStillLooked.map((x) => x.word).join("、")}`);
  const v = data.vocab;
  if (v.reviews) L.push(`單字複習 ${v.reviews} 次，記住率 ${v.recallRate === null ? "-" : pct(v.recallRate)}`);
  if (v.newSaved) L.push(`新收藏 ${v.newSaved} 個字`);
  for (const t of data.practice.tracks) L.push(`${TRACK_NAMES[t.track] ?? t.track}練習答對率 ${pct(t.rate)}（${t.total} 題）`);
  if (data.practice.weak.length) L.push(`弱點：${data.practice.weak.map(weakLabel).join("、")}`);
  if (data.grammar.mastered) L.push(`文法已精熟 ${data.grammar.mastered} 個主題`);
  if (data.tags.length) L.push(`考試標籤：${data.tags.map((t) => t.key).join("、")}`);
  L.push(`程度判斷：${verdictHeadline(data.advice.verdict, data.advice.suggestedLevel)}`);
  for (const s of data.advice.signals) L.push(`- ${s.reason}`);
  return L.join("\n");
}
