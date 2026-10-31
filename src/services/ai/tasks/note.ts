import { renderTemplate } from "../../../core/text/template";
import { estimateTokens } from "../../../core/text/tokens";
import { MAX_ARTICLE_TOKENS, type ArticleInput } from "../context/paragraphContext";
import { composeRequest } from "./compose";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// Note-surface prompts (1030 #4 「複習這篇筆記」的 AI 討論): the AI quizzes
// the learner on the whole article — its main idea, how its paragraphs fit
// together — one question at a time, aimed at the learner's level and at
// what they already struggled with in this note (〔學習狀況〕). What the
// learner types next is graded as their answer when the AI just asked;
// otherwise it's a question about the article. The article is the cached
// prefix, the same way paragraph discussions send it.

export interface NoteInput {
  article: ArticleInput;
  question?: string;
  // 〔學習狀況〕 (core/learner/noteLearnerContext.ts); "" / absent = none.
  learner?: string;
}

export const NOTE_BASE_PROMPT = `你是一位耐心、精準的英文閱讀家教，正在用提問的方式確認一位以中文為母語的學習者有沒有讀懂一篇英文文章。〔文章〕是全文，段落前面的 ¶ 數字是段落編號；〔學習狀況〕是學習者在這篇查過、問過的地方。

出題規則：
1. 一次只問一題，不要附答案、不要暗示答案；問完就停，等學習者回答。
2. 難度照〔學習者設定〕的程度：程度低就給選項（A/B/C，選項用中文或簡單英文），程度高就問開放題、要求用自己的話說。
3. 優先考〔學習狀況〕裡學習者卡過的地方（問過翻譯、文法的段落，還不熟的單字所在的句子），但題目要扣緊整篇的理解，不是單字小考。
4. 題目寫出相關的段落編號（例如 ¶3），讓學習者能回去看。

批改規則（前一則是你出的題，學習者這次的輸入就是作答）：
1. 第一行寫「✅ 答對了」「🟡 部分正確」或「❌ 不太對」。
2. 接著引用原文（照抄英文、標出 ¶）說明正確的理解，點出學習者漏掉或誤會的地方；答對也補一句為什麼對。
3. 最後另起一行出下一題（同一類型、換個角度或段落），一樣不附答案。

共通規則：
1. 預設用繁體中文（台灣用語），引用英文原文時保留英文；〔學習者設定〕若指定了其他回答語言，以學習者設定為準。
2. 只根據提供的文章。文章沒寫的不要補，不確定就直接說「不確定」。
3. 用 Markdown 排版：重點用粗體，條列最多 5 點，不要用標題（#）。
4. 篇幅以〔學習者設定〕為準。`;

export const NOTE_ARTICLE_TEMPLATE = `〔文章〕{{#title}}《{{title}}》{{/title}}
{{#truncated}}（全文太長，這裡只附上前 {{shown}} 段。）{{/truncated}}

{{body}}`;

export const NOTE_TEMPLATES = {
  mainIdea: `任務：出一題考「這篇的主旨」
考學習者能不能抓到整篇的主旨，或作者用哪些論點、例子支持它。依出題規則只問一題。`,

  structure: `任務：出一題考「段落結構」
考學習者能不能看出段落之間的關係：某段在全文扮演什麼角色（開頭、轉折、論點、例子、結論…）、哪裡是轉折、某個轉折詞連接了什麼。依出題規則只問一題。`,

  custom: `〔學習者的輸入〕
{{question}}

如果你的上一則是在出題，這就是學習者的作答：照批改規則批改，再出下一題。否則這是學習者對文章的提問：直接回答，不用出題。`,
} as const;

type NoteTaskId = keyof typeof NOTE_TEMPLATES;

export function noteArticleBlock(article: ArticleInput, maxTokens = MAX_ARTICLE_TOKENS): string {
  const numbered = article.paragraphs.map((p, i) => `¶${i + 1} ${p.trim()}`);
  let shown = numbered.length;
  while (shown > 1 && estimateTokens(numbered.slice(0, shown).join("\n\n")) > maxTokens) shown--;
  return renderTemplate(NOTE_ARTICLE_TEMPLATE, {
    title: article.title?.trim(),
    truncated: shown < numbered.length ? "yes" : "",
    shown,
    body: numbered.slice(0, shown).join("\n\n"),
  });
}

function noteTask(id: NoteTaskId, opts: Pick<AiTask<NoteInput>, "tier" | "maxTokens" | "label">): AiTask<NoteInput> {
  const task: AiTask<NoteInput> = {
    id: `note.${id}`,
    // v2 (1030): quiz the learner instead of explaining; 〔學習狀況〕 added.
    version: 2,
    surface: "note",
    ...opts,
    build(input: NoteInput, ctx: TaskContext) {
      return composeRequest({
        base: NOTE_BASE_PROMPT,
        cached: [noteArticleBlock(input.article)],
        context: input.learner?.trim() ? [input.learner.trim()] : [],
        profile: profileForTask(ctx.profile, task, input),
        history: ctx.history,
        user: renderTemplate(NOTE_TEMPLATES[id], { question: input.question?.trim() ?? "" }),
        tier: opts.tier,
        maxTokens: opts.maxTokens,
      });
    },
  };
  return task;
}

export const noteMainIdea = noteTask("mainIdea", { tier: "smart", maxTokens: 4096, label: "ai.task.note.mainIdea" });
export const noteStructure = noteTask("structure", { tier: "smart", maxTokens: 4096, label: "ai.task.note.structure" });
// No label: free-form questions come from the composer, not a button.
export const noteCustom = noteTask("custom", { tier: "smart", maxTokens: 4096 });

export const NOTE_TASKS = [noteMainIdea, noteStructure, noteCustom];
