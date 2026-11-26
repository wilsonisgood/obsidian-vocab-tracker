import type { LayoutKind } from "./types";

// 版面名稱與「主題 → 版面」對照（設計稿的對照表，2026-11-17 定案）。
// 主題 id 是 vocab-tracker 文法目錄的永久 id；搬到別的插件時，對照表
// 跟著它的主題目錄換掉即可，其他程式不用動。

export const LAYOUT_TITLES: Readonly<Record<LayoutKind, string>> = {
  timeline: "時間軸",
  scale: "程度量尺",
  unreal: "現實與假設",
  backshift: "往過去退一格",
  focus: "焦點轉移",
  verbslot: "動詞後面接什麼",
  path: "判斷路徑",
  connector: "邏輯連接",
  order: "語序搬移",
  scope: "範圍大小",
  clause: "子句套疊",
  compare: "比較長條",
  link: "連到哪個字",
  agreement: "主詞動詞一致",
};

const BY_LAYOUT: Readonly<Record<LayoutKind, readonly string[]>> = {
  timeline: [
    "present-simple", "present-continuous", "past-simple", "used-to-past-habit", "present-perfect-intro",
    "present-perfect-vs-past", "present-perfect-continuous", "past-perfect", "future-continuous-perfect",
    "future-will-going-to", "perfect-vs-progressive-nuance", "future-in-the-past",
  ],
  scale: [
    "can-cant", "modals-deduction", "must-vs-have-to", "modals-nuance", "would-rather-had-better",
    "frequency-adverbs", "stance-adverbs", "register-choice", "imperatives", "advanced-negation",
    "negation-quantifiers-advanced",
  ],
  unreal: [
    "conditionals-basic", "conditionals-real", "conditionals-unreal", "mixed-conditionals", "wish-if-only",
    "formal-conditional-inversion",
  ],
  backshift: ["reported-speech"],
  focus: ["passive-basic", "passive-advanced", "impersonal-passive", "causative-perception-verbs", "participle-adjectives"],
  verbslot: [
    "gerund-infinitive-intro", "gerund-vs-infinitive-meaning", "verb-preposition", "adjective-preposition",
    "used-to-be-used-to",
  ],
  path: [
    "articles-basic", "articles-advanced", "countable-uncountable", "some-any-much-many", "all-both-each",
    "determiners-reference", "noun-plurals",
  ],
  connector: [
    "basic-conjunctions", "concession-contrast", "unless-in-case-as-long-as", "purpose-to-infinitive",
    "future-time-clauses", "discourse-connectors",
  ],
  order: [
    "do-does-did-questions", "wh-questions", "question-tags", "negative-inversion", "emphasis-do-so-such",
    "cleft-sentences", "concessive-inversion", "word-order-information-structure", "phrasal-verbs",
    "formal-it-object", "have-got",
  ],
  scope: ["prepositions-time-place", "preposition-meaning", "preposition-abstract"],
  clause: [
    "relative-clauses-basic", "relative-clauses-defining-non", "advanced-relative-clauses", "noun-clauses",
    "participle-clauses-intro", "participle-reduced-clauses", "nominalization",
  ],
  compare: ["comparatives-superlatives", "comparison-advanced"],
  link: ["personal-pronouns", "reflexive-pronouns", "possessive-s", "demonstratives", "ellipsis-substitution", "adjectives-adverbs"],
  agreement: ["be-verb", "there-is-are", "agreement-difficult"],
};

const TOPIC_LAYOUT = new Map<string, LayoutKind>();
for (const [kind, ids] of Object.entries(BY_LAYOUT) as [LayoutKind, readonly string[]][]) {
  for (const id of ids) TOPIC_LAYOUT.set(id, kind);
}

export function layoutOf(topicId: string): LayoutKind | null {
  return TOPIC_LAYOUT.get(topicId) ?? null;
}

export function topicsOfLayout(kind: LayoutKind): readonly string[] {
  return BY_LAYOUT[kind];
}

export function mappedTopics(): string[] {
  return [...TOPIC_LAYOUT.keys()];
}
