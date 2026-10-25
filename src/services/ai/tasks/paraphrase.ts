import type { ParagraphRef } from "../../../core/practice/paraphrase";
import { renderTemplate } from "../../../core/text/template";
import { AiError } from "../errors";
import type { AiResult, JsonSchema } from "../providers/types";
import { composeRequest } from "./compose";
import { structuredJson } from "./family";
import { MAX_LEAD, WEAKNESS_BLOCK_TEMPLATE } from "./grammarQuestions";
import { parseNotes, parseOptions, type PracticeQuestionDraft, type PracticeScenarioDraft } from "./practiceScenario";
import { hasCjk, englishWords } from "./sentenceCheck";
import type { AiTask, TaskContext } from "./types";

// practice.paraphrase (換句話說): one structured call writes paraphrase
// questions on ONE paragraph the learner discussed — 「哪一句的意思跟原句相同」,
// the sentence being the paragraph's own. The result has the scenario
// draft's shape, so ScenarioService stores and pools it like any other
// track; the paragraph's sentences between two questions become `lead`, so
// the player reads through the paragraph in order.

export const PARAPHRASE_ERROR_TAGS = [
  "para-negation",
  "para-cause",
  "para-scope",
  "para-time",
  "para-actor",
  "para-certainty",
  "para-detail",
  "para-word",
] as const;

export const MAX_PARAPHRASE_COUNT = 6;
const MIN_OPTION_WORDS = 4;

export const PARAPHRASE_BASE_PROMPT = `你是一位英文閱讀老師，幫一位以中文為母語的學習者練習「換句話說」（paraphrase）：從他讀過、而且討論過的文章段落挑句子，出「哪一句的意思跟原句相同」的選擇題。

規則：
1. 只能從〔段落句子〕挑句子出題，每題用 sourceIndex 標出是第幾句（照抄編號）；同一句只出一題。
2. 有〔討論過的地方〕時，優先挑含有那些字詞或句型的句子；錯誤選項也優先針對那些地方設計（例如學習者問過 hardly，就做一個把否定意思弄反的選項）。
3. 每題 4 個英文選項，都是完整的句子：
   - 正解：意思和原句完全相同，但主要的字詞和句型都換過（同義字、主動被動、子句改寫、詞性轉換、拆句或合句），不要只換一兩個字；不增加、也不省略任何資訊。
   - 3 個錯誤選項：乍看很像正解，但意思有一處關鍵不同——否定弄反、因果或條件顛倒、範圍或程度改變（all／some、always／often）、時間先後改變、誰做了什麼對調、確定程度改變（may／must）、多加或漏掉重要資訊、關鍵字詞理解錯。每個錯誤選項只錯一處。
   - 四個選項的長度、難度相近，不能靠長短或用字猜出答案；不要直接照抄原句。
4. 選項的難度符合〔學習者設定〕的程度，不要比原句更難。
5. 有〔學習弱點〕時，多出那幾類的錯誤選項。
6. 答題後的解說：
   - explanation：80 字以內，先點出原句的關鍵意思，再說正解怎麼換句話說、意思還是一樣。
   - optionNotes：每個錯誤選項一句（30 字以內），說它哪裡跟原句意思不同。
   - sentenceZh：原句的繁體中文翻譯。
7. errorTag：學習者如果選錯，最可能是哪一類，只能從任務列出的清單選。
8. 中文用繁體中文（台灣用語）；〔學習者設定〕指定其他回答語言時照它。
9. 只輸出符合 schema 的 JSON。`;

export const PARAPHRASE_TEMPLATE = `任務：段落換句話說練習（出自〈{{title}}〉）
出 {{count}} 題（句子不夠時可以少出），依句子在段落裡的順序排。
errorTag 清單：{{errorTags}}（negation 否定、cause 因果條件、scope 範圍程度、time 時間順序、actor 誰做了什麼、certainty 確定程度、detail 多加或漏掉資訊、word 字詞意思）`;

export const SENTENCES_BLOCK_TEMPLATE = `〔段落句子〕
{{lines}}`;

export const DISCUSSED_BLOCK_TEMPLATE = `〔討論過的地方〕（學習者在這段的討論裡選取或問過的）
{{lines}}`;

export const ASKED_BLOCK_TEMPLATE = `〔已出過的句子〕第 {{asked}} 句已經出過題，盡量挑別的句子；都出過時可以再出，但選項要完全換過。`;

export const PARAPHRASE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceIndex", "options", "answerId", "explanation", "optionNotes", "sentenceZh", "errorTag"],
        properties: {
          sourceIndex: { type: "integer", description: "〔段落句子〕裡的編號（從 1 開始）" },
          options: {
            type: "array",
            description: "4 個英文句子，一個意思和原句相同，三個有一處關鍵不同",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "text"],
              properties: { id: { type: "string", description: "a／b／c／d" }, text: { type: "string" } },
            },
          },
          answerId: { type: "string", description: "意思和原句相同的選項 id" },
          explanation: { type: "string", description: "繁體中文，80 字以內" },
          optionNotes: {
            type: "array",
            description: "每個錯誤選項一句，說它哪裡跟原句意思不同（30 字以內）",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "note"],
              properties: { id: { type: "string", description: "錯誤選項的 id" }, note: { type: "string" } },
            },
          },
          sentenceZh: { type: "string", description: "原句的繁體中文翻譯" },
          errorTag: { type: "string", enum: [...PARAPHRASE_ERROR_TAGS] },
        },
      },
    },
  },
};

export interface ParaphraseInput {
  paragraph: ParagraphRef;
  count?: number;
  // 〔學習弱點〕: the error types missed most lately; "" = none.
  weakness?: string;
  // 1-based numbers of the sentences already asked about.
  asked?: number[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const key = (s: string) => s.replace(/[\s.,;:!?"'“”‘’]+/g, " ").trim().toLowerCase();

// Models like to put the right answer in the same slot; the options are
// put in an order that depends on their text only (stable across reloads).
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const isOptionSentence = (s: string) => !hasCjk(s) && englishWords(s).length >= MIN_OPTION_WORDS;

export function parseParaphraseQuestion(
  raw: unknown,
  p: ParagraphRef
): (PracticeQuestionDraft & { sourceIndex: number }) | null {
  if (!isObj(raw)) return null;
  const n = typeof raw.sourceIndex === "number" ? raw.sourceIndex : Number(str(raw.sourceIndex));
  if (!Number.isInteger(n) || n < 1 || n > p.sentences.length) return null;
  const text = p.sentences[n - 1];
  const explanation = str(raw.explanation);
  if (!explanation) return null;
  const options = parseOptions(raw.options);
  if (!options || options.length < 3 || options.length > 4) return null;
  if (new Set(options.map((o) => o.id)).size !== options.length) return null;
  if (new Set(options.map((o) => key(o.text))).size !== options.length) return null;
  if (!options.every((o) => isOptionSentence(o.text))) return null;
  // Copying the sentence isn't a paraphrase (and would give the answer away).
  if (options.some((o) => key(o.text) === key(text))) return null;
  const answerId = str(raw.answerId);
  if (!options.some((o) => o.id === answerId)) return null;
  options.sort((a, b) => hash(a.text) - hash(b.text));

  const q: PracticeQuestionDraft & { sourceIndex: number } = {
    sourceIndex: n,
    focus: { kind: "paragraph", id: p.threadId },
    kind: "paraphrase",
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
  if ((PARAPHRASE_ERROR_TAGS as readonly string[]).includes(tag)) q.errorTag = tag;
  return q;
}

// Bad questions are dropped one by one; fewer than half usable (or none)
// is bad_output. Questions come out in paragraph order, each carrying the
// sentences since the previous one (at most MAX_LEAD) as `lead`.
export function parseParaphrase(json: unknown, p: ParagraphRef): PracticeScenarioDraft {
  if (!isObj(json) || !Array.isArray(json.questions)) {
    throw new AiError("bad_output", "practice.paraphrase: expected { questions: [...] }");
  }
  const byIndex = new Map<number, PracticeQuestionDraft & { sourceIndex: number }>();
  for (const raw of json.questions) {
    const q = parseParaphraseQuestion(raw, p);
    if (q && !byIndex.has(q.sourceIndex)) byIndex.set(q.sourceIndex, q);
  }
  const asked = json.questions.length;
  if (!byIndex.size || byIndex.size * 2 < asked) {
    throw new AiError("bad_output", `practice.paraphrase: only ${byIndex.size} of ${asked} questions usable`);
  }
  const questions: PracticeQuestionDraft[] = [];
  let prev = 0;
  for (const n of [...byIndex.keys()].sort((a, b) => a - b)) {
    const { sourceIndex: _, ...q } = byIndex.get(n)!;
    const lead = p.sentences.slice(prev, n - 1).slice(-MAX_LEAD);
    if (lead.length) q.lead = lead.map((text) => ({ text }));
    questions.push(q);
    prev = n;
  }
  return { scene: `〈${p.title}〉`, form: "story", questions };
}

export function paraphraseCount(input: ParaphraseInput): number {
  const want = Math.floor(input.count ?? MAX_PARAPHRASE_COUNT);
  return Math.max(1, Math.min(MAX_PARAPHRASE_COUNT, want, input.paragraph.sentences.length));
}

export const practiceParaphrase: AiTask<ParaphraseInput, PracticeScenarioDraft> = {
  id: "practice.paraphrase",
  version: 1,
  // No surface of its own (no button); the base prompt is passed in explicitly.
  surface: "grammar",
  tier: "smart",
  maxTokens: 6144,
  answerChars: () => 0,
  build(input: ParaphraseInput, ctx: TaskContext) {
    const p = input.paragraph;
    const weakness = (input.weakness ?? "").trim();
    const asked = [...new Set(input.asked ?? [])].filter((n) => n >= 1 && n <= p.sentences.length).sort((a, b) => a - b);
    const context = [
      renderTemplate(SENTENCES_BLOCK_TEMPLATE, { lines: p.sentences.map((s, i) => `${i + 1}. ${s}`).join("\n") }),
      p.discussed.length
        ? renderTemplate(DISCUSSED_BLOCK_TEMPLATE, { lines: p.discussed.map((d) => `- ${d}`).join("\n") })
        : "",
      weakness ? renderTemplate(WEAKNESS_BLOCK_TEMPLATE, { weakness }) : "",
      asked.length ? renderTemplate(ASKED_BLOCK_TEMPLATE, { asked: asked.join("、") }) : "",
    ];
    return composeRequest({
      base: PARAPHRASE_BASE_PROMPT,
      context,
      profile: ctx.profile,
      history: [],
      user: renderTemplate(PARAPHRASE_TEMPLATE, {
        title: p.title,
        count: paraphraseCount(input),
        errorTags: PARAPHRASE_ERROR_TAGS.join("、"),
      }),
      tier: practiceParaphrase.tier,
      maxTokens: practiceParaphrase.maxTokens,
      output: { name: "practice_paraphrase", schema: PARAPHRASE_SCHEMA },
    });
  },
};

// The task bound to one paragraph: AiTask.parse only sees the AI's answer,
// so the service passes this per-request variant to runStructured.
export function practiceParaphraseFor(p: ParagraphRef): AiTask<ParaphraseInput, PracticeScenarioDraft> {
  return { ...practiceParaphrase, parse: (r: AiResult) => parseParaphrase(structuredJson(r), p) };
}

export const PARAPHRASE_TASKS = [practiceParaphrase];
