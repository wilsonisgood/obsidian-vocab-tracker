import type { GrammarSighting } from "../model/grammar";
import { liveTurns, type Thread } from "../model/thread";
import { parseGrammarTrailer } from "./trailer";

// Where the reader met a grammar topic: the paragraph 文法解析 answers
// whose trailer named it (wave 15 rule 7). Derived from threads every time
// — nothing is stored, so deleting an answer removes its sightings.

export const GRAMMAR_TASK_ID = "paragraph.grammar";

// Newest first. One sighting per (thread, topic): asking again about the
// same paragraph moves it to the newest answer instead of piling up.
export function grammarSightings(threads: readonly Thread[]): GrammarSighting[] {
  const out = new Map<string, GrammarSighting>();
  for (const thread of threads) {
    if (thread.deletedAt || thread.anchor.kind !== "paragraph") continue;
    const { path, snapshot } = thread.anchor;
    let asked: string | undefined;
    for (const turn of liveTurns(thread)) {
      if (turn.role === "user") {
        asked = turn.selection?.trim() || undefined;
        continue;
      }
      if (turn.taskId !== GRAMMAR_TASK_ID || turn.status !== "done") continue;
      for (const topicId of parseGrammarTrailer(turn.content)) {
        const key = `${thread.id}\u0000${topicId}`;
        const prev = out.get(key);
        if (prev && Date.parse(prev.at) > Date.parse(turn.at)) continue;
        out.set(key, {
          topicId,
          threadId: thread.id,
          turnId: turn.id,
          path,
          snapshot,
          ...(asked ? { selection: asked } : {}),
          at: turn.at,
        });
      }
    }
  }
  return [...out.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function sightingsByTopic(sightings: readonly GrammarSighting[]): Map<string, GrammarSighting[]> {
  const out = new Map<string, GrammarSighting[]>();
  for (const s of sightings) {
    const l = out.get(s.topicId);
    if (l) l.push(s);
    else out.set(s.topicId, [s]);
  }
  return out;
}

export function sightingsOfPath(sightings: readonly GrammarSighting[], path: string): GrammarSighting[] {
  return sightings.filter((s) => s.path === path);
}
