import { renderTemplate } from "../../../core/text/template";
import { buildWordContext, type WordInput } from "../context/wordContext";
import { composeRequest } from "./compose";
import type { AiTask, TaskContext } from "./types";

// Word-surface prompts (規劃書 06 §6.3/§6.4). Same structure as
// tasks/paragraph.ts: a slot-free base prompt (cached), the word block with
// the full source paragraph, the learner profile, then the task template.

export const WORD_BASE_PROMPT = `你是一位耐心、精準的英文單字家教，正在幫一位以中文為母語的學習者弄懂一個英文單字。〔單字〕是這個字的資料，〔出處段落〕是學習者遇到這個字的那一整段原文。

回答規則：
1. 預設用繁體中文（台灣用語）回答，英文單字與例句保留英文；〔學習者設定〕若指定了其他回答語言，以學習者設定為準。
2. 只根據提供的資料和可靠、常見的語言知識回答。不確定就直接說「不確定」，不要編造字義、用法、字源或出處。
3. 用 Markdown 排版：重點用粗體，條列最多 5 點，不要用標題（#）。
4. 篇幅以〔學習者設定〕為準。
5. 解釋字義時，以這個字在〔出處段落〕裡的意思為主，再補充其他常見意思。

判斷使用者在問哪一句：
- 使用者的問題可能很口語，例如「這句裡它是什麼意思」「我看不懂這句」，也可能直接貼上或引用原文的一小段（可能不完整、有錯字、大小寫不同）。
- 依序用這些線索找出他指的那一句：有〔選取的文字〕時以包含它的句子為準；問題裡引用了英文片段時，在〔出處段落〕找包含這個片段的句子；都沒有線索時，以〔出處段落〕中含有這個單字的句子為準。
- 只要回答牽涉原文裡的某一句，第一行固定寫：你問的是：「<那一句英文原文>」（原文照抄，不要翻譯），空一行再開始回答。問題和原文句子無關時（例如只問字根、造句），不用寫這一行。
- 真的無法判斷時，列出最可能的一到兩句請使用者確認，不要硬猜。`;

const SELECTION_HEADER = `{{#selection}}〔選取的文字〕
{{selection}}

{{/selection}}`;

export const WORD_TEMPLATES = {
  usage: `${SELECTION_HEADER}任務：用法（{{word}}）
說明 {{word}} 最常見的 2 到 3 種用法或搭配（collocation），每種附一個簡短例句和中文翻譯。{{#hasSource}}如果〔出處段落〕裡的用法屬於其中一種，標出來。{{/hasSource}}`,

  compare: `${SELECTION_HEADER}任務：比較（{{word}}{{#compareWith}} vs {{compareWith}}{{/compareWith}}）
{{^compareWith}}先挑一到兩個學習者最容易和 {{word}} 混淆的近義字。{{/compareWith}}從意思、語氣與正式程度、常見搭配三方面比較，各附一個例句。{{#hasSource}}最後用一兩句說明〔出處段落〕為什麼用 {{word}}。{{/hasSource}}`,

  sentence: `${SELECTION_HEADER}任務：造句（{{word}}）
用 {{word}} 造 3 個句子，難度符合〔學習者設定〕的程度，情境盡量貼近學習者的目標。{{#hasSource}}其中一句沿用〔出處段落〕裡的意思。{{/hasSource}}每句附中文翻譯。`,

  mnemonic: `${SELECTION_HEADER}任務：記憶法（{{word}}）
給 {{word}} 一到兩個好記的方法（字根字首、聯想、拆字擇一）。字根或字源不確定時直接說不確定，改用聯想法，不要編造。`,

  custom: `${SELECTION_HEADER}〔使用者的問題〕（關於 {{word}}）
{{question}}

如果問題牽涉原文裡的某一句，先依「判斷使用者在問哪一句」的規則在第一行寫出那一句，再回答問題。`,
} as const;

type WordTaskId = keyof typeof WORD_TEMPLATES;

function wordTask(id: WordTaskId, opts: Pick<AiTask<WordInput>, "tier" | "maxTokens" | "label">): AiTask<WordInput> {
  return {
    id: `word.${id}`,
    version: 1,
    surface: "word",
    ...opts,
    build(input: WordInput, ctx: TaskContext) {
      const c = buildWordContext(input);
      return composeRequest({
        base: WORD_BASE_PROMPT,
        context: [c.wordBlock],
        profile: ctx.profile,
        history: ctx.history,
        user: renderTemplate(WORD_TEMPLATES[id], c.slots),
        tier: opts.tier,
        maxTokens: opts.maxTokens,
      });
    },
  };
}

export const wordUsage = wordTask("usage", { tier: "fast", maxTokens: 2048, label: "ai.task.word.usage" });
export const wordCompare = wordTask("compare", { tier: "smart", maxTokens: 4096, label: "ai.task.word.compare" });
export const wordSentence = wordTask("sentence", { tier: "fast", maxTokens: 2048, label: "ai.task.word.sentence" });
export const wordMnemonic = wordTask("mnemonic", { tier: "fast", maxTokens: 2048, label: "ai.task.word.mnemonic" });
export const wordCustom = wordTask("custom", { tier: "smart", maxTokens: 4096 });

export const WORD_TASKS = [wordUsage, wordCompare, wordSentence, wordMnemonic, wordCustom];
