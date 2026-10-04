import type { I18nKey } from "../../../core/i18n";
import { renderTemplate } from "../../../core/text/template";
import { AiError } from "../errors";
import { extractJson } from "../providers/stream";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// family.generate (規劃書 06 §6.3, §7.2, screens W3/L5): groups learned words
// into word families and suggests related new words. Structured output —
// the provider gets a JSON schema, parse() validates the shape and throws
// AiError("bad_output") when it doesn't hold.

export interface FamilyWord {
  word: string;
  partOfSpeech?: string;
  zh?: string;
}

export interface FamilyInput {
  // Learned words (§6.4: 已學單字 ＋ 詞性).
  known: FamilyWord[];
  // W3: grow families around these words. Empty = regroup the whole list (L5).
  seeds?: FamilyWord[];
  // Families that already exist, so a seeded search doesn't duplicate them.
  existingTopics?: string[];
}

export interface FamilyDraftMember {
  word: string;
  zh: string;
}

export interface FamilyDraft {
  topic: string;
  label: string;
  groups: { label: string; members: FamilyDraftMember[] }[];
}

// Strict-mode compatible (OpenAI json_schema strict, Anthropic
// output_config): every object closed, every property required.
export const FAMILY_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["families"],
  properties: {
    families: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "label", "groups"],
        properties: {
          topic: { type: "string", description: "English key, lowercase, e.g. clothing or gl-" },
          label: { type: "string", description: "繁體中文名稱，例如「服裝」「gl- 發光家族」" },
          groups: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "members"],
              properties: {
                label: { type: "string" },
                members: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["word", "zh"],
                    properties: {
                      word: { type: "string" },
                      zh: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const FAMILY_BASE_PROMPT = `你是一位英文字彙老師，幫一位以中文為母語的學習者把學過的單字整理成「字族」，並補上值得一起學的延伸字。

分群規則：
1. 字族可以依主題（例如 clothing 服裝）、字根字首或音組（例如 gl- 和光有關）、使用情境來分。每個字族底下再分 1 到 4 個小組，小組名稱用繁體中文。
2. 每個字族至少要有 2 個〔已學單字〕裡的字；這些字的 word 照〔已學單字〕的原樣寫，不要改成原形或其他詞形。
3. 每個字族可以補 2 到 5 個學習者還沒學、但和這個字族密切相關的常用延伸字，程度符合〔學習者設定〕；不要補罕見字。
4. zh 用繁體中文（台灣用語），10 個字以內。
5. 字根、字源只用可靠、常見的知識。不確定就不要用字根分群，改用主題分群，不要編造字源。
6. topic 用英文小寫；label 用繁體中文，可以夾英文字根（例如「gl- 發光家族」）。
7. 只輸出符合 schema 的 JSON。`;

export const FAMILY_TEMPLATES = {
  seeded: `任務：找字族
以〔起點單字〕為中心找出 1 到 3 個字族，每個字族都要包含至少一個起點單字。
〔起點單字〕
{{seeds}}{{#existingTopics}}

已經有的字族（不要重複）：{{existingTopics}}{{/existingTopics}}`,

  regroup: `任務：重新分群
把〔已學單字〕整理成 3 到 8 個字族。不一定每個字都要分進去，找不到合適字族的字可以略過；同一個字可以出現在不同字族。`,
} as const;

export const KNOWN_FAMILY_TEMPLATE = `〔已學單字〕（共 {{count}} 個）
{{words}}`;

function wordLine(w: FamilyWord): string {
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

// The JSON the provider returned: already parsed for native structured
// output, otherwise extracted from the text. A cut-off answer (max_tokens)
// is never valid JSON, so it's reported as bad_output rather than parsed.
export function structuredJson(r: AiResult): unknown {
  if (r.json !== undefined) return r.json;
  if (r.stop === "max_tokens") throw new AiError("bad_output", "Structured answer was cut off (max_tokens)");
  return extractJson(r.text);
}

export function parseFamilies(json: unknown): FamilyDraft[] {
  if (!isObj(json) || !Array.isArray(json.families)) {
    throw new AiError("bad_output", "family.generate: expected { families: [...] }");
  }
  const out: FamilyDraft[] = [];
  for (const f of json.families) {
    if (!isObj(f) || !Array.isArray(f.groups)) throw new AiError("bad_output", "family.generate: malformed family");
    const groups: FamilyDraft["groups"] = [];
    for (const g of f.groups) {
      if (!isObj(g) || !Array.isArray(g.members)) throw new AiError("bad_output", "family.generate: malformed group");
      const seen = new Set<string>();
      const members: FamilyDraftMember[] = [];
      for (const m of g.members) {
        if (!isObj(m)) throw new AiError("bad_output", "family.generate: malformed member");
        const word = str(m.word);
        const key = word.toLowerCase();
        if (!word || seen.has(key)) continue;
        seen.add(key);
        members.push({ word, zh: str(m.zh) });
      }
      if (members.length) groups.push({ label: str(g.label), members });
    }
    const topic = str(f.topic);
    if (!groups.length || !(topic || str(f.label))) continue;
    out.push({ topic: topic || str(f.label), label: str(f.label) || topic, groups });
  }
  return out;
}

const pendingKey = (key: string) => key as I18nKey;

export const familyGenerate: AiTask<FamilyInput, FamilyDraft[]> = {
  id: "family.generate",
  version: 1,
  surface: "family",
  label: pendingKey("ai.task.family.generate"),
  tier: "smart",
  // A full regroup lists many members; leave room for thinking too.
  maxTokens: 8192,
  // The learner's answer-length limit is for prose, not a JSON list.
  answerChars: () => 0,
  build(input: FamilyInput, ctx: TaskContext) {
    const seeds = input.seeds ?? [];
    const user = seeds.length
      ? renderTemplate(FAMILY_TEMPLATES.seeded, {
          seeds: seeds.map(wordLine).join("\n"),
          existingTopics: (input.existingTopics ?? []).join("、"),
        })
      : renderTemplate(FAMILY_TEMPLATES.regroup, {});
    return composeRequest({
      base: FAMILY_BASE_PROMPT,
      context: [renderTemplate(KNOWN_FAMILY_TEMPLATE, { count: input.known.length, words: input.known.map(wordLine).join("\n") })],
      profile: profileForTask(ctx.profile, familyGenerate, input),
      // Each generation stands alone.
      history: [],
      user,
      tier: familyGenerate.tier,
      maxTokens: familyGenerate.maxTokens,
      output: { name: "word_families", schema: FAMILY_SCHEMA },
    });
  },
  parse(r: AiResult): FamilyDraft[] {
    return parseFamilies(structuredJson(r));
  },
};

export const FAMILY_TASKS = [familyGenerate];
