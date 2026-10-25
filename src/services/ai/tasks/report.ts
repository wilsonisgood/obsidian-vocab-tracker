import type { LevelEstimate } from "../../../core/learner/levelEstimate";
import type { RadarAxis } from "../../../core/learner/radar";
import type { ReportAdvice } from "../../../core/learner/reportAdvice";
import type { CefrLevel } from "../../../core/model/settings";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { profileForTask } from "./length";
import { WARM_TONE } from "./tone";
import type { AiTask, TaskContext } from "./types";

// Report advice (規劃書 15 §4; 第二十二波 R6 turns it into a letter plus
// per-area levels). One call per report; the input is a numbers digest and
// the titles of what was read — never article text.

export interface ReportAdviceInput {
  digest: string;
  level: CefrLevel | "";
  // Rule-based activity axes / rough levels the AI may keep, rename or drop.
  baseline: RadarAxis[];
  baselineLevels: LevelEstimate[];
  // Titles of notes read in the period and the 30 days before, ≤ 30.
  readingTitles: string[];
}

export const REPORT_ADVICE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["letter", "axes", "levels", "focus", "tryNext", "reading"],
  properties: {
    letter: { type: "string" },
    axes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "value", "clear", "hint"],
        properties: {
          name: { type: "string" },
          value: { type: "number", description: "0 到 1 的活躍度" },
          clear: { type: "boolean", description: "false = 紀錄不夠，看不出來" },
          hint: { type: "string", description: "clear 為 false 時，具體可以做的事；否則空字串" },
        },
      },
    },
    levels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "level", "detail", "basis"],
        properties: {
          area: { type: "string" },
          level: { type: "string", description: "例如「約 B1」「A2–B1」「還看不出來」" },
          detail: { type: "string", description: "例如「估 2,000–2,500 字」；沒有就空字串" },
          basis: { type: "string", description: "一句具體的依據" },
        },
      },
    },
    focus: { type: "array", items: { type: "string" } },
    tryNext: { type: "array", items: { type: "string" } },
    reading: { type: "array", items: { type: "string" } },
  },
};

export const REPORT_BASE_PROMPT = `你是學生的英文學習夥伴，根據他這段期間的學習數據，寫一封信給他，並替他的各個面向推估程度、給下週的具體建議。

${WARM_TONE}

請輸出符合 schema 的 JSON，欄位如下，全部用繁體中文（英文單字、關鍵字除外）：

1. axes（多邊形圖的面向，共 4 到 7 個）：
   - 可以沿用〔活躍度基準〕的面向、改名、刪掉，也可以依證據新增面向（發音、聽力、片語、時態…）。
   - value 是 0 到 1 的「活躍度」（這段期間做了多少），不是程度高低。
   - 沒有證據的面向 clear 設 false，並在 hint 寫一個具體可以做的事；clear 為 true 時 hint 給空字串。不要編造。
2. levels（各面向的程度推估）：
   - 一定要列：字彙量、文法全面性、多義字熟悉度；其他面向依證據增減（長句理解、寫作、閱讀…）。
   - level 用 CEFR（可以寫區間，例如「約 B1」「A2–B1」）；字彙量的 detail 附估計字數區間（例如「估 2,000–2,500 字」），其他面向 detail 給空字串。
   - 沒有證據就寫「還看不出來」，不要硬猜；basis 用一句話說明具體依據（引用數字或自述程度）。
3. focus（照你的程度可以加強，3 到 6 條）：依各面向推估的程度，點名該程度該補的具體文法點或技巧，並說怎麼練。例：B1 的現在完成式和過去式怎麼分、長句拆解先找主要動詞再括出子句。每條一兩句，可以直接照做。
4. tryNext（下週一起試試，3 到 5 條）：可以勾選完成的小任務，至少一條用來試探「還看不出來」的面向。
5. reading（適合你的閱讀，2 到 3 條）：依〔讀過的筆記標題〕推測他的興趣和文章類型，給「方向＋可以直接搜尋的關鍵字」，例如「TED 教育類、語速較慢的講者，搜尋：TED-Ed ___」。不要點名具體的文章或演講標題；沒有標題可參考時，依程度給通用方向。
6. letter（信）：2 到 4 句，一段，像朋友說話；說看到的進步或困難，和下週最值得做的一件事。不要重複列數字。

只根據資料寫，不要編造資料裡沒有的事。`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strings = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : [];

export const MIN_AXES = 3;
export const MAX_AXES = 7;

// What the model said, cleaned up. `axes` / `levels` may come back empty or
// too short — resolveAdvice() swaps in the baselines for those.
export function parseReportAdvice(json: unknown): ReportAdvice {
  const o = isObj(json) ? json : {};
  const axes: RadarAxis[] = [];
  for (const a of Array.isArray(o.axes) ? o.axes : []) {
    if (!isObj(a)) continue;
    const name = str(a.name);
    if (!name) continue;
    const n = Number(a.value);
    const value = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
    const hint = str(a.hint);
    axes.push({ name, value, clear: typeof a.clear === "boolean" ? a.clear : true, ...(hint ? { hint } : {}) });
    if (axes.length === MAX_AXES) break;
  }
  const levels: LevelEstimate[] = [];
  for (const l of Array.isArray(o.levels) ? o.levels : []) {
    if (!isObj(l)) continue;
    const area = str(l.area);
    const level = str(l.level);
    if (!area || !level) continue;
    const detail = str(l.detail);
    levels.push({ area, level, ...(detail ? { detail } : {}), basis: str(l.basis) });
  }
  return { letter: str(o.letter), axes, levels, focus: strings(o.focus, 6), tryNext: strings(o.tryNext, 5), reading: strings(o.reading, 3) };
}

// Fewer than 3 axes can't draw a polygon, no levels is no table: fall back.
export function resolveAdvice(draft: ReportAdvice, baseline: RadarAxis[], baselineLevels: LevelEstimate[]): ReportAdvice {
  return {
    ...draft,
    axes: draft.axes.length >= MIN_AXES ? draft.axes : baseline,
    levels: draft.levels.length ? draft.levels : baselineLevels,
  };
}

// Nothing usable at all → treat the call as failed.
export function isEmptyAdvice(a: ReportAdvice): boolean {
  return !a.letter && !a.focus.length && !a.tryNext.length && !a.reading.length;
}

function userMessage(input: ReportAdviceInput): string {
  const axes = input.baseline.map((a) => `- ${a.name}：活躍度 ${a.value.toFixed(2)}，${a.clear ? "有足夠紀錄" : "紀錄不夠"}`).join("\n");
  const levels = input.baselineLevels
    .map((l) => `- ${l.area}：${l.level}${l.detail ? `（${l.detail}）` : ""}｜${l.basis}${l.rough ? "（規則粗估）" : ""}`)
    .join("\n");
  const titles = input.readingTitles.length ? input.readingTitles.map((t) => `- ${t}`).join("\n") : "（這段期間沒有閱讀紀錄）";
  return [
    `〔自述的 CEFR 程度〕${input.level || "未指定"}`,
    `〔學習數據〕\n${input.digest}`,
    `〔活躍度基準〕\n${axes}`,
    `〔程度粗估（規則算的，僅供參考）〕\n${levels}`,
    `〔讀過的筆記標題〕\n${titles}`,
  ].join("\n\n");
}

export const reportAdvise: AiTask<ReportAdviceInput, ReportAdvice> = {
  id: "report.advise",
  version: 3,
  surface: "report",
  tier: "smart",
  maxTokens: 6144,
  answerChars: () => 0,
  build(input: ReportAdviceInput, ctx: TaskContext) {
    return composeRequest({
      base: REPORT_BASE_PROMPT,
      profile: profileForTask(ctx.profile, reportAdvise, input),
      history: [],
      user: userMessage(input),
      tier: "smart",
      maxTokens: 6144,
      output: { name: "report_advice", schema: REPORT_ADVICE_SCHEMA },
    });
  },
  parse(r: AiResult): ReportAdvice {
    return parseReportAdvice(structuredJson(r));
  },
};
