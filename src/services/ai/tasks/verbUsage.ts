import type { UsagePattern, UsageRelated } from "../../../core/model/usage";
import { renderTemplate } from "../../../core/text/template";
import { buildWordContext, type WordInput } from "../context/wordContext";
import { AiError } from "../errors";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// verb.usage (規劃書 06 §6.3, §7.3, screen L6): common patterns and related
// phrases for a verb, as structured output. The service stamps
// generatedAt/model and stores the result as VocabEntry.usage.

export interface VerbUsageDraft {
  patterns: UsagePattern[];
  related: UsageRelated[];
}

export const VERB_USAGE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["patterns", "related"],
  properties: {
    patterns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pattern", "meaningZh", "example"],
        properties: {
          pattern: { type: "string", description: "e.g. sugarcoat + 名詞 / sugarcoat it" },
          meaningZh: { type: "string" },
          example: { type: "string", description: "One natural English sentence" },
        },
      },
    },
    related: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "zh"],
        properties: {
          phrase: { type: "string" },
          zh: { type: "string" },
        },
      },
    },
  },
};

export const VERB_BASE_PROMPT = `你是一位英文字彙老師，幫一位以中文為母語的學習者整理一個英文動詞的常見用法。〔單字〕是這個字的資料。

規則：
1. patterns 列 3 到 5 個最常見的句型或搭配，依常見程度排序。pattern 用「動詞 + 名詞」「動詞 + to V」「動詞 + that 子句」「be + p.p.」這類寫法，或直接寫固定搭配（例如 sugarcoat it）；常見的衍生形容詞也可以列一個（例如 sugarcoated (adj.)）。
2. meaningZh 用繁體中文（台灣用語）說明這個句型的意思和使用時機，25 字以內。
3. example 是一個自然、完整的英文例句，程度符合〔學習者設定〕。
4. related 列 2 到 4 個意思相近或常一起出現的片語，zh 用繁體中文 10 字以內。
5. 只寫可靠、常見的用法，不確定的不要列，不要編造。
6. 只輸出符合 schema 的 JSON。`;

export const VERB_TEMPLATE = `任務：動詞用法（{{word}}）
整理 {{word}} 的常見句型與相近說法。{{#hasSource}}〔出處段落〕或〔出處句子〕裡的用法如果屬於其中一種，把那個句型排在第一個。{{/hasSource}}`;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseVerbUsage(json: unknown): VerbUsageDraft {
  if (!isObj(json) || !Array.isArray(json.patterns)) {
    throw new AiError("bad_output", "verb.usage: expected { patterns: [...], related: [...] }");
  }
  const patterns: UsagePattern[] = [];
  for (const p of json.patterns) {
    if (!isObj(p)) throw new AiError("bad_output", "verb.usage: malformed pattern");
    const pattern = str(p.pattern);
    if (pattern) patterns.push({ pattern, meaningZh: str(p.meaningZh), example: str(p.example) });
  }
  if (!patterns.length) throw new AiError("bad_output", "verb.usage: no patterns");
  const related: UsageRelated[] = [];
  for (const r of Array.isArray(json.related) ? json.related : []) {
    if (!isObj(r)) continue;
    const phrase = str(r.phrase);
    if (phrase) related.push({ phrase, zh: str(r.zh) });
  }
  return { patterns, related };
}

export const verbUsage: AiTask<WordInput, VerbUsageDraft> = {
  id: "verb.usage",
  version: 1,
  surface: "verb",
  label: "ai.task.verb.usage",
  tier: "smart",
  maxTokens: 4096,
  answerChars: () => 0,
  build(input: WordInput, ctx: TaskContext) {
    const c = buildWordContext(input);
    return composeRequest({
      base: VERB_BASE_PROMPT,
      context: [c.wordBlock],
      profile: profileForTask(ctx.profile, verbUsage, input),
      history: [],
      user: renderTemplate(VERB_TEMPLATE, c.slots),
      tier: verbUsage.tier,
      maxTokens: verbUsage.maxTokens,
      output: { name: "verb_usage", schema: VERB_USAGE_SCHEMA },
    });
  },
  parse(r: AiResult): VerbUsageDraft {
    return parseVerbUsage(structuredJson(r));
  },
};

export const VERB_TASKS = [verbUsage];
