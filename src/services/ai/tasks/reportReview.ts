import type { CefrLevel } from "../../../core/model/settings";
import type { AiResult } from "../providers/types";
import { composeRequest } from "./compose";
import { parseReportAnalysis } from "./reportAnalyze";
import { WARM_TONE } from "./tone";
import type { AiTask, TaskContext } from "./types";

// Month / quarter review (第二十一波 R4): reads the weekly reports' written
// sections (never their number tables) and looks at the change over time.

export interface ReportReviewInput {
  material: string;
  // "這個月" / "這一季"
  span: string;
  level: CefrLevel | "";
}

export const REPORT_REVIEW_PROMPT = `你是學生的英文學習夥伴。下面是他{span}每一週學習報告裡的「程度建議」「給你的建議」「詳細分析」。請替他回顧{span}。

${WARM_TONE}

請用繁體中文、Markdown 輸出，依序寫這三段，每段用「### 」開頭的小標：
### 這段時間的變化
### 反覆出現的主題
### 接下來的方向

要求：
1. 「這段時間的變化」分開寫哪些地方進步了、哪些還卡著，並指出是哪幾週的觀察。
2. 「反覆出現的主題」整理在多份週報裡一再出現的問題或強項。
3. 「接下來的方向」給 3 到 5 件具體做得到的事。
4. 只根據材料寫，不要編造材料裡沒有的事。
5. 不要前言、結語，不要用 code fence 包住整份輸出。`;

export const reportReview: AiTask<ReportReviewInput, string> = {
  id: "report.review",
  version: 1,
  surface: "report",
  tier: "smart",
  maxTokens: 8192,
  build(input: ReportReviewInput, ctx: TaskContext) {
    return composeRequest({
      base: REPORT_REVIEW_PROMPT.replaceAll("{span}", input.span),
      profile: ctx.profile,
      history: [],
      user: `〔自述程度〕${input.level || "未指定"}\n\n${input.material}`,
      tier: "smart",
      maxTokens: 8192,
    });
  },
  parse(r: AiResult): string {
    return parseReportAnalysis(r.text);
  },
};
