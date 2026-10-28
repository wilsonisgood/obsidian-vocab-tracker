import { describe, expect, it } from "vitest";
import {
  answeredPairs,
  defaultExpandedKeys,
  groupByDay,
  isGroupCollapsed,
  localDay,
  shouldWarnNinth,
  tidiedUp,
  todayCount,
  userQuestionCount,
} from "../../../src/core/learner/buddyGroups";
import type { Thread, Turn } from "../../../src/core/model/thread";

const NOW = new Date(2026, 9, 28, 11, 44);
const at = (m: number, d: number, h = 10) => new Date(2026, m - 1, d, h).toISOString();

describe("groupByDay", () => {
  const items = [
    { id: "a", at: at(10, 28, 11) },
    { id: "b", at: at(10, 28, 9) },
    { id: "c", at: at(10, 27, 20) },
    { id: "d", at: at(10, 20) },
    { id: "e", at: at(10, 20, 8) },
    { id: "x", at: "nope" },
  ];
  it("groups today / yesterday / M/D with counts, keeping order", () => {
    const g = groupByDay(items, NOW);
    expect(g.map((x) => [x.label, x.ids])).toEqual([
      [{ kind: "today" }, ["a", "b"]],
      [{ kind: "yesterday" }, ["c"]],
      [{ kind: "date", md: "10/20" }, ["d", "e"]],
    ]);
    expect(g.map((x) => x.key)).toEqual(["2026-10-28", "2026-10-27", "2026-10-20"]);
  });
  it("yesterday works across a month boundary", () => {
    const g = groupByDay([{ id: "a", at: at(9, 30) }], new Date(2026, 9, 1, 8));
    expect(g[0].label).toEqual({ kind: "yesterday" });
  });
  it("opens today and the open conversation's group by default; toggles override", () => {
    const g = groupByDay(items, NOW);
    const open = defaultExpandedKeys(g, "d", NOW);
    expect([...open].sort()).toEqual(["2026-10-20", "2026-10-28"]);
    expect(isGroupCollapsed("2026-10-27", new Map(), open)).toBe(true);
    expect(isGroupCollapsed("2026-10-28", new Map(), open)).toBe(false);
    expect(isGroupCollapsed("2026-10-28", new Map([["2026-10-28", true]]), open)).toBe(true);
    expect(isGroupCollapsed("2026-10-27", new Map([["2026-10-27", false]]), open)).toBe(false);
  });
  it("an unlisted new conversation opens only today", () => {
    const open = defaultExpandedKeys(groupByDay(items, NOW), "buddy:new", NOW);
    expect([...open]).toEqual(["2026-10-28"]);
  });
});

const user = (id: string, content: string, o: Partial<Turn> = {}): Turn => ({ id, role: "user", content, at: "", status: "done", ...o });
const ai = (id: string, content: string, o: Partial<Turn> = {}): Turn => ({ id, role: "assistant", content, at: "", status: "done", ...o });
const thread = (turns: Turn[]): Thread => ({ id: "buddy:abc", anchor: { kind: "buddy" }, turns });
const rounds = (n: number): Turn[] => Array.from({ length: n }, (_, i) => [user(`u${i}`, `q${i}`), ai(`a${i}`, `ans${i}`)]).flat();

describe("ten-question archive", () => {
  it("counts questions and answered pairs (failed, streaming and deleted rounds don't count)", () => {
    const turns = [
      ...rounds(2),
      user("ue", "bad"), ai("ae", "", { status: "error" }),
      user("us", "now"), ai("as", "…", { status: "streaming" }),
      user("ud", "gone", { deletedAt: "x" }), ai("ad", "gone", { deletedAt: "x" }),
    ];
    const th = thread(turns);
    expect(userQuestionCount(th)).toBe(4);
    expect(answeredPairs(th)).toHaveLength(2);
  });

  it("warns on the 9th question once a day", () => {
    const today = localDay(NOW);
    expect(shouldWarnNinth(9, null, today)).toBe(true);
    expect(shouldWarnNinth(9, today, today)).toBe(false);
    expect(shouldWarnNinth(9, "2026-10-27", today)).toBe(true);
    expect(shouldWarnNinth(8, null, today)).toBe(false);
    expect(shouldWarnNinth(10, null, today)).toBe(false);
  });
});

describe("list title count and scrolling after a tidy-up", () => {
  it("counts the conversations started today", () => {
    const items = [
      { startedAt: new Date(2026, 9, 28, 8).toISOString() },
      { startedAt: new Date(2026, 9, 28, 23, 59).toISOString() },
      { startedAt: new Date(2026, 9, 27, 23, 59).toISOString() },
      { startedAt: "bad" },
    ];
    expect(todayCount(items, NOW)).toBe(2);
    expect(todayCount([], NOW)).toBe(0);
  });
  it("a tidy-up is the counter going up", () => {
    expect(tidiedUp(undefined, 8)).toBe(true);
    expect(tidiedUp(8, 16)).toBe(true);
    expect(tidiedUp(8, 8)).toBe(false);
    expect(tidiedUp(undefined, undefined)).toBe(false);
  });
});
