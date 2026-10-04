import { renderTemplate } from "../../../core/text/template";
import { buildTriviaContext, type TriviaInput } from "../context/triviaContext";
import type { AiResult } from "../providers/types";
import { composeRequest } from "./compose";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// Trivia-surface prompts (規劃書 06 §6.3/§6.4, §7.4, screen L7). One shared
// conversation (the trivia-session thread); every quick action is about one
// subject word, and the answer is plain Markdown whose first line is a bold
// title — parse() splits it so a favorite (TriviaItem) gets title + body.
//
// Making up etymology is the biggest risk here (規劃書 06 §13), so the base
// prompt says outright: unsure → say so, never invent a word origin.

export const TRIVIA_BASE_PROMPT = `你是一位風趣、嚴謹的英文單字說書人，用「冷知識」幫一位以中文為母語的學習者記住他學過的單字。〔已學單字〕是他學過的字，〔這次的主角〕是這一則要講的字。

回答規則：
1. 預設用繁體中文（台灣用語）回答，英文單字與例句保留英文；〔學習者設定〕若指定了其他回答語言，以學習者設定為準。
2. 只講可靠、有根據的知識。不確定就直接說「不確定」或「說法不一」，不要編造字源、年代、人名、數據或出處；沒有可靠的字源故事時，改講用法、搭配或容易混淆的字，不要硬湊。
3. 新的一則（不是追問）第一行固定寫標題，格式是「**<標題>**」，標題 20 字以內；空一行再寫內容。追問直接回答，不用標題。
4. 每則內容 50 到 200 字，用 Markdown，重點用粗體，不要用標題（#）。
5. 可以的話，自然地帶到 1 到 2 個〔已學單字〕裡的其他字，幫學習者複習；不要硬塞，也不要列清單。
6. 不要重複〔已講過的冷知識〕裡的內容；同一個字講過了，就換一個角度。`;

const SELECTION_HEADER = `{{#selection}}〔選取的文字〕
{{selection}}

{{/selection}}`;

export const TRIVIA_TEMPLATES = {
  next: `任務：再來一則冷知識（主角：{{word}}）
講一則和 {{word}} 有關的冷知識，從字源、用法的演變、文化背景、容易混淆的字、有趣的搭配裡挑一個最有記憶點的角度。`,

  quiz: `任務：考我一題（主角：{{word}}）
出一題關於 {{word}} 的小題目：選擇題（最多四個選項）或填空題，用英文例句或情境出題，難度符合〔學習者設定〕。先不要公布答案，最後一行寫：「回覆你的答案，我再告訴你對不對。」`,

  etymology: `任務：字源（主角：{{word}}）
講 {{word}} 的字源或字根字首，以及它和哪些常見的字有關係。字源不確定、或各家說法不一時，直接說明，再改講可靠的構詞或用法，不要編造。`,

  joke: `任務：笑話（主角：{{word}}）
用 {{word}} 說一個簡短的笑話、雙關或文字遊戲，最後用一兩句說明笑點，以及 {{word}} 在這裡的意思。`,

  followup: `${SELECTION_HEADER}〔使用者的追問〕{{#word}}（目前的主角：{{word}}）{{/word}}
{{question}}

接著前面的對話回答，不用寫標題。如果是在回答前面出的題目，先說對或不對，再解釋。`,
} as const;

export type TriviaKind = Exclude<keyof typeof TRIVIA_TEMPLATES, "followup">;

// What a trivia answer splits into when saved as a favorite.
export interface TriviaAnswer {
  title: string;
  body: string;
}

const TITLE_MAX = 40;
const BOLD_LINE_RE = /^\s*(?:#+\s*)?\*\*(.+?)\*\*\s*[:：]?\s*$/;
const LABEL_LINE_RE = /^\s*(?:標題|title)\s*[:：]\s*(.+)$/i;

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// The prompt asks for 「**<標題>**」 on the first line; models sometimes use
// a heading or 「標題：」 instead, or skip the title entirely (follow-ups).
// Without a title line, the first sentence (clipped) stands in for one.
export function splitTrivia(text: string): TriviaAnswer {
  const trimmed = text.trim();
  const nl = trimmed.indexOf("\n");
  const first = nl === -1 ? trimmed : trimmed.slice(0, nl);
  const rest = nl === -1 ? "" : trimmed.slice(nl + 1).trim();
  const titled = BOLD_LINE_RE.exec(first) ?? LABEL_LINE_RE.exec(first);
  if (titled && rest) return { title: clip(titled[1].trim(), TITLE_MAX), body: rest };
  const plain = trimmed.replace(/\*\*|__|`/g, "");
  const sentence = /^[^。！？!?\n]+[。！？!?]?/.exec(plain)?.[0] ?? plain;
  return { title: clip(sentence.trim(), TITLE_MAX), body: trimmed };
}

function triviaTask(
  id: keyof typeof TRIVIA_TEMPLATES,
  opts: Pick<AiTask<TriviaInput, TriviaAnswer>, "label" | "answerChars">
): AiTask<TriviaInput, TriviaAnswer> {
  const task: AiTask<TriviaInput, TriviaAnswer> = {
    id: `trivia.${id}`,
    version: 2,
    surface: "trivia",
    tier: "smart",
    // Headroom for adaptive thinking on Sonnet 5; the visible answer is
    // kept to 50–200 字 by the prompt.
    maxTokens: 4096,
    ...opts,
    build(input: TriviaInput, ctx: TaskContext) {
      const c = buildTriviaContext(input);
      return composeRequest({
        base: TRIVIA_BASE_PROMPT,
        cached: [c.knownBlock],
        profile: profileForTask(ctx.profile, task, input),
        history: ctx.history,
        // The subject and the told list change every round, so they ride
        // in this round's message: kept in the system prompt they would
        // break the history cache on every request (規劃書 06 §6.4.1 #5).
        user: [c.subjectBlock, c.toldBlock, renderTemplate(TRIVIA_TEMPLATES[id], c.slots)].filter(Boolean).join("\n\n"),
        tier: task.tier,
        maxTokens: task.maxTokens,
      });
    },
    parse(r: AiResult): TriviaAnswer {
      return splitTrivia(r.text);
    },
  };
  return task;
}

// A new trivia is 50–200 字 whatever the learner's (longer) default is.
const TRIVIA_CHARS = 200;
const capped = (_input: TriviaInput, max: number) => Math.min(max, TRIVIA_CHARS);

export const triviaNext = triviaTask("next", { label: "ai.task.trivia.next", answerChars: capped });
export const triviaQuiz = triviaTask("quiz", { label: "ai.task.trivia.quiz", answerChars: capped });
export const triviaEtymology = triviaTask("etymology", { label: "ai.task.trivia.etymology", answerChars: capped });
export const triviaJoke = triviaTask("joke", { label: "ai.task.trivia.joke", answerChars: capped });
// No label: follow-ups come from the composer, not a button.
export const triviaFollowup = triviaTask("followup", {});

export const TRIVIA_TASKS = [triviaNext, triviaQuiz, triviaEtymology, triviaJoke, triviaFollowup];

export const TRIVIA_TASK_BY_KIND: Record<TriviaKind, AiTask<TriviaInput, TriviaAnswer>> = {
  next: triviaNext,
  quiz: triviaQuiz,
  etymology: triviaEtymology,
  joke: triviaJoke,
};
