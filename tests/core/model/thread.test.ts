import { describe, expect, it } from "vitest";
import { findTurnPair, pairTurns } from "../../../src/core/model/thread";
import type { Turn } from "../../../src/core/model/thread";

// 配對規則 (1006 #20): one user turn + the assistant turn right after it.

const user = (id: string, extra: Partial<Turn> = {}): Turn => ({
  id,
  role: "user",
  content: id,
  at: "2026-10-01T00:00:00Z",
  status: "done",
  ...extra,
});

const assistant = (id: string, extra: Partial<Turn> = {}): Turn => ({
  id,
  role: "assistant",
  content: id,
  at: "2026-10-01T00:00:01Z",
  status: "done",
  ...extra,
});

describe("pairTurns", () => {
  it("pairs a normal question with its answer", () => {
    const turns = [user("q1"), assistant("a1")];
    expect(pairTurns(turns)).toEqual([{ user: turns[0], assistant: turns[1] }]);
  });

  it("pairs several rounds in order", () => {
    const turns = [user("q1"), assistant("a1"), user("q2"), assistant("a2")];
    expect(pairTurns(turns).map((p) => [p.user.id, p.assistant?.id])).toEqual([
      ["q1", "a1"],
      ["q2", "a2"],
    ]);
  });

  it("pairs a trailing question with no answer yet alone", () => {
    const turns = [user("q1"), assistant("a1"), user("q2")];
    const pairs = pairTurns(turns);
    expect(pairs).toHaveLength(2);
    expect(pairs[1]).toEqual({ user: turns[2] });
  });

  it("pairs a failed round (error/aborted answer) the same as a normal one", () => {
    const turns = [user("q1"), assistant("a1", { status: "error", error: "network" })];
    expect(pairTurns(turns)[0].assistant?.status).toBe("error");
  });

  it("includes already-tombstoned turns (restoreTurnPair needs to find those too)", () => {
    const now = "2026-10-02T00:00:00Z";
    const turns = [user("q1", { deletedAt: now }), assistant("a1", { deletedAt: now })];
    expect(pairTurns(turns)).toEqual([{ user: turns[0], assistant: turns[1] }]);
  });

  it("skips an orphan assistant turn with no question before it", () => {
    const turns = [assistant("a0"), user("q1"), assistant("a1")];
    expect(pairTurns(turns).map((p) => p.user.id)).toEqual(["q1"]);
  });
});

describe("findTurnPair", () => {
  const turns = [user("q1"), assistant("a1"), user("q2"), assistant("a2", { status: "streaming", content: "" })];

  it("finds the pair by the question's id", () => {
    expect(findTurnPair(turns, "q1")?.assistant?.id).toBe("a1");
  });

  it("finds the pair by the answer's id", () => {
    expect(findTurnPair(turns, "a2")?.user.id).toBe("q2");
  });

  it("returns undefined for an unknown id", () => {
    expect(findTurnPair(turns, "nope")).toBeUndefined();
  });
});
