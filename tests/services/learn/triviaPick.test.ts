import { describe, expect, it } from "vitest";
import type { Thread, Turn } from "../../../src/core/model/thread";
import { pickSubject, recentSubjects, subjectOf, triviaRounds } from "../../../src/services/learn/triviaPick";
import { entry } from "./fakes";

const NOW = new Date("2026-10-04T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

// Deterministic "random": replays the given values in order.
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const FRESH = [entry("f1", "glittery", { createdAt: daysAgo(1) }), entry("f2", "leotard", { createdAt: daysAgo(13) })];
const OLD = [
  entry("o1", "apron", { createdAt: daysAgo(30) }),
  entry("o2", "toil", { createdAt: daysAgo(15) }),
  // Pre-migration entry: only the legacy local-time stamp.
  entry("o3", "ethos", { added: "2026-01-02 10:00:00" }),
];
const ALL = [...FRESH, ...OLD];

describe("pickSubject", () => {
  it("prefers words added in the last 14 days", () => {
    // random 1: 0.5 < 0.7 → fresh pool; random 2 picks inside it.
    expect(pickSubject(ALL, [], { now: NOW, random: seq(0.5, 0.0) })?.id).toBe("f1");
    expect(pickSubject(ALL, [], { now: NOW, random: seq(0.5, 0.99) })?.id).toBe("f2");
  });

  it("still lets older words through some of the time", () => {
    expect(pickSubject(ALL, [], { now: NOW, random: seq(0.8, 0.0) })?.id).toBe("o1");
    expect(pickSubject(ALL, [], { now: NOW, random: seq(0.8, 0.99) })?.id).toBe("o3");
  });

  it("excludes the subjects of the last 30 rounds", () => {
    // Both fresh words were just told → only older words remain.
    expect(pickSubject(ALL, ["f1", "f2"], { now: NOW, random: seq(0.1, 0.0) })?.id).toBe("o1");
    // Only the 30 most recent count: o1 told 31 rounds ago is fair game.
    const recent = [...Array(30).fill("f1"), "o1"];
    expect(pickSubject([OLD[0]], recent, { now: NOW, random: seq(0.1) })?.id).toBe("o1");
  });

  it("falls back to the word told longest ago when every word is excluded", () => {
    expect(pickSubject(FRESH, ["f1", "f2", "f1"], { now: NOW, random: seq(0) })?.id).toBe("f2");
  });

  it("skips deleted entries and returns undefined for an empty list", () => {
    const deleted = entry("d", "gone", { createdAt: daysAgo(1), deletedAt: daysAgo(0) });
    expect(pickSubject([deleted], [], { now: NOW, random: seq(0) })).toBeUndefined();
    expect(pickSubject([], [], { now: NOW, random: seq(0) })).toBeUndefined();
  });

  it("never repeats a word across 10 rounds when there are enough words (M7 驗收)", () => {
    const many = Array.from({ length: 12 }, (_, i) => entry(`w${i}`, `word${i}`, { createdAt: daysAgo(i * 3) }));
    let r = 0.37;
    const random = () => (r = (r * 9301 + 0.49297) % 1);
    const told: string[] = [];
    for (let i = 0; i < 10; i++) {
      const e = pickSubject(many, told, { now: NOW, random });
      told.unshift(e!.id);
    }
    expect(new Set(told).size).toBe(10);
  });
});

function turn(id: string, role: Turn["role"], extra: Partial<Turn> = {}): Turn {
  return { id, role, content: `${id} text`, at: "2026-10-04T00:00:00Z", status: "done", ...extra };
}

describe("trivia history", () => {
  const thread: Thread = {
    id: "trivia-session",
    anchor: { kind: "trivia-session" },
    turns: [
      turn("q1", "user", { taskId: "trivia.next", subjectEntryId: "a" }),
      turn("a1", "assistant", { taskId: "trivia.next", subjectEntryId: "a" }),
      turn("q2", "user", { taskId: "trivia.followup", subjectEntryId: "a" }),
      turn("a2", "assistant", { taskId: "trivia.followup", subjectEntryId: "a" }),
      // Subject only on the question (an older ThreadService copy).
      turn("q3", "user", { taskId: "trivia.joke", subjectEntryId: "b" }),
      turn("a3", "assistant", { taskId: "trivia.joke" }),
      turn("q4", "user", { taskId: "trivia.next", subjectEntryId: "c" }),
      turn("a4", "assistant", { taskId: "trivia.next", subjectEntryId: "c", status: "error" }),
      turn("q5", "user", { taskId: "trivia.next", subjectEntryId: "d", deletedAt: "x" }),
      turn("a5", "assistant", { taskId: "trivia.next", subjectEntryId: "d", deletedAt: "x" }),
    ],
  };

  it("counts told rounds only: no follow-ups, failures or deleted turns", () => {
    expect(triviaRounds(thread).map((r) => r.answer.id)).toEqual(["a3", "a1"]);
    expect(recentSubjects(thread)).toEqual(["b", "a"]);
    expect(recentSubjects(undefined)).toEqual([]);
  });

  it("reads a turn's subject from the answer or its question", () => {
    expect(subjectOf(thread, thread.turns[1])).toBe("a");
    expect(subjectOf(thread, thread.turns[5])).toBe("b");
  });
});
