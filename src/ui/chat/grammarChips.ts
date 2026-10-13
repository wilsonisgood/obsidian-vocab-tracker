import { t } from "../../core/i18n";
import { GRAMMAR_TASK_ID } from "../../core/grammar/sightings";
import { topicById } from "../../core/grammar/catalog";
import { parseGrammarTrailer, stripGrammarTrailer } from "../../core/grammar/trailer";
import type { GrammarStage } from "../../core/model/grammar";
import type { Turn } from "../../core/model/thread";
import { stageLabel } from "../grammar/labels";

// What a 文法解析 answer shows (wave 15 S, 1013 §3.5): the text without its
// machine-readable `<!-- vt-grammar: … -->` trailer, and a chip per topic
// the trailer named. Pure, so the display rules are unit-tested; ChatPanel
// draws them.

// The 「這句用到的文法」 row label (aria) for a chip row.
export function chipsLabel(): string {
  return t("grammar.chip.label");
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
export function grammarChips(turn: Pick<Turn, "role" | "taskId" | "status" | "content">): GrammarChip[] {
  if (turn.role !== "assistant" || turn.taskId !== GRAMMAR_TASK_ID || turn.status !== "done") return [];
  const out: GrammarChip[] = [];
  for (const id of parseGrammarTrailer(turn.content)) {
    const topic = topicById(id);
    if (topic) out.push({ topicId: id, label: `${topic.title} · ${stageLabel(topic.stage)}`, stage: topic.stage });
  }
  return out;
}
