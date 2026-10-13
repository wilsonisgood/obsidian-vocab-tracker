import { topicById } from "../../../core/grammar/catalog";
import type { GrammarStage, GrammarTopic } from "../../../core/model/grammar";
import { renderTemplate } from "../../../core/text/template";
import { AiError } from "../errors";
import type { AiResult } from "../providers/types";
import { composeRequest } from "./compose";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// grammar.explain (第十五波 M, 1013 §3.2): the 「說明」 section of a grammar
// topic page, written once by the 「✦ 生成說明」 button. Plain Markdown, not
// JSON — GrammarPages writes it into the note as it is (headings demoted).
// Nothing is cached across calls: one request per topic, ever.

export interface GrammarExplainInput {
  topic: GrammarTopic;
}

const STAGE_LABEL: Record<GrammarStage, string> = { 1: "基礎", 2: "中級", 3: "進階" };

export const GRAMMAR_EXPLAIN_BASE_PROMPT = `你是一位英文文法老師，正在為一位以中文為母語的學習者寫一個文法主題的「說明」。〔文法主題〕是這一篇要講的主題。

回答規則：
1. 預設用繁體中文（台灣用語）寫，句型和例句保留英文；〔學習者設定〕若指定了其他回答語言，以學習者設定為準。
2. 只講可靠、常見的文法知識。不確定就直接說「不確定」或「說法不一」，不要編造規則、例外或用法。
3. 所有例句都要自己原創，不要引用或模仿任何出版教材、考題或文章裡的例句。
4. 直接從內容開始，不要加前言或結尾客套話。輸出 Markdown，各小節用粗體當標題，不要用 # 或 ## 標題。
5. 用詞和深度依〔學習者設定〕的程度調整：程度較低就少用術語，第一次出現的文法術語附上中英對照。`;

const USER_TEMPLATE = `任務：寫「{{title}}」的說明
照這個順序，每一節以粗體當標題：
1. **核心概念**：2 到 4 句，說明這個主題解決什麼問題、什麼時候用。
2. **句型**：用 code 格式列出 1 到 3 個句型（例如 \`have + 過去分詞\`），每個一行，後面接一句中文說明。
3. **例句**：3 個原創例句，每句一行，英文後面接「——」再接中文翻譯。
4. **容易犯的錯**：2 到 3 點，每點用「❌ 錯誤句」「✅ 正確句」對照，再用一句話說明原因。
{{#related}}5. **和相關主題的差別**：{{related}}每個相關主題各用一句話，說明和「{{title}}」差在哪裡。
{{/related}}`;

function line(t: GrammarTopic): string {
  return `${t.title}（${t.pattern}）`;
}

// Prerequisites and related topics that are in the built-in catalog.
function known(ids: readonly string[]): GrammarTopic[] {
  return ids.map((id) => topicById(id)).filter((t): t is GrammarTopic => !!t);
}

// The 〔文法主題〕 system block: what the catalog says about the topic
// (promptHint is for the question-writing task, so it is left out).
export function topicBlock(topic: GrammarTopic): string {
  const prereq = known(topic.prerequisites);
  const related = known(topic.related);
  return [
    "〔文法主題〕",
    `名稱：${topic.title}`,
    `句型：${topic.pattern}`,
    `等級：${STAGE_LABEL[topic.stage]}（難度 ${topic.difficulty}/9）`,
    `一句話：${topic.summary}`,
    "學習目標：",
    ...topic.objectives.map((o) => `- ${o.text}`),
    ...(prereq.length ? [`前置主題：${prereq.map(line).join("；")}`] : []),
    ...(related.length ? [`相關主題：${related.map(line).join("；")}`] : []),
  ].join("\n");
}

// A fenced ```markdown wrapper around the whole answer is dropped; an empty
// answer is a bad output (nothing to write into the note).
export function parseGrammarExplanation(r: AiResult): string {
  let text = r.text.trim();
  const fenced = /^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```$/.exec(text);
  if (fenced) text = fenced[1].trim();
  if (!text) throw new AiError("bad_output", "empty explanation");
  return text;
}

export const grammarExplain: AiTask<GrammarExplainInput, string> = {
  id: "grammar.explain",
  version: 1,
  surface: "grammar",
  tier: "smart",
  maxTokens: 4096,
  // The learner's usual 300-character limit would cut a full explanation
  // short; this task needs room for four sections and three examples.
  answerChars: (_input, max) => Math.max(max, 900),
  build(input: GrammarExplainInput, ctx: TaskContext) {
    const { topic } = input;
    const related = known(topic.related);
    return composeRequest({
      base: GRAMMAR_EXPLAIN_BASE_PROMPT,
      context: [topicBlock(topic)],
      profile: profileForTask(ctx.profile, grammarExplain, input),
      history: [],
      user: renderTemplate(USER_TEMPLATE, {
        title: topic.title,
        related: related.length ? `把「${topic.title}」和${related.map((t) => `「${t.title}」`).join("、")}比較，` : "",
      }),
      tier: "smart",
      maxTokens: 4096,
    });
  },
  parse: parseGrammarExplanation,
};

export const GRAMMAR_TASKS = [grammarExplain];
