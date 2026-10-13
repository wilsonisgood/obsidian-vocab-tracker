import { ERROR_TAGS, normalizeErrorTag, type ErrorTag, type GrammarQuestion, type GrammarQuestionType, type GrammarTopic } from "../../../core/model/grammar";
import { renderTemplate } from "../../../core/text/template";
import { AiError } from "../errors";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { profileForTask } from "./length";
import type { AiTask, TaskContext } from "./types";

// grammar.questions (wave 15 P, docs/feature/1013-grammar-report.md §1.3–§1.5,
// §3.3): one structured call writes a batch of practice questions for one
// grammar topic. Only choice / blank / find-error — the types that can be
// graded locally (§1.4); the batch is stored in the question bank
// (services/grammar/QuestionService) and asked from there.

export const DEFAULT_QUESTION_COUNT = 8;
export const MAX_WORDS = 30;
export const MAX_AVOID_STEMS = 40;

export const GENERATED_TYPES = ["choice", "blank", "find-error"] as const satisfies readonly GrammarQuestionType[];
export type GeneratedType = (typeof GENERATED_TYPES)[number];

export interface GrammarQuestionsInput {
  topic: GrammarTopic;
  // The objectives to cover (ids inside topic.objectives). Empty = all.
  objectiveIds: string[];
  // Defaults to DEFAULT_QUESTION_COUNT.
  count?: number;
  // Titles of the topics the learner has already worked on, so the sentences
  // may use those structures freely.
  knownTopicTitles: string[];
  // Words the learner saved (at most MAX_WORDS, may be empty).
  words: string[];
  // Stems this topic's bank already has (at most MAX_AVOID_STEMS).
  avoidStems: string[];
}

// What the AI writes; QuestionService adds id / topicId / timestamps.
export type GrammarQuestionDraft = Pick<
  GrammarQuestion,
  "objectiveId" | "type" | "stem" | "answer" | "explanation" | "errorTag"
> & {
  options?: string[];
  accepted?: string[];
  distractors?: Record<string, string>;
};

export const GRAMMAR_QUESTIONS_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["objectiveId", "type", "stem", "options", "answer", "accepted", "explanation", "distractors", "errorTag"],
        properties: {
          objectiveId: { type: "string", description: "考的是哪個學習目標（用清單裡的 id）" },
          type: { type: "string", enum: [...GENERATED_TYPES] },
          stem: { type: "string", description: "題幹。blank 恰好有一個 ___；find-error 是完整的一句話" },
          options: {
            type: "array",
            items: { type: "string" },
            description: "choice：3–4 個選項；find-error：3–4 個標在句子裡的片段（原文照抄）；blank：空陣列",
          },
          answer: { type: "string", description: "choice／blank：正解；find-error：錯的那個片段（必須是 options 其中一個）" },
          accepted: {
            type: "array",
            items: { type: "string" },
            description: "blank：其他同樣正確的寫法；find-error：accepted[0] 是改正後的寫法；choice：空陣列",
          },
          explanation: { type: "string", description: "繁體中文，為什麼這個答案對（60 字以內）" },
          distractors: {
            type: "array",
            description: "每個錯誤選項（blank 則是學習者常見的錯誤填法）為什麼錯",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["option", "why"],
              properties: {
                option: { type: "string" },
                why: { type: "string", description: "繁體中文，30 字以內" },
              },
            },
          },
          errorTag: { type: "string", enum: [...ERROR_TAGS], description: "學習者答錯時最可能犯的錯誤類型" },
        },
      },
    },
  },
};

export const GRAMMAR_QUESTIONS_BASE_PROMPT = `你是一位英文文法老師，幫一位以中文為母語的學習者寫文法練習題。〔文法主題〕是這次要練習的內容。

規則：
1. 只考〔文法主題〕列出的學習目標，一題只考一個目標；每個學習目標至少出一題，其餘的題數平均分配。不要考生字、拼字或文化常識。
2. 題型只能是三種，盡量混合使用：
   - choice：選擇題。題幹裡的空格寫成 ___，options 放 3 到 4 個選項，answer 是其中一個。
   - blank：填空題。題幹恰好有一個 ___，學習者自己打字；answer 是標準答案，其他同樣正確的寫法全部放進 accepted（包含常見的縮寫寫法）。
   - find-error：找錯題。stem 是一句完整的句子，裡面有一處文法錯誤；options 是 3 到 4 個從句子裡原文照抄的片段（逐字相同、包含那個錯誤的片段），answer 是錯的那個片段，accepted 的第一項是改正後的寫法。
3. 每一題的答案必須唯一。如果有兩種以上都合理的答案，要嘛全部放進 accepted（blank），要嘛改寫題目，讓答案只剩一個；不確定的題目寧可不出。
4. 句子要自然，像真實的英文文章、對話或日常場景會出現的句子，長度 6 到 18 個字，難度符合〔學習者設定〕與主題的難度；不要用冷僻字。句子裡的其他文法不要比主題更難。
5. 錯誤的選項要來自這位學習者真實常犯的錯（中文思維的直譯、混淆相似結構），不要放一看就荒謬的選項。
6. 題目要原創，不要抄寫或改寫任何出版教材、考古題裡的題目。
7. explanation 用繁體中文（台灣用語）說明為什麼正解是對的；distractors 對每個錯誤選項（blank 則是常見的錯誤填法，至少一個）各寫一句為什麼錯。
8. errorTag 從固定清單挑一個最貼近的：${ERROR_TAGS.join("、")}。
9. 〔避免重複〕列出的題幹這個主題已經有了，新題目的句子、情境都要不一樣。
10. 〔學習者的單字〕如果有，盡量用這些字造句，但不要讓單字變成題目的難點；沒有合適的就不用。
11. 〔已學過的文法〕裡的結構可以自由出現在句子裡。
12. 只輸出符合 schema 的 JSON。`;

export const TOPIC_BLOCK_TEMPLATE = `〔文法主題〕{{title}}（{{pattern}}）
一句話：{{summary}}
難度：{{difficulty}} / 9
學習目標：
{{objectives}}
{{#hint}}出題要求：{{hint}}
{{/hint}}`;

export const KNOWN_BLOCK_TEMPLATE = `〔已學過的文法〕{{titles}}`;
export const WORDS_BLOCK_TEMPLATE = `〔學習者的單字〕{{words}}`;
export const AVOID_BLOCK_TEMPLATE = `〔避免重複〕這個主題已經有的題幹：
{{stems}}`;

export const GRAMMAR_QUESTIONS_TEMPLATE = `任務：出 {{count}} 題「{{title}}」的練習題
學習目標 id 只能用：{{ids}}。{{#cover}}每個目標至少一題，{{/cover}}三種題型混合。`;

function clean(list: readonly string[] | undefined, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of list ?? []) {
    const v = (s ?? "").replace(/\s+/g, " ").trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

export function objectiveIdsFor(input: GrammarQuestionsInput): string[] {
  const all = input.topic.objectives.map((o) => o.id);
  const want = new Set(input.objectiveIds);
  const ids = all.filter((id) => want.has(id));
  return ids.length ? ids : all;
}

// ── parse ─────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}

function uniq(list: string[]): string[] {
  const out: string[] = [];
  for (const s of list) if (!out.includes(s)) out.push(s);
  return out;
}

const BLANK_RE = /_{3,}/g;

// Wrong option → why. Accepts the schema's [{option, why}] and a plain
// { option: why } object (models drift between the two).
function parseDistractors(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(v)) {
    for (const d of v) {
      if (!isObj(d)) continue;
      const option = str(d.option);
      const why = str(d.why);
      if (option && why) out[option] = why;
    }
  } else if (isObj(v)) {
    for (const [k, w] of Object.entries(v)) {
      const option = k.trim();
      const why = str(w);
      if (option && why) out[option] = why;
    }
  }
  return out;
}

// One question, or null when it's unusable. `objectiveIds` (when given)
// is the topic's objective list: a question that points elsewhere is dropped.
export function parseGrammarQuestion(raw: unknown, objectiveIds?: ReadonlySet<string>): GrammarQuestionDraft | null {
  if (!isObj(raw)) return null;
  const type = str(raw.type) as GeneratedType;
  if (!(GENERATED_TYPES as readonly string[]).includes(type)) return null;
  const objectiveId = str(raw.objectiveId);
  if (!objectiveId || (objectiveIds && !objectiveIds.has(objectiveId))) return null;
  let stem = str(raw.stem);
  let answer = str(raw.answer);
  const explanation = str(raw.explanation);
  if (!stem || !answer || !explanation) return null;
  const errorTag: ErrorTag = normalizeErrorTag(raw.errorTag);
  const distractorsAll = parseDistractors(raw.distractors);

  if (type === "blank") {
    const blanks = stem.match(BLANK_RE);
    if (!blanks || blanks.length !== 1) return null;
    stem = stem.replace(BLANK_RE, "___");
    const accepted = uniq(strList(raw.accepted)).filter((a) => a !== answer);
    const distractors = Object.fromEntries(Object.entries(distractorsAll).filter(([k]) => k !== answer));
    const q: GrammarQuestionDraft = { objectiveId, type, stem, answer, explanation, errorTag };
    if (accepted.length) q.accepted = accepted;
    if (Object.keys(distractors).length) q.distractors = distractors;
    return q;
  }

  const options = uniq(strList(raw.options));
  if (options.length < 3 || options.length > 4) return null;
  if (!options.includes(answer)) {
    // Case-only drift ("Have lost" vs "have lost") still names that option.
    const hit = options.find((o) => o.toLowerCase() === answer.toLowerCase());
    if (!hit) return null;
    answer = hit;
  }
  if (type === "choice") {
    // The gap (if the stem has one) is always written ___.
    stem = stem.replace(BLANK_RE, "___");
  } else {
    // find-error: every option is a piece of the sentence as written.
    if (!options.every((o) => stem.includes(o))) return null;
  }
  const distractors = Object.fromEntries(
    Object.entries(distractorsAll).filter(([k]) => k !== answer && options.includes(k))
  );
  const q: GrammarQuestionDraft = { objectiveId, type, stem, options, answer, explanation, errorTag };
  const accepted = uniq(strList(raw.accepted));
  // Only find-error keeps accepted (the corrected wording); a choice
  // question's answer is exactly one option.
  if (type === "find-error" && accepted.length) q.accepted = accepted;
  if (Object.keys(distractors).length) q.distractors = distractors;
  return q;
}

// Bad questions are dropped one by one; nothing usable left is bad_output.
export function parseGrammarQuestions(json: unknown, objectiveIds?: Iterable<string>): GrammarQuestionDraft[] {
  if (!isObj(json) || !Array.isArray(json.questions)) {
    throw new AiError("bad_output", "grammar.questions: expected { questions: [...] }");
  }
  const ids = objectiveIds ? new Set(objectiveIds) : undefined;
  const out: GrammarQuestionDraft[] = [];
  const seen = new Set<string>();
  for (const raw of json.questions) {
    const q = parseGrammarQuestion(raw, ids);
    if (!q) continue;
    const key = q.stem.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  if (!out.length) throw new AiError("bad_output", "grammar.questions: no usable questions");
  return out;
}

// ── task ──────────────────────────────────────────────────────────

export const grammarQuestions: AiTask<GrammarQuestionsInput, GrammarQuestionDraft[]> = {
  id: "grammar.questions",
  version: 1,
  surface: "grammar",
  tier: "smart",
  maxTokens: 8192,
  answerChars: () => 0,
  build(input: GrammarQuestionsInput, ctx: TaskContext) {
    const { topic } = input;
    const ids = objectiveIdsFor(input);
    const objectives = topic.objectives.filter((o) => ids.includes(o.id));
    const count = Math.max(1, Math.min(20, Math.floor(input.count ?? DEFAULT_QUESTION_COUNT)));
    const known = clean(input.knownTopicTitles, 60);
    const words = clean(input.words, MAX_WORDS);
    const avoid = clean(input.avoidStems, MAX_AVOID_STEMS);
    const context = [
      renderTemplate(TOPIC_BLOCK_TEMPLATE, {
        title: topic.title,
        pattern: topic.pattern,
        summary: topic.summary,
        difficulty: topic.difficulty,
        objectives: objectives.map((o) => `- ${o.id}：${o.text}`).join("\n"),
        hint: topic.promptHint?.trim(),
      }),
      known.length ? renderTemplate(KNOWN_BLOCK_TEMPLATE, { titles: known.join("、") }) : "",
      words.length ? renderTemplate(WORDS_BLOCK_TEMPLATE, { words: words.join(", ") }) : "",
      avoid.length ? renderTemplate(AVOID_BLOCK_TEMPLATE, { stems: avoid.map((s) => `- ${s}`).join("\n") }) : "",
    ];
    return composeRequest({
      base: GRAMMAR_QUESTIONS_BASE_PROMPT,
      context,
      profile: profileForTask(ctx.profile, grammarQuestions, input),
      history: [],
      user: renderTemplate(GRAMMAR_QUESTIONS_TEMPLATE, {
        count,
        title: topic.title,
        ids: ids.join("、"),
        cover: count >= ids.length ? "1" : "",
      }),
      tier: grammarQuestions.tier,
      maxTokens: grammarQuestions.maxTokens,
      output: { name: "grammar_questions", schema: GRAMMAR_QUESTIONS_SCHEMA },
    });
  },
  parse(r: AiResult): GrammarQuestionDraft[] {
    return parseGrammarQuestions(structuredJson(r));
  },
};

// The same task, but its parser also drops questions that point at an
// objective outside the topic. AiTask.parse only sees the AI's answer, so
// the service passes this per-topic variant to runStructured.
export function grammarQuestionsFor(topic: GrammarTopic): AiTask<GrammarQuestionsInput, GrammarQuestionDraft[]> {
  const ids = topic.objectives.map((o) => o.id);
  return { ...grammarQuestions, parse: (r) => parseGrammarQuestions(structuredJson(r), ids) };
}

export const GRAMMAR_TASKS = [grammarQuestions];
