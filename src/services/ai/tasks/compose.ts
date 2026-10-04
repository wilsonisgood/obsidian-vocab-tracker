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
//   messages   up to 6 earlier rounds        cache ✓ on the last one
//              final user turn (task template: selection, question,
//              instructions) — the volatile part, always last
//
// The history breakpoint (規劃書 06 §6.4.1 #5) lets a follow-up read every
// earlier round of the thread from cache. That only works if each earlier
// round is re-sent byte for byte: ThreadService replays the user turn's
// stored `sent` text (never a re-rendered template), and trimHistory drops
// old rounds in blocks so the first message doesn't change every request.
// Everything before the history — system[0..3] — must stay the same
// within a thread too, or the conversation cache misses.
//
// The profile sits after the last cache breakpoint on purpose: it's ~80
// tokens re-sent uncached each time, which is far cheaper than re-writing a
// 30k-token article cache whenever the learner tweaks their level or
// answer length. It's also the block closest to the conversation, where
// length/level instructions are followed most reliably.

export const HISTORY_ROUNDS = 6;
// Once a thread has more than HISTORY_ROUNDS rounds, the oldest are dropped
// this many at a time rather than one per request. A one-round slide would
// change messages[0] on every follow-up and miss the conversation cache
// every time; dropping 3 at once keeps the prefix fixed for 3 requests in a
// row, at the cost of sometimes sending only 4–5 rounds instead of 6.
export const HISTORY_DROP_ROUNDS = 3;

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

// Messages must start with a user turn.
function dropLeadingNonUser(msgs: ChatMessage[]): ChatMessage[] {
  let i = 0;
  while (i < msgs.length && msgs[i].role !== "user") i++;
  return msgs.slice(i);
}

export function trimHistory(history: ChatMessage[], rounds = HISTORY_ROUNDS, dropRounds = HISTORY_DROP_ROUNDS): ChatMessage[] {
  // Copies without any cache flag: composeRequest decides where it goes.
  const all = dropLeadingNonUser(
    history.filter((m) => m.content.trim() !== "").map((m) => ({ role: m.role, content: m.content }))
  );
  const over = all.length - rounds * 2;
  if (over <= 0) return all;
  const step = Math.max(1, dropRounds) * 2;
  return dropLeadingNonUser(all.slice(Math.ceil(over / step) * step));
}

export function composeRequest(p: ComposeParts): AiRequest {
  const system: SystemBlock[] = [
    { text: p.base, cache: true },
    ...(p.cached ?? []).map((text) => ({ text, cache: true })),
    ...(p.context ?? []).filter(Boolean).map((text) => ({ text })),
    { text: renderProfile(p.profile) },
  ];
  const history = trimHistory(p.history);
  if (history.length) history[history.length - 1].cache = true;
  const req: AiRequest = {
    system,
    messages: [...history, { role: "user", content: p.user }],
    maxTokens: p.maxTokens,
    tier: p.tier,
  };
  if (p.output) req.output = p.output;
  return req;
}
