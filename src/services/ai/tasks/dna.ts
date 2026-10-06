import type { MorphemeType } from "../../../core/model/morpheme";
import { renderTemplate } from "../../../core/text/template";
import { AiError } from "../errors";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// Word DNA (規劃書 09 §2 決定 2-5, §4, §5.3, §5.4): splits a word into
// prefix/root/suffix morphemes it shares with other words, matching
// existing morpheme records instead of duplicating them when it can
// (`morphemeRef` is either an existing id or a `ref` this same batch coins
// for a brand-new one), and suggests related words. `dna.expand` tops up a
// morpheme's own suggestion list on demand ("還有哪些字"). The three
// conversational tasks below (dna.examples/compare/followup, A9) are plain
// text, run through ThreadService like trivia's — one discussion thread
// per morpheme (morphemeThreadId()).

const TYPE_ZH: Record<MorphemeType, string> = { prefix: "字首", root: "字根", suffix: "字尾" };

// ── dna.analyze ──────────────────────────────────────────────────────

export const MAX_ANALYZE_WORDS = 10;
export const MAX_KNOWN_MORPHEMES = 200;

export interface DnaAnalyzeWord {
  word: string;
  partOfSpeech?: string;
  zh?: string;
}

// An existing morpheme record, trimmed to what the model needs to match
// against (決定 2: "同一個字素一定要回傳既有 id").
export interface DnaKnownMorpheme {
  id: string;
  type: MorphemeType;
  form: string;
  variants: string[];
}

export interface DnaAnalyzeInput {
  words: DnaAnalyzeWord[];
  knownMorphemes: DnaKnownMorpheme[];
}

export interface DnaPart {
  text: string;
  type: MorphemeType | "inflection";
  meaningZh: string;
  // An existing morpheme's id, this response's own morphemes[].ref, or ""
  // for an inflection part.
  morphemeRef: string;
}

export interface DnaWordResult {
  word: string;
  emoji: string;
  status: "ok" | "none";
  parts: DnaPart[];
  gloss: string;
}

export interface DnaMorphemeResult {
  ref: string;
  type: MorphemeType;
  form: string;
  variants: string[];
  meaningZh: string;
  origin: string;
  timeline: { stage: string; form: string }[];
  factTitle: string;
  factBody: string;
  suggested: { word: string; zh: string; emoji: string }[];
}

export interface DnaAnalyzeOutput {
  words: DnaWordResult[];
  morphemes: DnaMorphemeResult[];
}

// Strict-mode compatible, same as family.ts's FAMILY_SCHEMA.
export const DNA_ANALYZE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["words", "morphemes"],
  properties: {
    words: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "emoji", "status", "parts", "gloss"],
        properties: {
          word: { type: "string" },
          emoji: { type: "string", description: "一個最能代表這個字意思的 emoji" },
          status: { type: "string", enum: ["ok", "none"], description: "none = 拆不出字首/字根/字尾（例如 knife、jar）" },
          parts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "type", "meaningZh", "morphemeRef"],
              properties: {
                text: { type: "string" },
                type: { type: "string", enum: ["prefix", "root", "suffix", "inflection"] },
                meaningZh: { type: "string" },
                morphemeRef: {
                  type: "string",
                  description: "既有字素的 id、這次回應 morphemes[] 裡的 ref，或屈折字尾（inflection）留空字串",
                },
              },
            },
          },
          gloss: { type: "string" },
        },
      },
    },
    morphemes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "type", "form", "variants", "meaningZh", "origin", "timeline", "factTitle", "factBody", "suggested"],
        properties: {
          ref: { type: "string" },
          type: { type: "string", enum: ["prefix", "root", "suffix"] },
          form: { type: "string" },
          variants: { type: "array", items: { type: "string" } },
          meaningZh: { type: "string" },
          origin: { type: "string" },
          timeline: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["stage", "form"],
              properties: { stage: { type: "string" }, form: { type: "string" } },
            },
          },
          factTitle: { type: "string", description: "不確定、各家說法不一就留空字串" },
          factBody: { type: "string" },
          suggested: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["word", "zh", "emoji"],
              properties: { word: { type: "string" }, zh: { type: "string" }, emoji: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

export const DNA_ANALYZE_BASE_PROMPT = `你是英文構詞（word DNA）專家，幫一位以中文為母語的學習者把英文單字拆成字首、字根、字尾，並標出每個字已經有的字素記錄。

規則：
1. 〔已知字素〕是系統裡已經存在的字首/字根/字尾記錄（含常見變體拼法）。同一個字素（例如 ten、tin、tain 這種同源變體）出現在新的字裡時，一定要用它既有的 id 當 morphemeRef，不要當成新字素重複建立。
2. 〔已知字素〕裡沒有的才放進 morphemes[]，用你自己取的 ref（任意字串，這次回應裡不要重複）標記，parts 裡用這個 ref 當 morphemeRef。
3. 字源、時間軸、冷知識只用有共識、可靠的知識；不確定、或各家說法不一，就 timeline 給空陣列、factTitle/factBody 給空字串，不要編造。
4. 規則性的字尾變化（-s -es -ed -ing -er -est 等單純詞形變化，不是獨立的構詞字素）一律標成 "inflection"，morphemeRef 留空字串，不要幫它建立字素。
5. 真的拆不出字首/字根/字尾（像 knife、jar 這種本身就是一個詞素的字）就 status 設 "none"、parts 給空陣列；gloss 仍填這個字整體的意思。
6. 每個新字素補 3 到 5 個常見、但不在〔要分析的單字〕裡的延伸字當 suggested。
7. 只輸出符合 schema 的 JSON。`;

function wordLine(w: DnaAnalyzeWord): string {
  const pos = w.partOfSpeech?.trim();
  const zh = w.zh?.trim();
  return `- ${w.word}${pos ? `（${pos}）` : ""}${zh ? ` ${zh}` : ""}`;
}

function knownLine(m: DnaKnownMorpheme): string {
  const variants = m.variants.length ? `／${m.variants.join("、")}` : "";
  return `- [${m.id}] ${TYPE_ZH[m.type]} ${m.form}${variants}`;
}

const ANALYZE_TEMPLATE = `〔已知字素〕（{{knownCount}} 個）
{{known}}

〔要分析的單字〕（{{count}} 個）
{{words}}`;

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStrArr(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

const PART_TYPES = new Set(["prefix", "root", "suffix", "inflection"]);
const MORPHEME_TYPES = new Set(["prefix", "root", "suffix"]);

function parsePart(p: unknown): DnaPart {
  if (
    !isObj(p) ||
    typeof p.text !== "string" ||
    typeof p.type !== "string" ||
    !PART_TYPES.has(p.type) ||
    typeof p.meaningZh !== "string" ||
    typeof p.morphemeRef !== "string"
  ) {
    throw new AiError("bad_output", "dna.analyze: malformed part");
  }
  return { text: p.text, type: p.type as DnaPart["type"], meaningZh: p.meaningZh, morphemeRef: p.morphemeRef };
}

function parseWord(w: unknown): DnaWordResult {
  if (
    !isObj(w) ||
    typeof w.word !== "string" ||
    !w.word.trim() ||
    typeof w.emoji !== "string" ||
    (w.status !== "ok" && w.status !== "none") ||
    !Array.isArray(w.parts) ||
    typeof w.gloss !== "string"
  ) {
    throw new AiError("bad_output", "dna.analyze: malformed word");
  }
  return { word: w.word.trim(), emoji: w.emoji, status: w.status, parts: w.parts.map(parsePart), gloss: w.gloss };
}

function parseTimeline(v: unknown): { stage: string; form: string }[] {
  if (!Array.isArray(v)) throw new AiError("bad_output", "dna.analyze: malformed timeline");
  return v.map((t) => {
    if (!isObj(t) || typeof t.stage !== "string" || typeof t.form !== "string") {
      throw new AiError("bad_output", "dna.analyze: malformed timeline entry");
    }
    return { stage: t.stage, form: t.form };
  });
}

function parseSuggestedWords(v: unknown, errPrefix: string): { word: string; zh: string; emoji: string }[] {
  if (!Array.isArray(v)) throw new AiError("bad_output", `${errPrefix}: malformed suggested`);
  const out: { word: string; zh: string; emoji: string }[] = [];
  const seen = new Set<string>();
  for (const s of v) {
    if (!isObj(s) || typeof s.word !== "string" || typeof s.zh !== "string" || typeof s.emoji !== "string") {
      throw new AiError("bad_output", `${errPrefix}: malformed suggested entry`);
    }
    const word = s.word.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push({ word, zh: s.zh, emoji: s.emoji });
  }
  return out;
}

function parseMorpheme(m: unknown): DnaMorphemeResult {
  if (
    !isObj(m) ||
    typeof m.ref !== "string" ||
    !m.ref.trim() ||
    typeof m.type !== "string" ||
    !MORPHEME_TYPES.has(m.type) ||
    typeof m.form !== "string" ||
    !m.form.trim() ||
    !isStrArr(m.variants) ||
    typeof m.meaningZh !== "string" ||
    typeof m.origin !== "string" ||
    typeof m.factTitle !== "string" ||
    typeof m.factBody !== "string"
  ) {
    throw new AiError("bad_output", "dna.analyze: malformed morpheme");
  }
  return {
    ref: m.ref,
    type: m.type as MorphemeType,
    form: m.form,
    variants: m.variants,
    meaningZh: m.meaningZh,
    origin: m.origin,
    timeline: parseTimeline(m.timeline),
    factTitle: m.factTitle,
    factBody: m.factBody,
    suggested: parseSuggestedWords(m.suggested, "dna.analyze"),
  };
}

export function parseDnaAnalyze(json: unknown): DnaAnalyzeOutput {
  if (!isObj(json) || !Array.isArray(json.words) || !Array.isArray(json.morphemes)) {
    throw new AiError("bad_output", "dna.analyze: expected { words, morphemes }");
  }
  return { words: json.words.map(parseWord), morphemes: json.morphemes.map(parseMorpheme) };
}

export const dnaAnalyze: AiTask<DnaAnalyzeInput, DnaAnalyzeOutput> = {
  id: "dna.analyze",
  version: 1,
  surface: "morpheme",
  tier: "fast",
  maxTokens: 4096,
  // Structured JSON, not prose — same reasoning as family.generate.
  answerChars: () => 0,
  build(input: DnaAnalyzeInput, ctx: TaskContext) {
    const words = input.words.slice(0, MAX_ANALYZE_WORDS);
    const known = input.knownMorphemes.slice(0, MAX_KNOWN_MORPHEMES);
    return composeRequest({
      base: DNA_ANALYZE_BASE_PROMPT,
      profile: profileForTask(ctx.profile, dnaAnalyze, input),
      history: [],
      user: renderTemplate(ANALYZE_TEMPLATE, {
        knownCount: known.length,
        known: known.map(knownLine).join("\n") || "（無）",
        count: words.length,
        words: words.map(wordLine).join("\n"),
      }),
      tier: "fast",
      maxTokens: 4096,
      output: { name: "word_dna", schema: DNA_ANALYZE_SCHEMA },
    });
  },
  parse(r: AiResult): DnaAnalyzeOutput {
    return parseDnaAnalyze(structuredJson(r));
  },
};

// ── dna.expand ───────────────────────────────────────────────────────

export interface DnaExpandMorpheme {
  type: MorphemeType;
  form: string;
  variants: string[];
  meaningZh: string;
}

export interface DnaExpandInput {
  morpheme: DnaExpandMorpheme;
  // Words already learned or already suggested for this morpheme — don't
  // repeat them.
  exclude: string[];
}

export interface DnaExpandWord {
  word: string;
  zh: string;
  emoji: string;
}

export interface DnaExpandOutput {
  words: DnaExpandWord[];
}

export const DNA_EXPAND_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["words"],
  properties: {
    words: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "zh", "emoji"],
        properties: { word: { type: "string" }, zh: { type: "string" }, emoji: { type: "string" } },
      },
    },
  },
};

export const DNA_EXPAND_BASE_PROMPT = `你是英文構詞（word DNA）專家，根據一個字首/字根/字尾，幫學習者推薦幾個用到它、但他還沒學過的常見字。

規則：
1. 字要常見、實用，符合〔學習者設定〕的程度；不要補罕見字或生造字。
2. 不要推薦〔已經有的字〕裡列出的字。
3. 建議 3 到 5 個字，zh 用繁體中文（台灣用語），10 個字以內。
4. emoji 給一個最能代表這個字意思的 emoji。
5. 只輸出符合 schema 的 JSON。`;

const EXPAND_TEMPLATE = `任務：延伸字
〔這個字素〕{{form}}（{{type}}）：{{meaningZh}}{{#variants}}
變體：{{variants}}{{/variants}}

{{#exclude}}〔已經有的字〕（不要重複）：{{exclude}}{{/exclude}}`;

export function parseDnaExpand(json: unknown): DnaExpandOutput {
  if (!isObj(json) || !Array.isArray(json.words)) throw new AiError("bad_output", "dna.expand: expected { words }");
  return { words: parseSuggestedWords(json.words, "dna.expand") };
}

export const dnaExpand: AiTask<DnaExpandInput, DnaExpandOutput> = {
  id: "dna.expand",
  version: 1,
  surface: "morpheme",
  tier: "fast",
  maxTokens: 1024,
  answerChars: () => 0,
  build(input: DnaExpandInput, ctx: TaskContext) {
    return composeRequest({
      base: DNA_EXPAND_BASE_PROMPT,
      profile: profileForTask(ctx.profile, dnaExpand, input),
      history: [],
      user: renderTemplate(EXPAND_TEMPLATE, {
        form: input.morpheme.form,
        type: TYPE_ZH[input.morpheme.type],
        meaningZh: input.morpheme.meaningZh,
        variants: input.morpheme.variants.join("、"),
        exclude: input.exclude.join("、"),
      }),
      tier: "fast",
      maxTokens: 1024,
      output: { name: "dna_expand", schema: DNA_EXPAND_SCHEMA },
    });
  },
  parse(r: AiResult): DnaExpandOutput {
    return parseDnaExpand(structuredJson(r));
  },
};

// ── Conversation (A9): dna.examples / dna.compare / dna.followup ──────
//
// Plain text, run through ThreadService (like trivia.ts) — no parse, no
// label (buttons are DU's own, not a registry-driven quick action; adding
// `label` would need a new I18nKey in the shared i18n files).

export interface DnaChatMorpheme {
  type: MorphemeType;
  form: string;
  meaningZh: string;
}

export interface DnaChatWord {
  word: string;
  partOfSpeech?: string;
  zh?: string;
}

export interface DnaChatInput {
  // Absent only if the morpheme record vanished before a follow-up could
  // be asked (defensive — shouldn't happen in practice).
  morpheme?: DnaChatMorpheme;
  // The morpheme's already-learned words (examples: up to 5; compare: up
  // to 3) — MorphemeService picks and caps these before building input.
  words: DnaChatWord[];
  question?: string;
  selection?: string;
}

export const DNA_CHAT_BASE_PROMPT = `你是一位英文構詞（word DNA）老師，幫一位以中文為母語的學習者理解一個字首/字根/字尾，並且只用他已經學過的字來說明。〔這個字素〕是現在討論的字素，〔已學單字〕是用到這個字素、他已經學過的字。

回答規則：
1. 預設用繁體中文（台灣用語）回答，英文單字與例句保留英文。
2. 只講可靠、有根據的知識。不確定就直接說「不確定」或「說法不一」，不要編造字源、年代或出處。
3. 回答直接進入內容，不用標題（不要用 #），用 Markdown，重點用粗體。
4. 只用〔已學單字〕列出的字舉例，不要混入他還沒學過的字。`;

const MORPHEME_BLOCK_TEMPLATE = `〔這個字素〕{{form}}（{{type}}）：{{meaningZh}}`;
const WORDS_BLOCK_TEMPLATE = `〔已學單字〕
{{words}}`;

const SELECTION_HEADER = `{{#selection}}〔選取的文字〕
{{selection}}

{{/selection}}`;

export const DNA_CHAT_TEMPLATES = {
  examples: `任務：造句
用〔已學單字〕裡的每個字各造一句例句（最多 5 句），把這個字素在句子裡對應的部分用粗體標出來。`,

  compare: `任務：用法比較
比較〔已學單字〕裡這幾個字的用法差異：意思、語氣、常見搭配哪裡不一樣。`,

  followup: `${SELECTION_HEADER}〔使用者的追問〕
{{question}}

接著前面的對話回答，不用寫標題。`,
} as const;

export type DnaChatKind = Exclude<keyof typeof DNA_CHAT_TEMPLATES, "followup">;

function dnaChatWordLine(w: DnaChatWord): string {
  const pos = w.partOfSpeech?.trim();
  const zh = w.zh?.trim();
  return `- ${w.word}${pos ? `（${pos}）` : ""}${zh ? ` ${zh}` : ""}`;
}

function dnaChatTask(id: keyof typeof DNA_CHAT_TEMPLATES): AiTask<DnaChatInput, string> {
  const task: AiTask<DnaChatInput, string> = {
    id: `dna.${id}`,
    version: 1,
    surface: "morpheme",
    tier: "smart",
    maxTokens: 2048,
    build(input: DnaChatInput, ctx: TaskContext) {
      const m = input.morpheme;
      const morphemeBlock = m
        ? renderTemplate(MORPHEME_BLOCK_TEMPLATE, { form: m.form, type: TYPE_ZH[m.type], meaningZh: m.meaningZh })
        : "";
      const wordsBlock = input.words.length
        ? renderTemplate(WORDS_BLOCK_TEMPLATE, { words: input.words.map(dnaChatWordLine).join("\n") })
        : "";
      return composeRequest({
        base: DNA_CHAT_BASE_PROMPT,
        cached: [morphemeBlock].filter(Boolean),
        context: [wordsBlock].filter(Boolean),
        profile: profileForTask(ctx.profile, task, input),
        history: ctx.history,
        user: renderTemplate(DNA_CHAT_TEMPLATES[id], {
          selection: input.selection?.trim(),
          question: input.question?.trim(),
        }),
        tier: task.tier,
        maxTokens: task.maxTokens,
      });
    },
  };
  return task;
}

export const dnaExamples = dnaChatTask("examples");
export const dnaCompare = dnaChatTask("compare");
// No label: asked from the composer (free-form follow-up), not a button.
export const dnaFollowup = dnaChatTask("followup");

export const DNA_TASKS = [dnaAnalyze, dnaExpand, dnaExamples, dnaCompare, dnaFollowup];
