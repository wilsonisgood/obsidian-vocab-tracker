import { renderTemplate } from "../../../core/text/template";
import type { AiResult } from "../providers/types";
import { composeRequest } from "./compose";
import { WARM_TONE } from "./tone";
import type { AiTask, TaskContext } from "./types";

// Learning-buddy conversation (規劃書 15 §7). One thread per conversation;
// every quick topic is a task, and free typing is buddy.custom. The
// learner's background (LearnerModel summary + newest report) rides in the
// cached system block, so a long conversation re-reads it from cache.

export interface BuddyInput {
  // buddyContext() text; "" when there is nothing to say yet.
  context: string;
  question?: string;
  selection?: string;
  // 聊聊最近讀的: shareBrief() of what was picked; "" when nothing was.
  share?: string;
  // 聊聊最近讀的: this round's way of asking (SHARE_STYLES).
  shareStyle?: string;
}

export const BUDDY_BASE_PROMPT = `你是學生的英文學習夥伴，陪他聊英文怎麼學、看他寫的英文、一起想接下來可以怎麼走。

${WARM_TONE}

規則：
1. 依學生的程度調整說法；學生要求用某個程度（A1–C2）的英文對話時就照做，用英文時在需要處補中文。
2. 預設用繁體中文（台灣用語），英文例句保留英文；〔學習者設定〕指定了其他回答語言時，以它為準。
3. 〔學習者背景〕是他的學習紀錄，只在有幫助時自然地引用，沒有的資料不要編造，也不要把數字整串念一遍。
4. 像聊天一樣回答，不要寫成長篇報告；一次給一兩個做得到的方向就好，結尾可以問他一個小問題，讓對話繼續。
5. 學生貼上自己寫的英文時，這是他的練習，不是要被評分：先說做得好的地方，再用原句舉例說哪裡可以更自然、為什麼。
6. 如果上一輪是你把他最近讀過的一段文字或一個字丟給他、請他說說理解，他接著的回覆就是他的理解：先溫暖地肯定他抓到的部分，再自然地補充或修正，順便帶一個道地的用法或例句，不要像在打分數。
7. 每次回答的最後，另起一行輸出三個可以接著聊的話題，格式固定為：〔接著聊〕話題一｜話題二｜話題三
   每個話題 14 個中文字以內，輕鬆有趣、適合當按鈕文字、跟這一輪的內容相關；這一行是給介面用的，正文裡不要提到它。`;

const SELECTION_HEADER = `{{#selection}}〔選取的文字〕
{{selection}}

{{/selection}}`;

const EXTRA = `{{#question}}〔學生補充〕
{{question}}
{{/question}}`;

export const BUDDY_TEMPLATES = {
  grammar: `${SELECTION_HEADER}任務：聊聊文法怎麼學
依他的程度和最近卡住的地方，分享文法適合怎麼學（例如怎麼看例句、怎麼練、先學哪一類），舉一兩個具體的例子。
${EXTRA}`,

  writing: `${SELECTION_HEADER}任務：想多寫一點英文
推薦適合他程度的寫作題目和寫的方式（例如幾句話的日記、改寫一段讀過的文章），給一個可以現在就試試的小題目。
${EXTRA}`,

  review: `${SELECTION_HEADER}任務：一起看看我寫的
{{#writing}}〔我寫的英文〕
{{writing}}

{{/writing}}{{^writing}}（學生還沒有貼上英文，請親切地邀請他把想一起看的英文貼上來。）

{{/writing}}一起看看哪裡可以更好、為什麼：先說做得好的地方，再挑最值得調整的幾處，引用原句，給更自然的寫法並簡短說明原因。最後整理他常出現的小習慣（這只是這次對話裡的觀察，不會記成學習紀錄）。`,

  level: `${SELECTION_HEADER}任務：我最近走到哪了
依他的學習紀錄，聊聊他現在大約走到哪裡、哪些地方已經很穩，以及往下一步可以補什麼。資料不夠時就坦白說，不要硬猜。
${EXTRA}`,

  reading: `${SELECTION_HEADER}任務：找點東西來讀
推薦適合他程度的閱讀材料類型（例如分級讀物、新聞、部落格、故事），說明為什麼適合、怎麼讀比較輕鬆，不要編造具體的書名或網址。
${EXTRA}`,

  plan: `${SELECTION_HEADER}任務：聊聊接下來怎麼學
一起想接下來幾週可以怎麼安排：每天大概花多少時間、先專注哪一兩件事，並留一點彈性。
${EXTRA}`,

  share: `任務：聊聊最近讀的
{{#share}}〔他最近讀到的〕
{{share}}

你像一個好奇的朋友，把上面這個丟給他。{{#shareStyle}}這次的問法：{{shareStyle}}。{{/shareStyle}}
先不要給解釋或答案，等他回答；一次只問一個問題，開場用一兩句話就好。
不要用固定的開場句（例如每次都「我覺得 X 很有趣，因為…」），每次用不同的口氣和切入點。
{{/share}}{{^share}}（目前找不到他最近讀過的東西。）請像好奇的朋友一樣，親切地邀請他聊聊最近讀了什麼、有沒有遇到想聊的字或句子。
{{/share}}`,

  custom: `${SELECTION_HEADER}〔學生說〕
{{question}}

接著前面的對話回答。`,
} as const;

export type BuddyKind = keyof typeof BUDDY_TEMPLATES;

function buddyTask(id: BuddyKind, label?: AiTask<BuddyInput>["label"]): AiTask<BuddyInput, string> {
  const task: AiTask<BuddyInput, string> = {
    id: `buddy.${id}`,
    version: 1,
    surface: "buddy",
    tier: "smart",
    // Headroom for adaptive thinking; the prompt keeps the answer short.
    maxTokens: 4096,
    ...(label ? { label } : {}),
    build(input: BuddyInput, ctx: TaskContext) {
      const slots = {
        selection: input.selection?.trim(),
        question: input.question?.trim(),
        share: input.share?.trim(),
        shareStyle: input.shareStyle?.trim(),
        // 一起看看我寫的: the pasted English is the question text, or the selection.
        writing: id === "review" ? [input.question?.trim(), input.selection?.trim()].filter(Boolean).join("\n\n") : undefined,
      };
      // For review the text sits in 〔我寫的英文〕; don't repeat it twice.
      const user =
        id === "review"
          ? renderTemplate(BUDDY_TEMPLATES.review, { writing: slots.writing })
          : renderTemplate(BUDDY_TEMPLATES[id], slots);
      return composeRequest({
        base: BUDDY_BASE_PROMPT,
        cached: input.context.trim() ? [`〔學習者背景〕\n${input.context.trim()}`] : [],
        profile: ctx.profile,
        history: ctx.history,
        user,
        tier: task.tier,
        maxTokens: task.maxTokens,
      });
    },
    parse(r: AiResult): string {
      return r.text;
    },
  };
  return task;
}

export const buddyGrammar = buddyTask("grammar", "ai.task.buddy.grammar");
export const buddyWriting = buddyTask("writing", "ai.task.buddy.writing");
export const buddyReview = buddyTask("review", "ai.task.buddy.review");
export const buddyLevel = buddyTask("level", "ai.task.buddy.level");
export const buddyReading = buddyTask("reading", "ai.task.buddy.reading");
export const buddyShare = buddyTask("share", "ai.task.buddy.share");
export const buddyPlan = buddyTask("plan", "ai.task.buddy.plan");
// No label: free typing from the composer.
export const buddyCustom = buddyTask("custom");

export const BUDDY_TASKS = [buddyShare, buddyGrammar, buddyWriting, buddyReview, buddyLevel, buddyReading, buddyPlan, buddyCustom];

// ── 對話整理的「這次的收穫」 (buddy.digest) ──

export interface BuddyDigestInput {
  // digestConversation(): 你／夥伴 lines of the groups being tidied.
  conversation: string;
}

export const BUDDY_DIGEST_PROMPT = `你在幫學生整理一段英文學習對話的收穫。對話裡「（…）」括號的內容是介面按鈕的說明，不是學生說的話。
只輸出 JSON（不要程式碼區塊、不要其他文字），格式：
{"topics":["…"],"corrections":[{"yours":"…","better":"…","why":"…"}],"understandings":[{"subject":"…","yours":"…","ok":true,"feedback":"…"}],"words":["…"]}
規則：
1. topics：2 到 3 個這段對話聊到的主題（英文單字、專有名詞或簡短中文），給標題用。
2. corrections：學生自己寫的英文有哪些句子可以更自然；yours 引用原句，better 是更自然的寫法，why 用幾個關鍵詞說明原因（如「過去式、介系詞」）。學生沒寫英文就給空陣列，不要編造。
3. understandings：夥伴請學生說出理解的字或段落；subject 是那個字，yours 是學生的理解，ok 表示大致正確，feedback 一句補充。沒有就給空陣列。
4. words：對話中聊到的英文單字（原形、小寫），最多 12 個。
5. 只根據對話內容，沒有的就給空陣列，不要編造。`;

export const buddyDigest: AiTask<BuddyDigestInput, string> = {
  id: "buddy.digest",
  version: 1,
  surface: "buddy",
  tier: "fast",
  maxTokens: 1500,
  build(input, ctx) {
    return composeRequest({
      base: BUDDY_DIGEST_PROMPT,
      profile: ctx.profile,
      history: [],
      user: `〔對話〕\n${input.conversation}`,
      tier: "fast",
      maxTokens: 1500,
    });
  },
  parse(r: AiResult): string {
    return r.text;
  },
};
