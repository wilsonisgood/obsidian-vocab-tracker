import type { VocabEntry } from "../../../src/core/model/entry";
import type { Thread, Turn } from "../../../src/core/model/thread";
import { EXPORT_LABELS_ZH } from "../../../src/services/export/labels";
import type { ExportFamily, ExportTrivia, ExportUsage, RenderContext } from "../../../src/services/export/types";

export const ARTICLE = "eng/Taylor_Swift_NYU_Speech_Transcript.md";

export function entry(id: string, word: string, extra: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id,
    word,
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: { path: ARTICLE, line: 12 },
    added: "",
    lastReviewed: "",
    reviews: 0,
    ...extra,
  };
}

let seq = 0;
export function turn(role: Turn["role"], content: string, extra: Partial<Turn> = {}): Turn {
  seq++;
  return { id: `t${seq}`, role, content, at: "2026-10-02T03:00:00.000Z", status: "done", ...extra };
}

export const GLITTERY = entry("1721900000000", "glittery", { partOfSpeech: "adjective" });
export const LEOTARD = entry("1721900000001", "leotard", { source: { path: ARTICLE, line: 12 } });
export const SEQUIN = entry("1721900000002", "sequin", { source: { path: "eng/Other.md", line: 3 } });

export function wordThread(entryId: string, turns: Turn[]): Thread {
  return { id: `word:${entryId}`, anchor: { kind: "word", entryId }, turns, createdAt: "2026-10-02T03:00:00.000Z" };
}

export const GLITTERY_THREAD = wordThread(GLITTERY.id, [
  turn("user", "glittery 和 sparkly 差在哪？", { taskId: "word.compare", at: "2026-10-02T03:00:00.000Z" }),
  turn(
    "assistant",
    "**glittery** 強調「帶亮片、閃粉」的質感；**sparkly** 比較籠統，指一閃一閃的光。\n\n- a glittery dress\n- sparkly eyes",
    { at: "2026-10-02T03:00:05.000Z" }
  ),
  // Failed round: not exported.
  turn("user", "再舉一個例子", { at: "2026-10-02T04:00:00.000Z" }),
  turn("assistant", "", { status: "error", error: "network", at: "2026-10-02T04:00:01.000Z" }),
  // Retried, tombstoned: not exported.
  turn("user", "deleted question", { deletedAt: "2026-10-02T04:30:00.000Z" }),
  turn("assistant", "deleted answer", { deletedAt: "2026-10-02T04:30:00.000Z" }),
  // Stopped mid code block: exported with the fence closed.
  turn("user", "怎麼用在程式碼註解裡？", { selection: "glittery\nleotard", at: "2026-10-03T05:00:00.000Z" }),
  turn("assistant", "例如：\n\n```js\n// a glittery", { status: "aborted", at: "2026-10-03T05:00:02.000Z" }),
  // Still streaming: not exported yet.
  turn("user", "還在串流", { at: "2026-10-03T06:00:00.000Z" }),
  turn("assistant", "部分", { status: "streaming", at: "2026-10-03T06:00:00.000Z" }),
]);

export const FAMILIES: ExportFamily[] = [
  {
    id: "f1",
    topic: "clothing",
    label: "服裝",
    groups: [
      {
        label: "舞台服裝",
        members: [
          { entryId: GLITTERY.id, word: "glittery", zh: "閃亮的" },
          { entryId: LEOTARD.id, word: "leotard", zh: "緊身衣" },
          { word: "sequin", zh: "亮片" },
          { word: "tulle", zh: "薄紗" },
        ],
      },
    ],
  },
  {
    id: "f2",
    topic: "gl-",
    label: "發光家族",
    groups: [
      {
        label: "",
        members: [
          { word: "glittery", zh: "閃亮的" },
          { word: "glisten", zh: "（濕潤地）發亮" },
          { word: "glimmer", zh: "微光" },
        ],
      },
    ],
  },
  // Not about glittery.
  { id: "f3", topic: "sports", label: "運動", groups: [{ label: "", members: [{ entryId: LEOTARD.id, word: "leotard", zh: "緊身衣" }] }] },
  // Deleted.
  {
    id: "f4",
    topic: "deleted",
    label: "刪掉的",
    groups: [{ label: "", members: [{ entryId: GLITTERY.id, word: "glittery", zh: "" }] }],
    deletedAt: "2026-10-01T00:00:00.000Z",
  },
];

export const USAGE: ExportUsage = {
  patterns: [
    { pattern: "glittery + 服裝 / 妝容", meaningZh: "最常見的搭配，帶亮片、閃粉的感覺", example: "a glittery dress, glittery eyeshadow" },
    { pattern: "glittery + 抽象名詞", meaningZh: "比喻光鮮亮麗，常帶一點「表面風光」的語氣", example: "a glittery career" },
  ],
  related: [
    { phrase: "glitter", zh: "閃爍" },
    { phrase: "all that glitters is not gold", zh: "" },
  ],
};

export const TRIVIA: ExportTrivia[] = [
  {
    id: "tr1",
    entryId: GLITTERY.id,
    mentions: ["glisten", LEOTARD.id],
    title: "gl- 開頭的字常跟「光」有關",
    body: "glow、gleam、glint、glare、glimmer 都跟光有關。\n語言學把這種現象叫做 phonaestheme。",
    createdAt: "2026-10-03T08:00:00.000Z",
  },
  {
    id: "tr2",
    entryId: LEOTARD.id,
    mentions: ["glittery"],
    title: "leotard 來自一位法國特技演員",
    body: "Jules Léotard 在 19 世紀穿著這種緊身衣表演空中飛人。",
    createdAt: "2026-10-04T08:00:00.000Z",
  },
  {
    id: "tr3",
    entryId: GLITTERY.id,
    mentions: [],
    title: "unsaved",
    body: "deleted item",
    createdAt: "2026-10-04T09:00:00.000Z",
    deletedAt: "2026-10-04T10:00:00.000Z",
  },
];

const TASK_LABELS: Record<string, string> = {
  "word.compare": "比較",
  "paragraph.grammar": "文法",
  "paragraph.rephrase": "換句話說",
  "paragraph.translate": "翻譯",
};

const WORDS: Record<string, string> = { [GLITTERY.id]: "glittery", [LEOTARD.id]: "leotard", [SEQUIN.id]: "sequin" };

// Deterministic context: dates in UTC, a fixed set of words with pages.
export function ctx(pages: Record<string, string> = { leotard: "vocab-list/單字/leotard", glittery: "vocab-list/單字/glittery" }): RenderContext {
  return {
    labels: EXPORT_LABELS_ZH,
    formatDate: (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`,
    taskLabel: (id) => TASK_LABELS[id],
    entryWord: (id) => WORDS[id],
    pageLink: (word) => pages[word.toLowerCase()] ?? null,
  };
}
