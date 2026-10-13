import { ERROR_TAGS, normalizeErrorTag } from "../../../core/model/grammar";
import type { FocusKind, FocusRef } from "../../../core/model/learner";
import type { PolySense } from "../../../core/model/poly";
import { PRACTICE_KINDS, type PracticeKind, type ScenarioTrack } from "../../../core/model/practice";
import { renderTemplate } from "../../../core/text/template";
import type { GrammarRef, ScenarioRequest, VocabRef } from "../../practice/scenarioApi";
import { AiError } from "../errors";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import {
  DEFAULT_QUESTION_COUNT,
  MAX_LEAD,
  MAX_QUESTION_COUNT,
  MAX_WORDS,
  PREVIOUS_BLOCK_TEMPLATE,
  REFERENCE_BLOCK_TEMPLATE,
  SCENARIO_FORMS,
  WEAKNESS_BLOCK_TEMPLATE,
  WORDS_BLOCK_TEMPLATE,
  objectiveRef,
  type PreviousScenario,
  type ScenarioForm,
} from "./grammarQuestions";
import type { AiTask, TaskContext } from "./types";

// practice.scenario (第十七波 S): one structured call writes ONE scenario —
// a short dialogue or story — whose turns carry click-only questions for the
// 常用字 / 單字 / 混合 tabs. Same shape as grammar.questions (第十六波 G);
// ScenarioService stores the result as PracticeQuestions in the learner shard.

export const MAX_AVOID = 20;

export const POLY_ERROR_TAGS = [
  "sense-confusion",
  "light-verb",
  "preposition-time",
  "preposition-place",
  "preposition-other",
  "phrasal-verb",
  "collocation",
  "pos-confusion",
  "literal-figurative",
  "register",
] as const;
export const VOCAB_ERROR_TAGS = ["meaning", "form", "collocation", "confusable"] as const;

export type RefCategory = "poly" | "vocab" | "grammar";

const KINDS_BY_CATEGORY: Record<RefCategory, readonly PracticeKind[]> = {
  vocab: ["which-sense", "pick-word"],
  poly: ["which-sense", "pick-word", "same-sense"],
  grammar: ["choice", "find-error"],
};

export const PRACTICE_SCENARIO_BASE_PROMPT = `你是一位英文老師，用一段連續的情境幫一位以中文為母語的學習者做選擇題練習。〔出題參考〕是這次要考的重點，每個重點有固定的 id。

規則：
1. 只考〔出題參考〕裡標「考」的重點；每一題的 focusId 必須是清單裡標「考」的 id，不要自己發明。標「參考」的只能當錯誤選項或劇情。
2. 連貫：全部題目發生在同一個情境，依時間順序往下走，每一句都接得上前一句；讀完就是一段完整的對話或短文。有〔上一段〕時，從它的最後一句直接接著寫，人物和場景不變。可以穿插不出題的串場句，一組最多 3 句。
3. 只出點選的題型（見任務裡列的 kind），學習者不需要打任何字。
4. 有〔學習弱點〕時，先考弱點裡、而且在〔出題參考〕內的重點，最多占一半題數；其餘平均分配。同一個重點最多兩題，同一個重點不要連續出三題。
5. 每題只有一個正確答案。錯誤選項要「看起來可能對，但放在這個句子裡不對」；需要的話用前後文把答案鎖住。
6. 答題後的解說：
   - explanation：60 字以內，先點出句子裡的判斷依據，再說為什麼是這個答案。
   - optionNotes：每個錯誤選項一句，25 字以內，說它在什麼情況下才對。
   - sentenceZh：答案放回去之後整句的中文翻譯。
7. errorTag 只能從任務列出的清單選。
8. 句子難度符合〔學習者設定〕的程度，目標以外的生字越少越好；有〔已學單字〕時優先用裡面的字，但不要硬塞。
9. 不要重複〔已出過的句子〕。只用自然、常見的英文，不確定的用法不要出。所有句子都要原創。
10. 中文用繁體中文（台灣用語）；〔學習者設定〕指定其他回答語言時照它。
11. 只輸出符合 schema 的 JSON。`;

export const POLY_TEMPLATE = `任務：常用多義詞情境練習（{{words}}）
出 {{count}} 題。kind 可以用：which-sense（句子裡用 [[ ]] 標出目標字一次，options 是同一個字的 3–4 個意思，選項 id 用意思的 id、文字用中文意思）、pick-word（句子裡一個 ____，4 個英文字或片語，其中一個是練習的字）、same-sense（目標句用 [[ ]] 標出目標字，options 是 3–4 個用到同一個字的英文短句，只有一句意思相同）。比例約 4:4:2。
〔出題參考〕每行是 id｜意思｜例｜判斷線索。造句時讓正解的判斷線索出現在句子裡（或前一句）；optionNotes 用錯誤選項那個意思的判斷線索來說明。
errorTag 清單：{{errorTags}}`;

export const VOCAB_TEMPLATE = `任務：單字情境練習（{{n}} 個字）
出 {{count}} 題。kind 可以用：which-sense（[[目標字]] 標一次，options 是 3–4 個中文意思，選項 id 用 a/b/c/d）、pick-word（句子裡一個 ____，4 個英文字，錯誤選項取自同一批字）。
〔出題參考〕每行是 id｜單字｜中文｜詞性。errorTag 清單：{{errorTags}}`;

export const MIX_TEMPLATE = `任務：綜合情境練習
出 {{count}} 題，各類大約平均。每題用 focusId 標出考的是哪一個重點；kind 依該重點所屬的類別：單字（which-sense、pick-word）、常用字（which-sense、pick-word、same-sense）、文法（choice：一個 ____＋3–4 個選項；find-error：句中 3–4 個片段選出錯的）。
errorTag 清單：{{errorTags}}`;

export const AVOID_BLOCK_TEMPLATE = `〔已出過的句子〕
{{sentences}}`;

// ── request → reference lines / refs ──────────────────────────────

function polyLines(p: { tested: readonly PolySense[]; reference: readonly PolySense[] }): string[] {
  const line = (tag: string, s: PolySense) => `${tag} ${s.id}｜${s.zh}｜${s.example}｜${s.cue}`;
  return [...p.tested.map((s) => line("考", s)), ...p.reference.map((s) => line("參考", s))];
}
const vocabLines = (list: readonly VocabRef[]) => list.map((v) => `${v.id}｜${v.word}｜${v.zh}｜${v.pos}`);
const grammarLines = (list: readonly GrammarRef[]) =>
  list.map((g) => `${objectiveRef(g.topicId, g.objectiveId)}｜${g.text}｜${g.title}（${g.pattern}）`);

export interface FocusInfo {
  category: RefCategory;
  kind: FocusKind;
}

// What a request offers: the ids to test, and which word every sense id
// belongs to (reference senses included) for the which-sense option check.
export interface ScenarioRefs {
  tested: Map<string, FocusInfo>;
  senseWord: Map<string, string>;
}

export function refsOf(req: ScenarioRequest): ScenarioRefs {
  const tested = new Map<string, FocusInfo>();
  const senseWord = new Map<string, string>();
  const poly = req.track === "poly" ? req : req.track === "mix" ? req.poly : undefined;
  const vocab = req.track === "vocab" ? req.words : req.track === "mix" ? req.vocab : undefined;
  const grammar = req.track === "mix" ? req.grammar : undefined;
  for (const s of poly?.tested ?? []) tested.set(s.id, { category: "poly", kind: "sense" });
  for (const s of [...(poly?.tested ?? []), ...(poly?.reference ?? [])]) senseWord.set(s.id, s.word);
  for (const v of vocab ?? []) tested.set(v.id, { category: "vocab", kind: "word" });
  for (const g of grammar ?? []) tested.set(objectiveRef(g.topicId, g.objectiveId), { category: "grammar", kind: "grammar-objective" });
  return { tested, senseWord };
}

export function scenarioTrack(req: ScenarioRequest): ScenarioTrack {
  return req.track;
}

function errorTagsOf(req: ScenarioRequest): string[] {
  if (req.track === "poly") return [...POLY_ERROR_TAGS];
  if (req.track === "vocab") return [...VOCAB_ERROR_TAGS];
  const out: string[] = [];
  if (req.vocab?.length) out.push(...VOCAB_ERROR_TAGS);
  if (req.poly) out.push(...POLY_ERROR_TAGS);
  if (req.grammar?.length) out.push(...ERROR_TAGS);
  return [...new Set(out)];
}

// ── schema ────────────────────────────────────────────────────────

const ALL_TAGS = [...new Set<string>([...POLY_ERROR_TAGS, ...VOCAB_ERROR_TAGS, ...ERROR_TAGS])];

export const PRACTICE_SCENARIO_SCHEMA: JsonSchema = {
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
              required: ["focusId", "kind", "text", "options", "answerId", "explanation", "optionNotes", "sentenceZh", "errorTag"],
              properties: {
                focusId: { type: "string", description: "〔出題參考〕裡標「考」的 id（原樣照抄）" },
                kind: { type: "string", enum: [...PRACTICE_KINDS] },
                text: {
                  type: "string",
                  description:
                    "題幹。which-sense／same-sense：恰好一組 [[目標字]]；pick-word／choice：恰好一個 ____；find-error：完整一句（裡面有一處錯）",
                },
                options: {
                  type: "array",
                  description: "3–4 個選項",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "text"],
                    properties: { id: { type: "string" }, text: { type: "string" } },
                  },
                },
                answerId: { type: "string", description: "正解的選項 id" },
                explanation: { type: "string", description: "繁體中文，60 字以內" },
                optionNotes: {
                  type: "array",
                  description: "每個錯誤選項一句，說它在什麼情況下才對（25 字以內）",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "note"],
                    properties: { id: { type: "string", description: "錯誤選項的 id" }, note: { type: "string" } },
                  },
                },
                sentenceZh: { type: "string", description: "答案放回去之後整句的繁體中文翻譯" },
                errorTag: { type: "string", enum: ALL_TAGS, description: "學習者答錯時最可能犯的錯誤類型" },
              },
            },
          },
        },
      },
    },
  },
};

// ── parse ─────────────────────────────────────────────────────────

export interface PracticeQuestionDraft {
  focus: FocusRef;
  kind: PracticeKind;
  text: string;
  options: { id: string; text: string }[];
  answerId: string;
  explanation: string;
  optionNotes?: Record<string, string>;
  sentenceZh?: string;
  errorTag?: string;
  speaker?: string;
  lead?: { speaker?: string; text: string }[];
}

export interface PracticeScenarioDraft {
  scene: string;
  form: ScenarioForm;
  speakers?: string[];
  questions: PracticeQuestionDraft[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const uniq = (list: string[]): string[] => [...new Set(list)];

const GAP_RE = /_{3,}/g;
const MARK_RE = /\[\[[^[\]]+\]\]/g;

// The bare parser (no request to check against) guesses the category from
// the id's shape.
function inferInfo(id: string): FocusInfo {
  if (id.includes("/")) return { category: "grammar", kind: "grammar-objective" };
  if (id.includes(".")) return { category: "poly", kind: "sense" };
  return { category: "vocab", kind: "word" };
}

function parseOptions(v: unknown): { id: string; text: string }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { id: string; text: string }[] = [];
  for (const o of v) {
    if (typeof o === "string") {
      const t = o.trim();
      if (t) out.push({ id: t, text: t });
    } else if (isObj(o)) {
      const id = str(o.id);
      const text = str(o.text);
      if (!id || !text) return null;
      out.push({ id, text });
    }
  }
  return out;
}

// Wrong option id → note. Accepts the schema's [{id, note}] and a plain
// { id: note } object.
function parseNotes(v: unknown, options: { id: string; text: string }[], answerId: string): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, note: string) => {
    const opt = options.find((o) => o.id === key) ?? options.find((o) => o.text === key);
    if (opt && opt.id !== answerId && note) out[opt.id] = note;
  };
  if (Array.isArray(v)) {
    for (const n of v) if (isObj(n)) put(str(n.id) || str(n.option), str(n.note) || str(n.why));
  } else if (isObj(v)) {
    for (const [k, w] of Object.entries(v)) put(k.trim(), str(w));
  }
  return out;
}

export function parsePracticeQuestion(raw: unknown, refs?: ScenarioRefs): PracticeQuestionDraft | null {
  if (!isObj(raw)) return null;
  const focusId = str(raw.focusId);
  if (!focusId) return null;
  const info = refs ? refs.tested.get(focusId) : inferInfo(focusId);
  if (!info) return null;
  const kind = str(raw.kind) as PracticeKind;
  if (!KINDS_BY_CATEGORY[info.category].includes(kind)) return null;
  let text = str(raw.text);
  const explanation = str(raw.explanation);
  if (!text || !explanation) return null;

  const options = parseOptions(raw.options);
  if (!options || options.length < 3 || options.length > 4) return null;
  if (new Set(options.map((o) => o.id)).size !== options.length) return null;
  if (new Set(options.map((o) => o.text.toLowerCase())).size !== options.length) return null;
  const answerId = str(raw.answerId);
  if (!options.some((o) => o.id === answerId)) return null;

  if (kind === "which-sense" || kind === "same-sense") {
    if ((text.match(MARK_RE) ?? []).length !== 1) return null;
    if (/\[\[|\]\]/.test(text.replace(MARK_RE, ""))) return null;
  } else if (kind === "pick-word" || kind === "choice") {
    if ((text.match(GAP_RE) ?? []).length !== 1) return null;
    text = text.replace(GAP_RE, "____");
  } else {
    // find-error: every option is a piece of the sentence as written.
    if (/_{3,}/.test(text)) return null;
    if (!options.every((o) => text.includes(o.text))) return null;
  }

  if (info.category === "poly" && kind === "which-sense") {
    // The options are the meanings of the tested word, and the answer is
    // the very sense being tested.
    const word = refs?.senseWord.get(focusId) ?? focusId.split(".")[0];
    if (answerId !== focusId) return null;
    for (const o of options) {
      const w = refs ? refs.senseWord.get(o.id) : o.id.split(".")[0];
      if (w !== word) return null;
    }
  }

  const q: PracticeQuestionDraft = {
    focus: { kind: info.kind, id: focusId },
    kind,
    text,
    options,
    answerId,
    explanation,
  };
  const notes = parseNotes(raw.optionNotes, options, answerId);
  if (Object.keys(notes).length) q.optionNotes = notes;
  const zh = str(raw.sentenceZh);
  if (zh) q.sentenceZh = zh;
  const tag = str(raw.errorTag).toLowerCase();
  if (info.category === "grammar") q.errorTag = normalizeErrorTag(tag);
  else if ((info.category === "poly" ? POLY_ERROR_TAGS : VOCAB_ERROR_TAGS).includes(tag as never)) q.errorTag = tag;
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
export function parsePracticeScenario(json: unknown, refs?: ScenarioRefs): PracticeScenarioDraft {
  if (!isObj(json) || !Array.isArray(json.turns)) {
    throw new AiError("bad_output", "practice.scenario: expected { scene, form, turns: [...] }");
  }
  const scene = str(json.scene);
  if (!scene) throw new AiError("bad_output", "practice.scenario: no scene");
  const speakers = uniq(strList(json.speakers));
  const formRaw = str(json.form);
  const form: ScenarioForm = (SCENARIO_FORMS as readonly string[]).includes(formRaw)
    ? (formRaw as ScenarioForm)
    : speakers.length
      ? "dialogue"
      : "story";

  const questions: PracticeQuestionDraft[] = [];
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
    const q = parsePracticeQuestion(ask, refs);
    if (!q) continue;
    const key = q.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (speaker) q.speaker = speaker;
    if (lead.length) q.lead = lead.slice(-MAX_LEAD);
    lead = [];
    questions.push(q);
  }
  if (!questions.length || questions.length * 2 < asked) {
    throw new AiError("bad_output", `practice.scenario: only ${questions.length} of ${asked} questions usable`);
  }
  const out: PracticeScenarioDraft = { scene, form, questions };
  if (speakers.length) out.speakers = speakers;
  return out;
}

// ── task ──────────────────────────────────────────────────────────

export interface PracticeScenarioInput {
  request: ScenarioRequest;
  // Defaults to DEFAULT_QUESTION_COUNT.
  count?: number;
  // weaknessDigest() text, scoped to the focus ids sent; "" = none.
  weakness?: string;
  previous?: PreviousScenario;
  // 〔已學單字〕
  words?: string[];
  // 〔已出過的句子〕: the track's latest question texts.
  avoid?: string[];
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

// 〔出題參考〕 body and the task paragraph for a request.
function referenceAndTask(req: ScenarioRequest, count: number): { reference: string; user: string } {
  const errorTags = errorTagsOf(req).join("、");
  if (req.track === "poly") {
    const words = [...new Set(req.tested.map((s) => s.word))];
    return {
      reference: polyLines(req).join("\n"),
      user: renderTemplate(POLY_TEMPLATE, { words: words.join("、"), count, errorTags }),
    };
  }
  if (req.track === "vocab") {
    return {
      reference: vocabLines(req.words).join("\n"),
      user: renderTemplate(VOCAB_TEMPLATE, { n: req.words.length, count, errorTags }),
    };
  }
  const parts: string[] = [];
  if (req.vocab?.length) parts.push(`【單字】\n${vocabLines(req.vocab).join("\n")}`);
  if (req.poly && (req.poly.tested.length || req.poly.reference.length)) parts.push(`【常用字】\n${polyLines(req.poly).join("\n")}`);
  if (req.grammar?.length) parts.push(`【文法】\n${grammarLines(req.grammar).join("\n")}`);
  return { reference: parts.join("\n\n"), user: renderTemplate(MIX_TEMPLATE, { count, errorTags }) };
}

export const practiceScenario: AiTask<PracticeScenarioInput, PracticeScenarioDraft> = {
  id: "practice.scenario",
  version: 1,
  // No surface of its own yet; the base prompt is passed in explicitly.
  surface: "grammar",
  tier: "smart",
  maxTokens: 8192,
  answerChars: () => 0,
  build(input: PracticeScenarioInput, ctx: TaskContext) {
    const count = Math.max(1, Math.min(MAX_QUESTION_COUNT, Math.floor(input.count ?? DEFAULT_QUESTION_COUNT)));
    const { reference, user } = referenceAndTask(input.request, count);
    const words = clean(input.words, MAX_WORDS);
    const avoid = clean(input.avoid, MAX_AVOID);
    const weakness = (input.weakness ?? "").trim();
    const prev = input.previous;
    const context = [
      renderTemplate(REFERENCE_BLOCK_TEMPLATE, { lines: reference }),
      weakness ? renderTemplate(WEAKNESS_BLOCK_TEMPLATE, { weakness }) : "",
      prev && prev.scene.trim()
        ? renderTemplate(PREVIOUS_BLOCK_TEMPLATE, {
            scene: prev.scene.trim(),
            lines: prev.lastLines.slice(-2).map((l) => `- ${l}`).join("\n"),
          })
        : "",
      words.length ? renderTemplate(WORDS_BLOCK_TEMPLATE, { words: words.join(", ") }) : "",
      avoid.length ? renderTemplate(AVOID_BLOCK_TEMPLATE, { sentences: avoid.map((s) => `- ${s}`).join("\n") }) : "",
    ];
    return composeRequest({
      base: PRACTICE_SCENARIO_BASE_PROMPT,
      context,
      profile: ctx.profile,
      history: [],
      user,
      tier: practiceScenario.tier,
      maxTokens: practiceScenario.maxTokens,
      output: { name: "practice_scenario", schema: PRACTICE_SCENARIO_SCHEMA },
    });
  },
  parse(r: AiResult): PracticeScenarioDraft {
    return parsePracticeScenario(structuredJson(r));
  },
};

// The same task, but its parser also drops questions that point at an id
// the request didn't offer as 考 (and checks poly option ids against the
// request's senses). AiTask.parse only sees the AI's answer, so the service
// passes this per-request variant to runStructured.
export function practiceScenarioFor(req: ScenarioRequest): AiTask<PracticeScenarioInput, PracticeScenarioDraft> {
  const refs = refsOf(req);
  return { ...practiceScenario, parse: (r) => parsePracticeScenario(structuredJson(r), refs) };
}

export const PRACTICE_TASKS = [practiceScenario];
