import { getLocale } from "../../core/i18n";
import { isMastered, mistakeGroups, objectiveStats, startDifficulty, type MistakeGroup } from "../../core/grammar/progress";
import { topicById } from "../../core/grammar/catalog";
import type {
  ErrorTag,
  GrammarAttempt,
  GrammarQuestion,
  GrammarStage,
  GrammarTopic,
  GrammarTopicStatus,
} from "../../core/model/grammar";
import type { CefrLevel } from "../../core/model/settings";
import { parseBlockParams } from "./params";

// View-models for the vocab-grammar map and topic blocks (第十五波 M, 1013
// §3.1/§3.2). Pure — no "obsidian" import — so it's unit-tested. The
// strings live here for now (rule 11); the integration moves them into
// core/i18n.

// ── Strings (rule 11: zh-TW first, en alongside) ─────────────────

const ZH = {
  "map.title": "文法地圖",
  "map.stage": "文法等級",
  "map.loading": "載入中…",
  "map.next": "建議下一個",
  "map.start": "開始",
  "map.due": "今天待複習 {n} 個主題",
  "map.review": "複習",
  "map.empty": "這個等級沒有主題。",
  "map.locked": "前置主題還沒學：{list}",
  "map.mistakes": "錯題本（{n}）",
  "map.mistakes.empty": "目前沒有錯題。",
  "map.mistakes.count": "{n} 題",
  "map.mistakes.redo": "重做這組",
  "map.openFailed": "開不了主題頁：{msg}",
  "status.new": "尚未開始",
  "status.learning": "學習中",
  "status.mastered": "已掌握",
  "status.due": "待複習",
  "stage.1": "基礎",
  "stage.2": "中級",
  "stage.3": "進階",
  "topic.difficulty": "難度 {n}",
  "topic.objectives": "學習目標",
  "topic.sightings": "在你的文章裡",
  "topic.sightings.empty": "還沒有。用段落討論的「文法」解析讀文章，抓到的句型會列在這裡。",
  "topic.related": "相關主題",
  "topic.kind.prerequisite": "前置",
  "topic.kind.related": "相關",
  "topic.generate": "生成說明",
  "topic.generating": "正在生成說明…",
  "topic.stop": "停止",
  "topic.written": "說明已寫入。",
  "topic.unknown": "找不到這個文法主題：{id}",
  "topic.noId": "請在 block 裡寫上 id: <主題 id>。",
  "topic.err.notEmpty": "說明已經有內容，沒有覆蓋。",
  "topic.err.noSection": "找不到「## 說明」段落，沒有寫入。",
  "topic.err.empty": "AI 沒有回傳內容。",
} as const;

export type GrammarLKey = keyof typeof ZH;

const EN: Record<GrammarLKey, string> = {
  "map.title": "Grammar map",
  "map.stage": "Grammar level",
  "map.loading": "Loading…",
  "map.next": "Up next",
  "map.start": "Start",
  "map.due": "{n} topics to review today",
  "map.review": "Review",
  "map.empty": "No topics at this level.",
  "map.locked": "Not learned yet: {list}",
  "map.mistakes": "Mistakes ({n})",
  "map.mistakes.empty": "No mistakes right now.",
  "map.mistakes.count": "{n} questions",
  "map.mistakes.redo": "Redo this group",
  "map.openFailed": "Couldn't open the topic page: {msg}",
  "status.new": "Not started",
  "status.learning": "Learning",
  "status.mastered": "Mastered",
  "status.due": "Due",
  "stage.1": "Basic",
  "stage.2": "Intermediate",
  "stage.3": "Advanced",
  "topic.difficulty": "Level {n}",
  "topic.objectives": "Objectives",
  "topic.sightings": "In your reading",
  "topic.sightings.empty": "Nothing yet. Use the Grammar action on a paragraph discussion while reading; patterns it finds are listed here.",
  "topic.related": "Related topics",
  "topic.kind.prerequisite": "Before",
  "topic.kind.related": "Related",
  "topic.generate": "Generate explanation",
  "topic.generating": "Writing the explanation…",
  "topic.stop": "Stop",
  "topic.written": "Explanation written.",
  "topic.unknown": "Unknown grammar topic: {id}",
  "topic.noId": "Add id: <topic id> to the block.",
  "topic.err.notEmpty": "The explanation section already has content; nothing was overwritten.",
  "topic.err.noSection": "The \"## 說明\" section is missing; nothing was written.",
  "topic.err.empty": "The AI returned nothing.",
};

export function gl(key: GrammarLKey, params?: Record<string, string | number>): string {
  const template = (getLocale() === "zh-TW" ? ZH : EN)[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

const ERROR_TAG_ZH: Record<ErrorTag, string> = {
  "tense-choice": "時態選擇",
  aspect: "時貌",
  agreement: "主詞動詞一致",
  article: "冠詞",
  preposition: "介系詞",
  "word-order": "字序",
  "verb-pattern": "動詞句型",
  "modal-meaning": "助動詞語意",
  conditional: "條件句",
  voice: "語態",
  "relative-clause": "關係子句",
  "clause-link": "子句連接",
  quantifier: "數量詞",
  comparison: "比較",
  pronoun: "代名詞",
  plural: "單複數",
  participle: "分詞",
  "reported-speech": "間接引述",
  inversion: "倒裝",
  emphasis: "強調",
  register: "語氣與正式程度",
  negation: "否定",
  determiner: "限定詞",
  possessive: "所有格",
  "spelling-form": "拼寫與字形",
  other: "其他",
};

const ERROR_TAG_EN: Record<ErrorTag, string> = {
  "tense-choice": "Tense choice",
  aspect: "Aspect",
  agreement: "Agreement",
  article: "Articles",
  preposition: "Prepositions",
  "word-order": "Word order",
  "verb-pattern": "Verb patterns",
  "modal-meaning": "Modal meaning",
  conditional: "Conditionals",
  voice: "Voice",
  "relative-clause": "Relative clauses",
  "clause-link": "Linking clauses",
  quantifier: "Quantifiers",
  comparison: "Comparison",
  pronoun: "Pronouns",
  plural: "Plurals",
  participle: "Participles",
  "reported-speech": "Reported speech",
  inversion: "Inversion",
  emphasis: "Emphasis",
  register: "Register",
  negation: "Negation",
  determiner: "Determiners",
  possessive: "Possessives",
  "spelling-form": "Spelling and form",
  other: "Other",
};

export function errorTagLabel(tag: ErrorTag): string {
  return (getLocale() === "zh-TW" ? ERROR_TAG_ZH : ERROR_TAG_EN)[tag];
}

// ── Stages ───────────────────────────────────────────────────────

export const STAGES: readonly GrammarStage[] = [1, 2, 3];

export function stageLabel(stage: GrammarStage): string {
  return gl(`stage.${stage}` as GrammarLKey);
}

// Rule 3: 1–3 基礎, 4–6 中級, 7–9 進階.
export function stageOfDifficulty(difficulty: number): GrammarStage {
  return difficulty >= 7 ? 3 : difficulty >= 4 ? 2 : 1;
}

// The stage the map opens on: where the learner's CEFR level starts.
export function defaultStage(level: CefrLevel | ""): GrammarStage {
  return stageOfDifficulty(startDifficulty(level));
}

export interface MapParams {
  stage?: GrammarStage;
}

// ```vocab-grammar\nstage: 2\n```: opens on that stage (1–3, or 基礎／中級／進階).
export function parseMapParams(source: string): MapParams {
  const raw = (parseBlockParams(source).stage ?? "").trim().toLowerCase();
  if (!raw) return {};
  const byName: Record<string, GrammarStage> = {
    基礎: 1, basic: 1, 中級: 2, intermediate: 2, 進階: 3, advanced: 3,
  };
  const n = byName[raw] ?? Number(raw);
  return n === 1 || n === 2 || n === 3 ? { stage: n } : {};
}

// ── Map rows ─────────────────────────────────────────────────────

export interface MapRow {
  topic: GrammarTopic;
  status: GrammarTopicStatus;
  // 「已掌握」, 「學習中 2/3」…
  statusText: string;
  // Prerequisites the learner hasn't started (only for a topic of their own
  // that's still new). A hint — the row stays clickable (1013 §3.1).
  lockedBy: GrammarTopic[];
}

export function statusLabel(status: GrammarTopicStatus): string {
  return gl(`status.${status}` as GrammarLKey);
}

// Objectives that reached mastery / all objectives, for 「學習中 2/3」.
export function objectivesReached(topic: GrammarTopic, attempts: readonly GrammarAttempt[]): { reached: number; total: number } {
  const stats = objectiveStats(topic, attempts);
  return { reached: stats.filter((s) => isMastered([s])).length, total: stats.length };
}

export function mapRows(
  stage: GrammarStage,
  topics: readonly GrammarTopic[],
  statusOf: (topicId: string) => GrammarTopicStatus,
  attempts: readonly GrammarAttempt[]
): MapRow[] {
  return topics
    .filter((t) => t.stage === stage)
    .sort((a, b) => a.order - b.order)
    .map((topic) => {
      const status = statusOf(topic.id);
      let statusText = statusLabel(status);
      if (status === "learning") {
        const { reached, total } = objectivesReached(topic, attempts);
        statusText = `${statusText} ${reached}/${total}`;
      }
      const lockedBy =
        status === "new"
          ? topic.prerequisites
              .map((id) => topicById(id))
              .filter((p): p is GrammarTopic => !!p && statusOf(p.id) === "new")
          : [];
      return { topic, status, statusText, lockedBy };
    });
}

export function lockedTooltip(lockedBy: readonly GrammarTopic[]): string {
  return gl("map.locked", { list: lockedBy.map((t) => t.title).join(getLocale() === "zh-TW" ? "、" : ", ") });
}

// ── Mistakes ─────────────────────────────────────────────────────

export interface MistakeEntry {
  errorTag: ErrorTag;
  label: string;
  count: number;
  // The topic with most of the group's questions: where 「重做這組」 goes
  // (first version; P's practice block takes `mode: mistakes` later).
  topicId: string;
}

// Most questions in the group win; a tie goes to the topic of the newest
// mistake (groups list newest first).
export function topicOfGroup(group: MistakeGroup): string {
  const counts = new Map<string, number>();
  for (const { question } of group.items) counts.set(question.topicId, (counts.get(question.topicId) ?? 0) + 1);
  let best = group.items[0]?.question.topicId ?? "";
  for (const [id, n] of counts) if (n > (counts.get(best) ?? 0)) best = id;
  return best;
}

export function mistakeEntries(questions: readonly GrammarQuestion[], attempts: readonly GrammarAttempt[]): MistakeEntry[] {
  return mistakeGroups(questions, attempts).map((g) => ({
    errorTag: g.errorTag,
    label: errorTagLabel(g.errorTag),
    count: g.items.length,
    topicId: topicOfGroup(g),
  }));
}

export function mistakeTotal(entries: readonly MistakeEntry[]): number {
  return entries.reduce((n, e) => n + e.count, 0);
}
