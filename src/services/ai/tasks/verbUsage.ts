import { parsePos, type PosKey, type UsagePattern, type UsageRelated } from "../../../core/model/usage";
import { renderTemplate } from "../../../core/text/template";
import { buildWordContext, type WordInput } from "../context/wordContext";
import { AiError } from "../errors";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// verb.usage (規劃書 06 §6.3, §7.3, screen L6; wave 8 U1 — 1006-2 回饋 #17
// #18 #20: usage for every part of speech, one AI call, not just verbs).
// Task id kept as "verb.usage" (historical name; see VerbUsageService's
// header comment) even though it now covers every pos. The service
// stamps generatedAt/model per pos and stores the result on
// VocabEntry.usages.

export interface UsageInput extends WordInput {
  // Limits generation to one part of speech (VerbUsageService.regenerate,
  // U2's per-heading 「重新產生」). Undefined = every part of speech (#18).
  onlyPos?: PosKey;
}

export interface UsageEntryDraft {
  pos: PosKey;
  patterns: UsagePattern[];
  related: UsageRelated[];
}

export interface VerbUsageDraft {
  entries: UsageEntryDraft[];
}

const POS_CODES = "n/v/adj/adv/prep/conj/pron/interj";

export const VERB_USAGE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entries"],
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pos", "patterns", "related"],
        properties: {
          pos: { type: "string", description: `這個項目的詞性，填 ${POS_CODES} 之一` },
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
      },
    },
  },
};

export const VERB_BASE_PROMPT = `你是一位英文字彙老師，幫一位以中文為母語的學習者整理一個英文單字的常見用法。〔單字〕是這個字的資料。

規則：
1. 先判斷這個字常見的詞性，可能不只一種——字典資料（詞性欄）就算已經有詞性，也請你自己重新判斷一次，不要只照抄；常見的詞性都列出來，用 ${POS_CODES} 這組代碼表示（noun/verb/adjective/adverb/preposition/conjunction/pronoun/interjection）。
2. entries 裡每個詞性各佔一項，pos 填代碼。
3. patterns 列 3 到 5 個最常見的句型或搭配，依常見程度排序。pattern 用「動詞 + 名詞」「動詞 + to V」「動詞 + that 子句」「be + p.p.」這類寫法，或直接寫固定搭配（例如 sugarcoat it）；常見的衍生形容詞也可以列一個（例如 sugarcoated (adj.)）。名詞/形容詞等其他詞性也照樣列出最常見的搭配或句型。
4. meaningZh 用繁體中文（台灣用語）說明這個句型的意思和使用時機，25 字以內。
5. example 是一個自然、完整的英文例句，程度符合〔學習者設定〕。
6. related 列 2 到 4 個意思相近或常一起出現的片語，zh 用繁體中文 10 字以內。
7. 只寫可靠、常見的用法，不確定的不要列，不要編造。
8. 只輸出符合 schema 的 JSON。`;

export const VERB_TEMPLATE = `任務：用法（{{word}}）
列出 {{word}} 常見的詞性，整理每個詞性的常見句型與相近說法。{{#onlyPos}}這次只需要 {{onlyPos}} 這個詞性的用法，entries 只要一項。{{/onlyPos}}{{#hasSource}}〔出處段落〕或〔出處句子〕裡的用法如果屬於其中一種，把那個句型排在第一個。{{/hasSource}}`;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Parses the AI's answer into entries, one per usable part of speech.
// Robust by design (1006-2 #18): an entry whose pos doesn't resolve to any
// of our POS_KEYS is dropped (AI invented or garbled a code), and an entry
// left with no patterns after trimming is dropped too — the caller never
// has to special-case "this pos came back empty".
export function parseVerbUsage(json: unknown): VerbUsageDraft {
  if (!isObj(json) || !Array.isArray(json.entries)) {
    throw new AiError("bad_output", "verb.usage: expected { entries: [...] }");
  }
  const entries: UsageEntryDraft[] = [];
  for (const raw of json.entries) {
    if (!isObj(raw)) continue;
    const [pos] = parsePos(str(raw.pos));
    if (!pos) continue;
    const patterns: UsagePattern[] = [];
    for (const p of Array.isArray(raw.patterns) ? raw.patterns : []) {
      if (!isObj(p)) continue;
      const pattern = str(p.pattern);
      if (pattern) patterns.push({ pattern, meaningZh: str(p.meaningZh), example: str(p.example) });
    }
    if (!patterns.length) continue;
    const related: UsageRelated[] = [];
    for (const r of Array.isArray(raw.related) ? raw.related : []) {
      if (!isObj(r)) continue;
      const phrase = str(r.phrase);
      if (phrase) related.push({ phrase, zh: str(r.zh) });
    }
    entries.push({ pos, patterns, related });
  }
  if (!entries.length) throw new AiError("bad_output", "verb.usage: no usable part-of-speech entries");
  return { entries };
}

export const verbUsage: AiTask<UsageInput, VerbUsageDraft> = {
  id: "verb.usage",
  version: 2,
  surface: "verb",
  label: "ai.task.verb.usage",
  tier: "smart",
  maxTokens: 4096,
  answerChars: () => 0,
  build(input: UsageInput, ctx: TaskContext) {
    const c = buildWordContext(input);
    return composeRequest({
      base: VERB_BASE_PROMPT,
      context: [c.wordBlock],
      profile: profileForTask(ctx.profile, verbUsage, input),
      history: [],
      user: renderTemplate(VERB_TEMPLATE, { ...c.slots, onlyPos: input.onlyPos ?? "" }),
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
