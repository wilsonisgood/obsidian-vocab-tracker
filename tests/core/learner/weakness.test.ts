import { describe, expect, it } from "vitest";
import type { LearnEvent } from "../../../src/core/model/learner";
import { weakFocuses, weaknessDigest } from "../../../src/core/learner/weakness";

const NOW = new Date("2026-10-13T12:00:00Z");
let n = 0;
function ev(focusId: string, result: LearnEvent["result"], daysAgo: number, extra: Partial<LearnEvent> = {}): LearnEvent {
  return {
    id: `e${n++}`,
    at: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    track: "grammar",
    focus: { kind: "grammar-objective", id: focusId },
    result,
    ...extra,
  };
}

describe("weakFocuses", () => {
  it("ranks by decayed wrong count and ignores old, skipped and retired", () => {
    const events = [
      ev("a", "wrong", 1), ev("a", "wrong", 2),
      ev("b", "wrong", 1),
      ev("c", "wrong", 40),
      ev("d", "skipped", 1), ev("d", "retired", 1),
    ];
    const w = weakFocuses(events, { now: NOW });
    expect(w.map((x) => x.focus.id)).toEqual(["a", "b"]);
    expect(w[0].wrong).toBe(2);
  });

  it("each correct after the last wrong takes 0.5 off", () => {
    const one = [ev("a", "wrong", 0), ev("a", "correct", 0)];
    expect(weakFocuses(one, { now: NOW })).toHaveLength(1);
    const two = [ev("a", "wrong", 0), ev("a", "correct", 0), ev("a", "correct", 0)];
    expect(weakFocuses(two, { now: NOW })).toHaveLength(0);
    // a correct before the wrong does not count
    const before = [ev("a", "correct", 3), ev("a", "correct", 3), ev("a", "wrong", 0)];
    expect(weakFocuses(before, { now: NOW })).toHaveLength(1);
  });

  it("applies scope, track and limit", () => {
    const events = [ev("a", "wrong", 1), ev("b", "wrong", 1), ev("c", "wrong", 1, { track: "poly" })];
    expect(weakFocuses(events, { now: NOW, scope: new Set(["b"]) }).map((x) => x.focus.id)).toEqual(["b"]);
    expect(weakFocuses(events, { now: NOW, track: "poly" }).map((x) => x.focus.id)).toEqual(["c"]);
    expect(weakFocuses(events, { now: NOW, limit: 2 })).toHaveLength(2);
  });

  it("fills commonGiven only when picked at least twice", () => {
    const events = [ev("a", "wrong", 1, { given: "go" }), ev("a", "wrong", 2, { given: "went" }), ev("a", "wrong", 3, { given: "went" })];
    expect(weakFocuses(events, { now: NOW })[0].commonGiven).toBe("went");
    const once = [ev("a", "wrong", 1, { given: "go" }), ev("a", "wrong", 2, { given: "went" })];
    expect(weakFocuses(once, { now: NOW })[0].commonGiven).toBeUndefined();
  });
});

describe("weaknessDigest", () => {
  it("formats lines, optional label and given", () => {
    const events = [ev("t/a", "wrong", 1, { given: "go" }), ev("t/a", "wrong", 2, { given: "go" }), ev("t/b", "wrong", 0)];
    const w = weakFocuses(events, { now: NOW });
    const lines = weaknessDigest(w).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.startsWith("t/a"))).toMatch(/^t\/a｜錯 2 次（最近 \d\d\/\d\d）｜常選成 go$/);
    expect(lines.find((l) => l.startsWith("t/b"))).toMatch(/^t\/b｜錯 1 次（最近 \d\d\/\d\d）$/);
    expect(weaknessDigest(w, (f) => `L:${f.id}`)).toContain("L:t/a｜");
  });
  it("is empty for no weak spots", () => expect(weaknessDigest([])).toBe(""));
});
