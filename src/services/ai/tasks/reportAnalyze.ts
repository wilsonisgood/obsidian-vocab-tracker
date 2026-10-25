import type { CefrLevel } from "../../../core/model/settings";
import type { AiResult } from "../providers/types";
import { composeRequest } from "./compose";
import { WARM_TONE } from "./tone";
import type { AiTask, TaskContext } from "./types";

// Detailed analysis of one report period (第二十一波 R4, 規劃書 15 §6).
// Unlike report.advise, the input carries the learner's own questions and
// the AI's answers, so the analysis can quote real examples.

export interface ReportAnalyzeInput {
  material: string;
  level: CefrLevel | "";
}

export const REPORT_ANALYZE_PROMPT = `你是學生的英文學習夥伴。下面是他這段期間的學習材料：和 AI 討論過的問答、練習答錯的題目、反覆查的字，以及這期報告的數字摘要。請替他做一份詳細分析。

${WARM_TONE}

請用繁體中文、Markdown 輸出，依序寫這六段，每段用「### 」開頭的小標：
### 你常問什麼
### 反覆出現的觀念盲點
### 文法
### 單字與用法
### 程度判斷
### 接下來四週可以試試的方向

要求：
1. 「文法」「單字與用法」「反覆出現的觀念盲點」要各舉 1～2 個他實際碰過的例句或問答來說明。
2. 「程度判斷」要和他自述的程度比對，並引用實際的問答或錯題當依據；資料不夠就老實說資料不夠。
3. 「接下來四週可以試試的方向」分成第 1～4 週，每週一兩件具體做得到的事。
4. 只根據材料寫，不要編造材料裡沒有的事；沒有材料的段落簡短說明即可，不要硬湊。
5. 不要前言、結語，不要用 code fence 包住整份輸出。`;

export function parseReportAnalysis(text: string): string {
  const t = text
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n/i, "")
    .replace(/\n```\s*$/, "")
    .trim();
  if (!t) throw new Error("empty analysis");
  return t;
}

export const reportAnalyze: AiTask<ReportAnalyzeInput, string> = {
  id: "report.analyze",
  version: 1,
  surface: "report",
  tier: "smart",
  maxTokens: 8192,
  build(input: ReportAnalyzeInput, ctx: TaskContext) {
    return composeRequest({
      base: REPORT_ANALYZE_PROMPT,
      profile: ctx.profile,
      history: [],
      user: `${input.material}`,
      tier: "smart",
      maxTokens: 8192,
    });
  },
  parse(r: AiResult): string {
    return parseReportAnalysis(r.text);
  },
};
