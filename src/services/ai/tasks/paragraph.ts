import { renderTemplate } from "../../../core/text/template";
import { buildParagraphContext, type ParagraphInput } from "../context/paragraphContext";
import { composeRequest } from "./compose";
import type { AiTask, TaskContext } from "./types";

// Paragraph-surface prompts (規劃書 06 §6.3/§6.4). Every prompt is a plain
// template so prompt changes are reviewed as text (the composed requests
// are snapshot-tested in tests/services/ai/tasks).

// Shared by every paragraph task and contains no slots: it must stay
// byte-identical across tasks so it can lead the cached prefix.
export const PARAGRAPH_BASE_PROMPT = `你是一位耐心、精準的英文閱讀家教，正在陪一位以中文為母語的學習者讀一篇英文文章。〔文章〕是全文，〔目前段落〕是學習者正在讀的那一段。

回答規則：
1. 預設用繁體中文（台灣用語）回答，引用英文原文時保留英文；〔學習者設定〕若指定了其他回答語言，以學習者設定為準。
2. 只根據提供的文章和可靠、常見的語言知識回答。不確定就直接說「不確定」，不要編造字義、文法規則、字源或出處。
3. 用 Markdown 排版：重點用粗體，條列最多 5 點，不要用標題（#）。
4. 篇幅以〔學習者設定〕為準。

判斷使用者在問哪一句：
- 使用者的問題常常很口語，例如「我看不懂這句」「這裡為什麼這樣寫」，也可能直接貼上或引用文章裡的一小段文字（可能不完整、有錯字、大小寫不同）。
- 依序用這些線索找出他指的那一句：
  1. 有〔選取的文字〕時，以包含選取文字的那一句為準。
  2. 問題裡引用了英文片段時，在〔目前段落〕找包含這個片段的句子；找不到再到〔文章〕其他段落找。
  3. 都沒有線索時：問題是針對整段（例如「這段在講什麼」），範圍就是整段；問題說的是「這句」但〔目前段落〕有好幾句，就挑最可能讓學習者卡住的那一句，並在回答最後提醒：「如果不是這句，選取或貼上你想問的句子再問一次。」
- 回答的第一行固定寫出範圍，原文照抄、不要翻譯：
  - 針對某一句：你問的是：「<那一句英文原文>」
  - 針對整段：你問的是：整段（¶<段落編號>）
- 真的無法判斷時，列出最可能的一到兩句請使用者確認，不要硬猜。
- 第一行之後空一行，再開始回答。`;

// The final user turn. Shared header: the highlighted text (if any) always
// travels with the request so the model can anchor vague questions.
const SELECTION_HEADER = `{{#selection}}〔選取的文字〕
{{selection}}

{{/selection}}`;

export const PARAGRAPH_TEMPLATES = {
  grammar: `${SELECTION_HEADER}任務：文法解析（¶{{paragraphNumber}}）
範圍：{{#selection}}〔選取的文字〕所在的那一句。{{/selection}}{{^selection}}〔目前段落〕裡結構最值得學的一句；段落只有一句時就是那一句。{{/selection}}
請拆解句子結構（主要子句、從屬子句、片語各自修飾誰），點出關鍵文法（時態、語態、假設語氣、倒裝、省略等）在這裡的作用，最後用一句話說明這句的意思。`,

  translate: `${SELECTION_HEADER}任務：翻譯（¶{{paragraphNumber}}）
範圍：{{#selection}}〔選取的文字〕所在的句子。{{/selection}}{{^selection}}整段。{{/selection}}
先給通順、自然的繁體中文翻譯；再挑一到三個直譯容易出錯的地方（片語、慣用語、文化背景）簡短說明。`,

  vocab: `${SELECTION_HEADER}任務：生字整理（¶{{paragraphNumber}}）
範圍：整段。
依〔學習者設定〕的程度，挑出〔目前段落〕裡最值得學的 3 到 6 個單字或片語。{{#knownWords}}學習者已經收錄的字不要再列：{{knownWords}}。{{/knownWords}}
每個一行，格式：- **單字** 詞性：中文意思 — 在這段裡的用法`,

  paraphrase: `${SELECTION_HEADER}任務：換句話說（¶{{paragraphNumber}}）
範圍：{{#selection}}〔選取的文字〕所在的那一句。{{/selection}}{{^selection}}〔目前段落〕裡最難懂的一句。{{/selection}}
給兩種英文改寫：一種更簡單、適合〔學習者設定〕的程度；一種更自然道地。每種都附中文說明，講清楚和原句差在哪裡。`,

  custom: `${SELECTION_HEADER}〔使用者的問題〕（¶{{paragraphNumber}}）
{{question}}

請先依「判斷使用者在問哪一句」的規則在第一行寫出範圍，再回答問題。`,
} as const;

type ParagraphTaskId = keyof typeof PARAGRAPH_TEMPLATES;

function paragraphTask(
  id: ParagraphTaskId,
  opts: Pick<AiTask<ParagraphInput>, "tier" | "maxTokens" | "label">
): AiTask<ParagraphInput> {
  return {
    id: `paragraph.${id}`,
    version: 1,
    surface: "paragraph",
    ...opts,
    build(input: ParagraphInput, ctx: TaskContext) {
      const c = buildParagraphContext(input);
      return composeRequest({
        base: PARAGRAPH_BASE_PROMPT,
        cached: [c.articleBlock],
        context: [c.focusBlock],
        profile: ctx.profile,
        history: ctx.history,
        user: renderTemplate(PARAGRAPH_TEMPLATES[id], c.slots),
        tier: opts.tier,
        maxTokens: opts.maxTokens,
      });
    },
  };
}

// maxTokens leaves headroom for adaptive thinking on Sonnet 5, which
// counts against max_tokens; the visible answer is still kept short by
// the profile's length instruction.
export const paragraphGrammar = paragraphTask("grammar", { tier: "smart", maxTokens: 4096, label: "ai.task.paragraph.grammar" });
export const paragraphTranslate = paragraphTask("translate", { tier: "fast", maxTokens: 2048, label: "ai.task.paragraph.translate" });
export const paragraphVocab = paragraphTask("vocab", { tier: "fast", maxTokens: 2048, label: "ai.task.paragraph.vocab" });
export const paragraphParaphrase = paragraphTask("paraphrase", { tier: "smart", maxTokens: 4096, label: "ai.task.paragraph.paraphrase" });
// No label: free-form questions come from the composer, not a button.
export const paragraphCustom = paragraphTask("custom", { tier: "smart", maxTokens: 4096 });

export const PARAGRAPH_TASKS = [paragraphGrammar, paragraphTranslate, paragraphVocab, paragraphParaphrase, paragraphCustom];
