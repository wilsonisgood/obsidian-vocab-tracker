import type { Thread, Turn } from "../model/thread";

// Multi-device merge for store/threads.json (規劃書 06 §4.3): threads are
// unioned by id, and within a thread the turns are unioned by turn id —
// two devices each asking a question in the same thread both keep theirs.

function ms(iso: string | undefined): number {
  return iso ? new Date(iso).getTime() : 0;
}

function turnStamp(t: Turn): number {
  return Math.max(ms(t.updatedAt), ms(t.deletedAt), ms(t.at));
}

// A finished turn always beats a "streaming" copy of itself (the other
// device saved mid-answer); otherwise the more recently edited copy wins.
function pickTurn(a: Turn, b: Turn): Turn {
  if (a.status === "streaming" && b.status !== "streaming") return b;
  if (b.status === "streaming" && a.status !== "streaming") return a;
  return turnStamp(b) > turnStamp(a) ? b : a;
}

export function mergeTurns(local: readonly Turn[], remote: readonly Turn[]): Turn[] {
  const byId = new Map<string, Turn>();
  for (const t of local) byId.set(t.id, t);
  for (const t of remote) {
    const mine = byId.get(t.id);
    byId.set(t.id, mine ? pickTurn(mine, t) : t);
  }
  // Stable sort: equal timestamps keep local-then-remote insertion order,
  // so a question and its answer stamped in the same millisecond stay paired.
  return [...byId.values()].sort((x, y) => ms(x.at) - ms(y.at));
}

function pickThreadFields(a: Thread, b: Thread): Thread {
  const aMs = ms(a.updatedAt);
  const bMs = ms(b.updatedAt);
  if (aMs !== bMs) return aMs > bMs ? a : b;
  return (a.rev ?? 0) >= (b.rev ?? 0) ? a : b;
}

export function mergeThreads(local: readonly Thread[], remote: readonly Thread[]): Thread[] {
  const byId = new Map<string, Thread>();
  const order: string[] = [];
  for (const t of local) {
    byId.set(t.id, t);
    order.push(t.id);
  }
  for (const t of remote) {
    const mine = byId.get(t.id);
    if (!mine) {
      byId.set(t.id, t);
      order.push(t.id);
      continue;
    }
    const newer = pickThreadFields(mine, t);
    byId.set(t.id, { ...newer, turns: mergeTurns(mine.turns, t.turns) });
  }
  return order.map((id) => byId.get(id) as Thread);
}

// A turn still marked "streaming" on disk was cut off by a crash or a
// closed app — nothing will ever finish it, so show it as stopped.
export function settleStaleTurns(threads: Thread[]): Thread[] {
  for (const th of threads) {
    for (const t of th.turns) if (t.status === "streaming") t.status = "aborted";
  }
  return threads;
}
