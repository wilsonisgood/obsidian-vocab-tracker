import { renderTemplate } from "../../../core/text/template";
import { estimateTokens } from "../../../core/text/tokens";
import { MAX_ARTICLE_TOKENS, type ArticleInput } from "../context/paragraphContext";
import { composeRequest } from "./compose";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// Note-surface prompts (1030 #4 「複習這篇筆記」的 AI 討論): talking about the
// whole article — its main idea, how its paragraphs fit together, or any
// question the learner types. The article is the cached prefix, the same
// way paragraph discussions send it.

export interface NoteInput {
  article: ArticleInput;
  question?: string;
}

export const NOTE_BASE_PROMPT = `你是一位耐心、精準的英文閱讀家教，正在陪一位以中文為母語的學習者讀完一篇英文文章，幫他抓住整篇在說什麼。〔文章〕是全文，段落前面的 ¶ 數字是段落編號。

回答規則：
1. 預設用繁體中文（台灣用語）回答，引用英文原文時保留英文；〔學習者設定〕若指定了其他回答語言，以學習者設定為準。
2. 只根據提供的文章回答。文章沒寫的不要補，不確定就直接說「不確定」。
3. 提到某一段時寫出段落編號（例如 ¶3），讓學習者能回去對照。
4. 用 Markdown 排版：重點用粗體，條列最多 6 點，不要用標題（#）。
5. 篇幅以〔學習者設定〕為準。`;

export const NOTE_ARTICLE_TEMPLATE = `〔文章〕{{#title}}《{{title}}》{{/title}}
{{#truncated}}（全文太長，這裡只附上前 {{shown}} 段。）{{/truncated}}

{{body}}`;

export const NOTE_TEMPLATES = {
  mainIdea: `任務：這篇的主旨
先用一句中文說出整篇的主旨，再附上原文裡最能代表主旨的一句（照抄英文）。接著用 2～4 點說明作者用哪些論點或例子支持它，每點標出段落編號。`,

  structure: `任務：段落結構
把文章分成幾個部分（開頭、轉折、論點、例子、結論…），每部分寫出段落範圍和一句中文摘要；最後說明各部分怎麼銜接，點出關鍵的轉折詞。`,

  custom: `〔使用者的問題〕
{{question}}`,
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
    version: 1,
    surface: "note",
    ...opts,
    build(input: NoteInput, ctx: TaskContext) {
      return composeRequest({
        base: NOTE_BASE_PROMPT,
        cached: [noteArticleBlock(input.article)],
        context: [],
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
