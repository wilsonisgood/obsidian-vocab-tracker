import type { GrammarTopic } from "../../../core/model/grammar";
import { renderTemplate } from "../../../core/text/template";
import { LAYOUT_TITLES, layoutOf, parseVisual, visualGuide, visualSchema, type Visual } from "../../../grammar-visual";
import { AiError } from "../errors";
import type { AiResult } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { topicBlock } from "./grammarExplain";
import type { AiTask, TaskContext } from "./types";

// grammar.visual: 主題頁上概念版面的「換一個例句」。版面種類由主題決定
// （grammar-visual 的對照表），AI 只填那種版面的欄位；畫面由模組畫。

export interface GrammarVisualInput {
  topic: GrammarTopic;
  // 已經看過的例句，AI 要換一個不一樣的。
  avoid?: string[];
}

export const GRAMMAR_VISUAL_BASE_PROMPT = `你是一位英文文法老師，要用一個固定的圖解版面，幫以中文為母語的學習者看懂一個文法概念。〔文法主題〕是要講的主題，〔版面〕說明這種圖解每個欄位怎麼填。

規則：
1. 只輸出符合 schema 的 JSON，所有欄位都要給；說明裡寫「沒有就填空字串或空陣列」的欄位，沒有內容時照做。
2. 例句要自然、常見、文法完全正確，長度適中；全部自己原創，不要引用出版教材、考題或文章。
3. 解說與標籤用繁體中文（台灣用語），白話、具體，說出「為什麼是這樣」；〔學習者設定〕指定了其他回答語言時以學習者設定為準。
4. 例句要切中〔文法主題〕的學習目標，讓圖解一眼就看得出重點；用詞難度依〔學習者設定〕的程度調整。
5. 不確定的規則不要寫；寧可選一個單純、典型的例子。`;

const VISUAL_TEMPLATE = `任務：為「{{title}}」做一份「{{layout}}」圖解。
{{#avoid}}不要再用這些例句，換一個情境：
{{avoid}}
{{/avoid}}`;

const MAX_AVOID = 5;

export const grammarVisual: AiTask<GrammarVisualInput, Visual> = {
  id: "grammar.visual",
  version: 1,
  surface: "grammar",
  tier: "smart",
  maxTokens: 4096,
  answerChars: () => 0,
  build(input: GrammarVisualInput, ctx: TaskContext) {
    const kind = layoutOf(input.topic.id);
    if (!kind) throw new AiError("bad_output", `no layout for grammar topic "${input.topic.id}"`);
    const avoid = (input.avoid ?? []).map((s) => s.trim()).filter(Boolean).slice(-MAX_AVOID);
    return composeRequest({
      base: GRAMMAR_VISUAL_BASE_PROMPT,
      context: [topicBlock(input.topic), `〔版面〕${LAYOUT_TITLES[kind]}\n${visualGuide(kind)}`],
      profile: ctx.profile,
      history: [],
      user: renderTemplate(VISUAL_TEMPLATE, {
        title: input.topic.title,
        layout: LAYOUT_TITLES[kind],
        avoid: avoid.map((s) => `- ${s}`).join("\n"),
      }),
      tier: grammarVisual.tier,
      maxTokens: grammarVisual.maxTokens,
      output: { name: "grammar_visual", schema: visualSchema(kind) },
    });
  },
  parse(r: AiResult): Visual {
    const v = parseVisual(structuredJson(r));
    if (!v) throw new AiError("bad_output", "grammar visual did not match its layout");
    return v;
  },
};

export const GRAMMAR_TASKS = [grammarVisual];
