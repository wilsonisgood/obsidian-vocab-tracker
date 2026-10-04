import type { LearnerProfile } from "../../../core/model/settings";
import { renderProfile } from "../context/profile";
import type { AiRequest, ChatMessage, JsonSchema, SystemBlock, Tier } from "../providers/types";

// Assembles the provider-neutral AiRequest in a fixed order, chosen for
// prompt caching (a cache hit needs a byte-identical prefix; any change
// invalidates everything after it):
//
//   system[0]  surface base prompt      cache ✓  identical for every task on the surface
//   system[1]  article (paragraph only) cache ✓  identical for every paragraph of the article
//   system[2]  focus paragraph / word   —        per thread
//   system[3]  learner profile          —        per user; changes rarely but
//                                                must not invalidate the article
//   messages   last 6 rounds + final user turn (task template: selection,
//              question, instructions) — the volatile part, always last
//
// The profile sits after the last cache breakpoint on purpose: it's ~80
// tokens re-sent uncached each time, which is far cheaper than re-writing a
// 30k-token article cache whenever the learner tweaks their level or
// answer length. It's also the block closest to the conversation, where
// length/level instructions are followed most reliably.

export const HISTORY_ROUNDS = 6;

export interface ComposeParts {
  base: string;
  cached?: string[];
  context?: string[];
  profile: LearnerProfile;
  history: ChatMessage[];
  user: string;
  tier: Tier;
  maxTokens: number;
  output?: { name: string; schema: JsonSchema };
}

export function trimHistory(history: ChatMessage[], rounds = HISTORY_ROUNDS): ChatMessage[] {
  const recent = history.filter((m) => m.content.trim() !== "").slice(-rounds * 2);
  // Messages must start with a user turn.
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}

export function composeRequest(p: ComposeParts): AiRequest {
  const system: SystemBlock[] = [
    { text: p.base, cache: true },
    ...(p.cached ?? []).map((text) => ({ text, cache: true })),
    ...(p.context ?? []).filter(Boolean).map((text) => ({ text })),
    { text: renderProfile(p.profile) },
  ];
  const req: AiRequest = {
    system,
    messages: [...trimHistory(p.history), { role: "user", content: p.user }],
    maxTokens: p.maxTokens,
    tier: p.tier,
  };
  if (p.output) req.output = p.output;
  return req;
}
