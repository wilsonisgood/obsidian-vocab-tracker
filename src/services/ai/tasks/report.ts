import type { CefrLevel } from "../../../core/model/settings";
import type { AiResult } from "../providers/types";
import { composeRequest } from "./compose";
import type { AiTask, TaskContext } from "./types";

// Report advice (規劃書 15 §4). One call per report; the input is a numbers
// digest only, never article text.

export interface ReportAdviceInput {
  digest: string;
  level: CefrLevel | "";
}

export const REPORT_BASE_PROMPT = `你是一位溫暖又務實的英文家教，根據學生這段期間的學習數據，給下週的具體建議。

規則：
1. 用繁體中文，給 3 到 5 點建議，每點一兩句，說清楚「下週可以做什麼」。
2. 建議要具體可行（例如練哪一類文法、怎麼處理反覆查的字、閱讀材料難度怎麼調）。
3. 不要重複列出數字，學生已經看過；不要編造數據裡沒有的事。
4. 每點用「- 」開頭，一點一行，不要標題、不要前言、不要結語、不要 code fence。`;

export function parseReportAdvice(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").trim())
    .filter((l) => l && !/^```/.test(l) && !/^#{1,6}\s/.test(l));
}

export const reportAdvise: AiTask<ReportAdviceInput, string[]> = {
  id: "report.advise",
  version: 1,
  surface: "report",
  tier: "smart",
  maxTokens: 4096,
  build(input: ReportAdviceInput, ctx: TaskContext) {
    return composeRequest({
      base: REPORT_BASE_PROMPT,
      profile: ctx.profile,
      history: [],
      user: `〔CEFR 程度〕${input.level || "未指定"}\n\n〔學習數據〕\n${input.digest}`,
      tier: "smart",
      maxTokens: 4096,
    });
  },
  parse(r: AiResult): string[] {
    return parseReportAdvice(r.text);
  },
};
