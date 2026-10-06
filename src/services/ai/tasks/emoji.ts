import { renderTemplate } from "../../../core/text/template";
import { AiError } from "../errors";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// word.emoji (09 §4, §5.1 — EmojiService.ensure): a small, fast batch task
// that picks one emoji per word. Used both for words EmojiService hasn't
// seen yet (wordMeta has no emoji) and nowhere else — family.generate and
// family.expand ask for their own members' emoji inline instead of calling
// this task.

export interface EmojiWord {
  word: string;
  partOfSpeech?: string;
  zh?: string;
}

export interface WordEmojiInput {
  // EmojiService caps a batch at 30 before calling this task.
  words: EmojiWord[];
}

export interface WordEmojiItem {
  word: string;
  emoji: string;
}

export const WORD_EMOJI_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "emoji"],
        properties: {
          word: { type: "string", description: "照輸入的原樣寫" },
          emoji: { type: "string", description: "一個 emoji，只給一個；沒有完全對應的意思就挑最接近的，不要留空。" },
        },
      },
    },
  },
};

export const WORD_EMOJI_BASE_PROMPT = `你是一位幫英文單字挑選 emoji 的助理，讓一位以中文為母語的學習者能一眼認出這個字。

規則：
1. 每個字只給一個最能代表它意思的 emoji；平台常見、沒有爭議的優先。
2. 找不到完全對應的意思時，挑最接近、最相關的 emoji，不要留空、不要用問號或其他佔位符號代替。
3. 詞性和中文意思只是輔助判斷字義的線索，不要輸出它們，也不要編造字義。
4. word 欄位照〔單字清單〕的原樣寫，不要改成原形或其他詞形。
5. 只輸出符合 schema 的 JSON。`;

export const WORD_EMOJI_TEMPLATE = `〔單字清單〕（共 {{count}} 個，幫每個字挑一個 emoji）
{{words}}`;

export const WORD_EMOJI_USER_TEMPLATE = `任務：幫〔單字清單〕裡的每個字挑一個 emoji`;

function wordLine(w: EmojiWord): string {
  const pos = w.partOfSpeech?.trim();
  const zh = w.zh?.trim();
  return `- ${w.word}${pos ? `（${pos}）` : ""}${zh ? ` ${zh}` : ""}`;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseWordEmojiItems(json: unknown): WordEmojiItem[] {
  if (!isObj(json) || !Array.isArray(json.items)) {
    throw new AiError("bad_output", "word.emoji: expected { items: [...] }");
  }
  const out: WordEmojiItem[] = [];
  const seen = new Set<string>();
  for (const it of json.items) {
    if (!isObj(it)) throw new AiError("bad_output", "word.emoji: malformed item");
    const word = str(it.word);
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push({ word, emoji: str(it.emoji) });
  }
  return out;
}

export const wordEmoji: AiTask<WordEmojiInput, WordEmojiItem[]> = {
  id: "word.emoji",
  version: 1,
  surface: "word",
  tier: "fast",
  maxTokens: 1024,
  // Structured JSON, not prose.
  answerChars: () => 0,
  build(input: WordEmojiInput, ctx: TaskContext) {
    return composeRequest({
      base: WORD_EMOJI_BASE_PROMPT,
      context: [renderTemplate(WORD_EMOJI_TEMPLATE, { count: input.words.length, words: input.words.map(wordLine).join("\n") })],
      profile: profileForTask(ctx.profile, wordEmoji, input),
      history: [],
      user: renderTemplate(WORD_EMOJI_USER_TEMPLATE, {}),
      tier: wordEmoji.tier,
      maxTokens: wordEmoji.maxTokens,
      output: { name: "word_emoji", schema: WORD_EMOJI_SCHEMA },
    });
  },
  parse(r: AiResult): WordEmojiItem[] {
    return parseWordEmojiItems(structuredJson(r));
  },
};

export const EMOJI_TASKS = [wordEmoji];
