import type { CefrLevel } from "../../../core/model/settings";
import { AiError } from "../errors";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { profileForTask } from "./length";
import { WARM_TONE } from "./tone";
import type { AiTask, TaskContext } from "./types";

// Detailed analysis of one report period (第二十一波 R4, 規劃書 15 §6).
// Unlike report.advise, the input carries the learner's own questions and
// the AI's answers, so the analysis can quote real examples. 第二十二波:
// two halves, written into the two callouts of the report.

export interface ReportAnalyzeInput {
  material: string;
  level: CefrLevel | "";
}

export interface ReportAnalysis {
  // 現況: what they ask, blind spots, grammar, words, level.
  now: string;
  // 四週方向.
  next: string;
}

export const REPORT_ANALYZE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["now", "next"],
  properties: {
    now: { type: "string", description: "現況分析，Markdown" },
    next: { type: "string", description: "接下來四週的方向，Markdown" },
  },
};

export const REPORT_ANALYZE_PROMPT = `你是學生的英文學習夥伴。下面是他這段期間的學習材料：和 AI 討論過的問答、練習答錯的題目、反覆查的字，以及這期報告的數字摘要。請替他做一份詳細分析，分成兩段輸出成 JSON：now 和 next。

${WARM_TONE}

用繁體中文、Markdown 寫，小標請用單獨一行的粗體（例如「**你常問什麼**」），不要用 # 開頭的標題。

now（現況）依序寫這五個小標：
**你常問什麼**
**反覆出現的觀念盲點**
**文法**
**單字與用法**
**程度判斷**

next（四週方向）依他的程度分成第 1～4 週，每週一兩件具體做得到的事，要點名文法點或練法（例如該怎麼練現在完成式、長句怎麼拆）。

要求：
1. 「文法」「單字與用法」「反覆出現的觀念盲點」要各舉 1～2 個他實際碰過的例句或問答來說明。
2. 「程度判斷」要和他自述的程度比對，並引用實際的問答或錯題當依據；資料不夠就老實說資料不夠。
3. 只根據材料寫，不要編造材料裡沒有的事；沒有材料的段落簡短說明即可，不要硬湊。
4. 不要前言、結語，不要用 code fence 包住內容。`;

const strip = (s: string): string =>
  s
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n/i, "")
    .replace(/\n```\s*$/, "")
    .trim();

// A plain Markdown answer (the month / quarter review), fences removed.
export function parseMarkdownAnswer(text: string): string {
  const t = strip(text);
  if (!t) throw new AiError("bad_output", "empty analysis");
  return t;
}

export function parseReportAnalysis(json: unknown): ReportAnalysis {
  const o = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  const now = typeof o.now === "string" ? strip(o.now) : "";
  const next = typeof o.next === "string" ? strip(o.next) : "";
  if (!now && !next) throw new AiError("bad_output", "report.analyze: empty analysis");
  return { now, next };
}

export const reportAnalyze: AiTask<ReportAnalyzeInput, ReportAnalysis> = {
  id: "report.analyze",
  version: 2,
  surface: "report",
  tier: "smart",
  maxTokens: 8192,
  answerChars: () => 0,
  build(input: ReportAnalyzeInput, ctx: TaskContext) {
    return composeRequest({
      base: REPORT_ANALYZE_PROMPT,
      profile: profileForTask(ctx.profile, reportAnalyze, input),
      history: [],
      user: `${input.material}`,
      tier: "smart",
      maxTokens: 8192,
      output: { name: "report_analysis", schema: REPORT_ANALYZE_SCHEMA },
    });
  },
  parse(r: AiResult): ReportAnalysis {
    return parseReportAnalysis(structuredJson(r));
  },
};
