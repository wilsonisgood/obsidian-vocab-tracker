import { renderTemplate } from "../../../core/text/template";
import { AiError } from "../errors";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// paragraph.gloss (1030 #3 語境意思): after the learner discusses a
// paragraph (or a word in it), one fast call glosses the paragraph's words
// above their level — what each means *in this paragraph*, in Chinese and
// in short English. GlossService runs it at most once per paragraph text.

export interface GlossInput {
  title: string;
  paragraph: string;
  // Lowercased words to gloss (core/learner/gloss.ts glossCandidates).
  words: string[];
}

export interface GlossItem {
  word: string;
  pos: string;
  zh: string;
  en: string;
}

export const GLOSS_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "pos", "zh", "en"],
        properties: {
          word: { type: "string", description: "照〔要解釋的字〕的原樣寫（小寫）" },
          pos: { type: "string", description: "在這段裡的詞性縮寫：n. / v. / adj. / adv. / prep. / phr. …" },
          zh: { type: "string", description: "在這段裡的中文意思，精簡（2～12 字），不要列其他意思" },
          en: { type: "string", description: "在這段裡的英文解釋，一句短語（不超過 12 個字）" },
        },
      },
    },
  },
};

export const GLOSS_BASE_PROMPT = `你是一位英文閱讀老師，幫一位以中文為母語的學習者把文章段落裡的單字「照這段的語境」精準翻譯。

規則：
1. 每個字只給它在〔段落〕裡的那一個意思，不是字典上最常見的意思；片語動詞、慣用搭配要照整個搭配來翻。
2. 中文用繁體中文（台灣用語），精簡，像單字卡上的意思，不要寫成句子。
3. 英文解釋要比原字簡單，學習者看得懂。
4. 人名、地名、品牌、數字、縮寫，以及不需要解釋的極簡單字，直接不輸出。
5. word 欄位照〔要解釋的字〕的原樣寫，不要改成原形。
6. 只輸出符合 schema 的 JSON。`;

export const GLOSS_TEMPLATE = `〔文章〕{{title}}
〔段落〕
{{paragraph}}

〔要解釋的字〕（共 {{count}} 個）
{{words}}`;

export const GLOSS_USER_TEMPLATE = `任務：照〔段落〕的語境，解釋〔要解釋的字〕裡的每個字`;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Items without a Chinese meaning are dropped; with `asked`, so are words
// that weren't asked about (GlossService passes it).
export function parseGloss(json: unknown, asked: readonly string[]): GlossItem[] {
  if (!isObj(json) || !Array.isArray(json.items)) throw new AiError("bad_output", "paragraph.gloss: expected { items: [...] }");
  const want = new Set(asked);
  const seen = new Set<string>();
  const out: GlossItem[] = [];
  for (const it of json.items) {
    if (!isObj(it)) continue;
    const word = str(it.word).toLowerCase();
    const zh = str(it.zh);
    if (!word || !zh || seen.has(word) || (want.size && !want.has(word))) continue;
    seen.add(word);
    out.push({ word, pos: str(it.pos), zh, en: str(it.en) });
  }
  return out;
}

export const paragraphGloss: AiTask<GlossInput, GlossItem[]> = {
  id: "paragraph.gloss",
  version: 1,
  surface: "paragraph",
  tier: "fast",
  maxTokens: 4096,
  // Structured JSON, not prose.
  answerChars: () => 0,
  build(input: GlossInput, ctx: TaskContext) {
    return composeRequest({
      base: GLOSS_BASE_PROMPT,
      context: [
        renderTemplate(GLOSS_TEMPLATE, {
          title: input.title,
          paragraph: input.paragraph,
          count: input.words.length,
          words: input.words.map((w) => `- ${w}`).join("\n"),
        }),
      ],
      profile: profileForTask(ctx.profile, paragraphGloss, input),
      history: [],
      user: renderTemplate(GLOSS_USER_TEMPLATE, {}),
      tier: paragraphGloss.tier,
      maxTokens: paragraphGloss.maxTokens,
      output: { name: "paragraph_gloss", schema: GLOSS_SCHEMA },
    });
  },
  parse(r: AiResult): GlossItem[] {
    return parseGloss(structuredJson(r), []);
  },
};

export const GLOSS_TASKS = [paragraphGloss];
