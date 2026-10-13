import { ERROR_TAGS, normalizeErrorTag, type ErrorTag, type GrammarQuestion, type GrammarTopic } from "../../../core/model/grammar";
import { renderTemplate } from "../../../core/text/template";
import { AiError } from "../errors";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { isFullSentence } from "./sentenceCheck";
import type { AiTask, TaskContext } from "./types";

// grammar.questions (第十六波 G, 規劃書 12 §3): one structured call writes
// ONE scenario — a short dialogue or story — whose turns carry 5–6 click-only
// questions (choice / find-error) over several grammar topics. Nothing is
// typed: blank, rewrite and translate are no longer generated. The batch
// goes into the waiting pool (services/grammar/QuestionService).

export const DEFAULT_QUESTION_COUNT = 6;
export const MAX_QUESTION_COUNT = 10;
export const MAX_WORDS = 30;
export const MAX_AVOID_STEMS = 40;
export const MAX_SENTENCES = 3;
export const MAX_LEAD = 3;
const MAX_SENTENCE_CHARS = 300;

export const SCENARIO_TYPES = ["choice", "find-error"] as const;
export type ScenarioQuestionType = (typeof SCENARIO_TYPES)[number];
export const SCENARIO_FORMS = ["dialogue", "story"] as const;
export type ScenarioForm = (typeof SCENARIO_FORMS)[number];

export interface GrammarScenarioTarget {
  topic: GrammarTopic;
  // Objective ids inside topic.objectives. Empty = all.
  objectiveIds: string[];
}

export interface PreviousScenario {
  scene: string;
  // The last one or two sentences of that scenario, answers filled in.
  lastLines: string[];
}

export interface GrammarQuestionsInput {
  targets: GrammarScenarioTarget[];
  // Defaults to DEFAULT_QUESTION_COUNT.
  count?: number;
  // weaknessDigest() text (grammar only, scoped to these objectives); "" = none.
  weakness?: string;
  previous?: PreviousScenario;
  knownTopicTitles: string[];
  words: string[];
  avoidStems: string[];
  sentences?: { path: string; sentence: string }[];
}

// What the AI writes for one question; QuestionService adds the ids.
export type GrammarQuestionDraft = Pick<
  GrammarQuestion,
  "topicId" | "objectiveId" | "type" | "stem" | "answer" | "explanation" | "errorTag" | "source" | "sentenceZh"
> & {
  options: string[];
  accepted?: string[];
  distractors?: Record<string, string>;
  // Who says the sentence (dialogues).
  speaker?: string;
  // Turns without a question that come right before this one.
  lead?: { speaker?: string; text: string }[];
};

export interface GrammarScenarioDraft {
  scene: string;
  form: ScenarioForm;
  speakers?: string[];
  questions: GrammarQuestionDraft[];
}

export const GAP = "____";

export const GRAMMAR_QUESTIONS_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scene", "form", "speakers", "turns"],
  properties: {
    scene: { type: "string", description: "一句話交代情境（繁體中文），例如「在咖啡店點餐」" },
    form: { type: "string", enum: [...SCENARIO_FORMS] },
    speakers: { type: "array", items: { type: "string" }, description: "對話的人物名字；短文填空陣列" },
    turns: {
      type: "array",
      description: "依時間順序的句子，每一句接得上前一句",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["speaker", "text", "ask"],
        properties: {
          speaker: { type: "string", description: "這一句是誰說的；短文填空字串" },
          text: { type: "string", description: "串場句（不出題）的英文句子；有 ask 時填空字串" },
          ask: {
            type: "array",
            description: "這一句要出題就放一個題目，不出題放空陣列",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "objectiveId",
                "topicId",
                "type",
                "stem",
                "options",
                "answer",
                "accepted",
                "explanation",
                "distractors",
                "sentenceZh",
                "errorTag",
                "sourceIndex",
              ],
              properties: {
                objectiveId: { type: "string", description: "〔出題參考〕每行開頭「主題id/目標id」裡「/」後面的目標 id" },
                topicId: { type: "string", description: "〔出題參考〕每行開頭「/」前面的主題 id" },
                type: { type: "string", enum: [...SCENARIO_TYPES] },
                stem: {
                  type: "string",
                  description: "題幹。choice：這一句英文，恰好有一個 ____；find-error：完整的一句英文（裡面有一處錯）",
                },
                options: {
                  type: "array",
                  items: { type: "string" },
                  description: "choice：3–4 個選項；find-error：3–4 個標在句子裡的片段（原文照抄）",
                },
                answer: { type: "string", description: "choice：正解；find-error：錯的那個片段（必須是 options 其中一個）" },
                accepted: {
                  type: "array",
                  items: { type: "string" },
                  description: "find-error：accepted[0] 是改正後的寫法；choice：空陣列",
                },
                explanation: { type: "string", description: "繁體中文，60 字以內" },
                distractors: {
                  type: "array",
                  description: "每個錯誤選項一句，說它在什麼情況下才對（25 字以內）",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["option", "why"],
                    properties: { option: { type: "string" }, why: { type: "string" } },
                  },
                },
                sentenceZh: { type: "string", description: "答案放回去之後整句的繁體中文翻譯" },
                errorTag: { type: "string", enum: [...ERROR_TAGS], description: "學習者答錯時最可能犯的錯誤類型" },
                sourceIndex: {
                  type: "integer",
                  description: "這題改編自〔讀者讀過的句子〕的第幾句（從 1 開始）；不是改編的題目填 0",
                },
              },
            },
          },
        },
      },
    },
  },
};

export const GRAMMAR_QUESTIONS_BASE_PROMPT = `你是一位英文老師，用一段連續的情境幫一位以中文為母語的學習者做選擇題練習。〔出題參考〕是這次要考的重點，每個重點有固定的 id。

規則：
1. 只考〔出題參考〕裡的重點；每一題的 objectiveId 必須是清單裡的 id，不要自己發明。
2. 連貫：全部題目發生在同一個情境，依時間順序往下走，每一句都接得上前一句；讀完就是一段完整的對話或短文。有〔上一段〕時，從它的最後一句直接接著寫，人物和場景不變。可以穿插不出題的串場句，一組最多 3 句。
3. 只出點選的題型（choice、find-error），學習者不需要打任何字。
4. 有〔學習弱點〕時，先考弱點裡、而且在〔出題參考〕內的重點，最多占一半題數；其餘平均分配。同一個重點最多兩題，同一個重點不要連續出三題。
5. 每題只有一個正確答案。錯誤選項要「看起來可能對，但放在這個句子裡不對」；需要的話用前後文把答案鎖住。
6. 答題後的解說：
   - explanation：60 字以內，先點出句子裡的判斷依據，再說為什麼是這個答案。
   - distractors：每個錯誤選項一句，25 字以內，說它在什麼情況下才對。
   - sentenceZh：答案放回去之後整句的中文翻譯。
7. errorTag 只能從任務列出的清單選。
8. 句子難度符合〔學習者設定〕的程度，目標以外的生字越少越好；有〔已學單字〕時優先用裡面的字，但不要硬塞。
9. 不要重複〔避免重複〕裡的題幹。只用自然、常見的英文，不確定的用法不要出。所有句子都要原創，不要引用出版教材或考題。
10. 中文用繁體中文（台灣用語）；〔學習者設定〕指定其他回答語言時照它。
11. 只輸出符合 schema 的 JSON。
12. 每題的 stem 必須是情境裡一句完整、自然的英文句子（含主詞和動詞、至少 6 個英文字，不含中文）。不要把提問寫進 stem，提問由畫面顯示。
13. ____ 前後都要有足夠的上下文，____ 不能是句子的最後一個字（後面至少還有一個英文字）；介系詞、小品詞的空格後面一定要接它的受詞或補語。`;

export const REFERENCE_BLOCK_TEMPLATE = `〔出題參考〕
{{lines}}`;
export const WEAKNESS_BLOCK_TEMPLATE = `〔學習弱點〕
{{weakness}}`;
export const PREVIOUS_BLOCK_TEMPLATE = `〔上一段〕
場景：{{scene}}
最後兩句：
{{lines}}`;
export const SENTENCES_BLOCK_TEMPLATE = `〔讀者讀過的句子〕
{{sentences}}`;
export const KNOWN_BLOCK_TEMPLATE = `〔已學過的文法〕{{titles}}`;
export const WORDS_BLOCK_TEMPLATE = `〔已學單字〕{{words}}`;
export const AVOID_BLOCK_TEMPLATE = `〔避免重複〕已經出過的題幹：
{{stems}}`;

export const GRAMMAR_QUESTIONS_TEMPLATE = `任務：文法情境練習（{{topics}}）
出 {{count}} 題。type 可以用：choice（句子裡一個 ____＋3–4 個選項）、find-error（句子裡標出 3–4 個片段，選出錯的那個）。
〔出題參考〕每行是 objectiveId｜學習目標｜主題（句型）。
errorTag 清單：{{errorTags}}`;

// 〔出題參考〕 line ids are `topicId/objectiveId`.
export function objectiveRef(topicId: string, objectiveId: string): string {
  return `${topicId}/${objectiveId}`;
}

function cleanSentences(list: GrammarQuestionsInput["sentences"]): { path: string; sentence: string }[] {
  const out: { path: string; sentence: string }[] = [];
  const seen = new Set<string>();
  for (const x of list ?? []) {
    const sentence = (x?.sentence ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SENTENCE_CHARS);
    if (!sentence || seen.has(sentence.toLowerCase())) continue;
    seen.add(sentence.toLowerCase());
    out.push({ path: x.path, sentence });
    if (out.length >= MAX_SENTENCES) break;
  }
  return out;
}

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

// The (topic, objective) pairs a request offers, in order.
export function targetRefs(targets: readonly GrammarScenarioTarget[]): { topic: GrammarTopic; objective: GrammarTopic["objectives"][number] }[] {
  const out: { topic: GrammarTopic; objective: GrammarTopic["objectives"][number] }[] = [];
  for (const t of targets) {
    const want = new Set(t.objectiveIds);
    const objs = t.topic.objectives.filter((o) => want.has(o.id));
    for (const objective of objs.length ? objs : t.topic.objectives) out.push({ topic: t.topic, objective });
  }
  return out;
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

const GAP_RE = /_{3,}/g;

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

export interface ParseOptions {
  // The ids the request offered. A question pointing elsewhere is dropped.
  // Omitted = anything goes (the bare task parser).
  refs?: ReadonlySet<string>;
  // Sentences sent with the request; sourceIndex (1-based) maps back to them.
  sentences?: readonly { path: string; sentence: string }[];
}

// Works out which (topicId, objectiveId) a question points at: topicId and
// objectiveId fields, or a combined "topic/objective" in objectiveId.
function resolveRef(raw: Record<string, unknown>, refs: ReadonlySet<string> | undefined): { topicId: string; objectiveId: string } | null {
  let topicId = str(raw.topicId);
  let objectiveId = str(raw.objectiveId);
  if (objectiveId.includes("/")) {
    const [t, ...rest] = objectiveId.split("/");
    const o = rest.join("/");
    if (!topicId) topicId = t;
    if (topicId === t) objectiveId = o;
  }
  if (!objectiveId) return null;
  if (!refs) return topicId ? { topicId, objectiveId } : null;
  if (topicId) return refs.has(objectiveRef(topicId, objectiveId)) ? { topicId, objectiveId } : null;
  // No topic named: fine when exactly one offered topic has that objective.
  const hits = [...refs].filter((r) => r.endsWith(`/${objectiveId}`));
  if (hits.length !== 1) return null;
  return { topicId: hits[0].slice(0, hits[0].length - objectiveId.length - 1), objectiveId };
}

// One question, or null when it's unusable. blank / rewrite / translate and
// anything else that isn't a click question is refused.
export function parseScenarioQuestion(raw: unknown, opts: ParseOptions = {}): GrammarQuestionDraft | null {
  if (!isObj(raw)) return null;
  const type = str(raw.type) as ScenarioQuestionType;
  if (!(SCENARIO_TYPES as readonly string[]).includes(type)) return null;
  const ref = resolveRef(raw, opts.refs);
  if (!ref) return null;
  let stem = str(raw.stem);
  let answer = str(raw.answer);
  const explanation = str(raw.explanation);
  if (!stem || !answer || !explanation) return null;

  const options = uniq(strList(raw.options));
  if (options.length < 3 || options.length > 4) return null;
  if (!options.includes(answer)) {
    // Case-only drift ("Have lost" vs "have lost") still names that option.
    const hit = options.find((o) => o.toLowerCase() === answer.toLowerCase());
    if (!hit) return null;
    answer = hit;
  }
  if (type === "choice") {
    const gaps = stem.match(GAP_RE);
    if (!gaps || gaps.length !== 1) return null;
    stem = stem.replace(GAP_RE, GAP);
    if (!isFullSentence(stem)) return null;
  } else {
    // find-error: every option is a piece of the sentence as written, and
    // the sentence has no gap.
    if (stem.match(GAP_RE)) return null;
    if (!options.every((o) => stem.includes(o))) return null;
    if (!isFullSentence(stem)) return null;
  }

  const distractors = Object.fromEntries(
    Object.entries(parseDistractors(raw.distractors)).filter(([k]) => k !== answer && options.includes(k))
  );
  const q: GrammarQuestionDraft = {
    topicId: ref.topicId,
    objectiveId: ref.objectiveId,
    type,
    stem,
    options,
    answer,
    explanation,
    errorTag: normalizeErrorTag(raw.errorTag) as ErrorTag,
  };
  const accepted = uniq(strList(raw.accepted));
  // Only find-error keeps accepted (the corrected wording).
  if (type === "find-error" && accepted.length) q.accepted = accepted;
  if (Object.keys(distractors).length) q.distractors = distractors;
  const zh = str(raw.sentenceZh);
  if (zh) q.sentenceZh = zh;
  const idx = Number(raw.sourceIndex);
  const src = Number.isInteger(idx) && idx >= 1 ? opts.sentences?.[idx - 1] : undefined;
  if (src) q.source = { path: src.path, sentence: src.sentence };
  return q;
}

// `ask` is one object in the model's head and an array in the schema; take
// either (or null / nothing).
function askOf(turn: Record<string, unknown>): unknown {
  const a = turn.ask;
  if (Array.isArray(a)) return a.length ? a[0] : undefined;
  return isObj(a) ? a : undefined;
}

// Bad questions are dropped one by one. A scenario with fewer than half of
// its questions usable (or none) is bad_output. Lines without a question
// hang on the next question as `lead`.
export function parseGrammarScenario(json: unknown, opts: Omit<ParseOptions, "refs"> & { refs?: Iterable<string> } = {}): GrammarScenarioDraft {
  if (!isObj(json) || !Array.isArray(json.turns)) {
    throw new AiError("bad_output", "grammar.questions: expected { scene, form, turns: [...] }");
  }
  const parseOpts: ParseOptions = { ...opts, refs: opts.refs ? new Set(opts.refs) : undefined };
  const scene = str(json.scene);
  if (!scene) throw new AiError("bad_output", "grammar.questions: no scene");
  const speakers = uniq(strList(json.speakers));
  const form: ScenarioForm = (SCENARIO_FORMS as readonly string[]).includes(str(json.form))
    ? (str(json.form) as ScenarioForm)
    : speakers.length
      ? "dialogue"
      : "story";

  const questions: GrammarQuestionDraft[] = [];
  const seen = new Set<string>();
  let asked = 0;
  let lead: { speaker?: string; text: string }[] = [];
  for (const t of json.turns) {
    if (!isObj(t)) continue;
    const speaker = str(t.speaker);
    const ask = askOf(t);
    if (ask === undefined) {
      const text = str(t.text);
      if (text) lead.push(speaker ? { speaker, text } : { text });
      continue;
    }
    asked++;
    const q = parseScenarioQuestion(ask, parseOpts);
    if (!q) continue;
    const key = q.stem.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (speaker) q.speaker = speaker;
    if (lead.length) q.lead = lead.slice(-MAX_LEAD);
    lead = [];
    questions.push(q);
  }
  if (!questions.length || questions.length * 2 < asked) {
    throw new AiError("bad_output", `grammar.questions: only ${questions.length} of ${asked} questions usable`);
  }
  const out: GrammarScenarioDraft = { scene, form, questions };
  if (speakers.length) out.speakers = speakers;
  return out;
}

// ── task ──────────────────────────────────────────────────────────

export const grammarQuestions: AiTask<GrammarQuestionsInput, GrammarScenarioDraft> = {
  id: "grammar.questions",
  version: 3,
  surface: "grammar",
  tier: "smart",
  maxTokens: 8192,
  answerChars: () => 0,
  build(input: GrammarQuestionsInput, ctx: TaskContext) {
    const refs = targetRefs(input.targets);
    const count = Math.max(1, Math.min(MAX_QUESTION_COUNT, Math.floor(input.count ?? DEFAULT_QUESTION_COUNT)));
    const known = clean(input.knownTopicTitles, 60);
    const words = clean(input.words, MAX_WORDS);
    const avoid = clean(input.avoidStems, MAX_AVOID_STEMS);
    const sentences = cleanSentences(input.sentences);
    const weakness = (input.weakness ?? "").trim();
    const prev = input.previous;
    const titles = [...new Set(refs.map((r) => r.topic.title))];
    const context = [
      renderTemplate(REFERENCE_BLOCK_TEMPLATE, {
        lines: refs
          .map((r) => `${objectiveRef(r.topic.id, r.objective.id)}｜${r.objective.text}｜${r.topic.title}（${r.topic.pattern}）`)
          .join("\n"),
      }),
      weakness ? renderTemplate(WEAKNESS_BLOCK_TEMPLATE, { weakness }) : "",
      prev && prev.scene.trim()
        ? renderTemplate(PREVIOUS_BLOCK_TEMPLATE, {
            scene: prev.scene.trim(),
            lines: prev.lastLines.slice(-2).map((l) => `- ${l}`).join("\n"),
          })
        : "",
      known.length ? renderTemplate(KNOWN_BLOCK_TEMPLATE, { titles: known.join("、") }) : "",
      words.length ? renderTemplate(WORDS_BLOCK_TEMPLATE, { words: words.join(", ") }) : "",
      avoid.length ? renderTemplate(AVOID_BLOCK_TEMPLATE, { stems: avoid.map((s) => `- ${s}`).join("\n") }) : "",
      sentences.length
        ? renderTemplate(SENTENCES_BLOCK_TEMPLATE, { sentences: sentences.map((x, i) => `${i + 1}. ${x.sentence}`).join("\n") })
        : "",
    ];
    return composeRequest({
      base: GRAMMAR_QUESTIONS_BASE_PROMPT,
      context,
      profile: ctx.profile,
      history: [],
      user: renderTemplate(GRAMMAR_QUESTIONS_TEMPLATE, {
        topics: titles.join("、"),
        count,
        errorTags: ERROR_TAGS.join("、"),
      }),
      tier: grammarQuestions.tier,
      maxTokens: grammarQuestions.maxTokens,
      output: { name: "grammar_questions", schema: GRAMMAR_QUESTIONS_SCHEMA },
    });
  },
  parse(r: AiResult): GrammarScenarioDraft {
    return parseGrammarScenario(structuredJson(r));
  },
};

// The same task, but its parser also drops questions that point at an
// objective the request didn't offer and maps sourceIndex back to the
// sentences sent. AiTask.parse only sees the AI's answer, so the service
// passes this per-request variant to runStructured.
export function grammarQuestionsFor(
  targets: readonly GrammarScenarioTarget[],
  sentences: GrammarQuestionsInput["sentences"] = []
): AiTask<GrammarQuestionsInput, GrammarScenarioDraft> {
  const refs = targetRefs(targets).map((r) => objectiveRef(r.topic.id, r.objective.id));
  const sent = cleanSentences(sentences);
  return {
    ...grammarQuestions,
    parse: (r) => parseGrammarScenario(structuredJson(r), { refs, sentences: sent }),
  };
}

export const GRAMMAR_TASKS = [grammarQuestions];
