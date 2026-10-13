import { getLocale } from "../../core/i18n";
import { GRAMMAR_TASK_ID } from "../../core/grammar/sightings";
import { topicById } from "../../core/grammar/catalog";
import { parseGrammarTrailer, stripGrammarTrailer } from "../../core/grammar/trailer";
import type { GrammarStage } from "../../core/model/grammar";
import type { Turn } from "../../core/model/thread";

// What a 文法解析 answer shows (wave 15 S, 1013 §3.5): the text without its
// machine-readable `<!-- vt-grammar: … -->` trailer, and a chip per topic
// the trailer named. Pure, so the display rules are unit-tested; ChatPanel
// draws them.

// Wave 15 rule 11: new strings live in the file that uses them until
// integration moves them into i18n.
const L = {
  "zh-TW": { stage1: "基礎", stage2: "中級", stage3: "進階", chips: "這句用到的文法" },
  en: { stage1: "Basic", stage2: "Intermediate", stage3: "Advanced", chips: "Grammar in this sentence" },
} as const;

type Lang = keyof typeof L;

export function stageLabel(stage: GrammarStage, lang: Lang = getLocale()): string {
  return L[lang][`stage${stage}`];
}

export function chipsLabel(lang: Lang = getLocale()): string {
  return L[lang].chips;
}

export interface GrammarChip {
  topicId: string;
  // `<title> · <基礎/中級/進階>`.
  label: string;
  stage: GrammarStage;
}

// The answer text for display, copy and export: everything but the trailer.
// Other turns pass through untouched (only a trailer-shaped comment is ever
// removed, so a plain answer is the same string).
export function displayContent(content: string): string {
  return stripGrammarTrailer(content);
}

// Chips for a finished 文法解析 answer; empty for any other turn, an answer
// that's still streaming/failed, or a trailer with no known topic.
export function grammarChips(turn: Pick<Turn, "role" | "taskId" | "status" | "content">, lang: Lang = getLocale()): GrammarChip[] {
  if (turn.role !== "assistant" || turn.taskId !== GRAMMAR_TASK_ID || turn.status !== "done") return [];
  const out: GrammarChip[] = [];
  for (const id of parseGrammarTrailer(turn.content)) {
    const topic = topicById(id);
    if (topic) out.push({ topicId: id, label: `${topic.title} · ${stageLabel(topic.stage, lang)}`, stage: topic.stage });
  }
  return out;
}
