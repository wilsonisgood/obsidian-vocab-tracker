import { describe, expect, it } from "vitest";
import { defaultLearnerProfile } from "../../../src/core/model/settings";
import type { Thread, Turn } from "../../../src/core/model/thread";
import type { WordInput } from "../../../src/services/ai/context/wordContext";
import { buildAnthropicBody } from "../../../src/services/ai/providers/anthropic";
import { wordCompare, wordCustom, wordUsage } from "../../../src/services/ai/tasks/word";
import { historyOf } from "../../../src/services/threads/ThreadService";

// 規劃書 06 §6.4.1 #5: follow-ups in a thread must re-send every earlier
// round byte for byte, so the breakpoint on the last history message turns
// into a cache read on the next request. Simulates a word thread the way
// ThreadService runs it: prepare → store `sent` → answer → next question.

interface Block {
  type: string;
  text: string;
  cache_control?: unknown;
}
interface Msg {
  role: string;
  content: string | Block[];
}
type Body = Record<string, unknown> & { system: Block[]; messages: Msg[] };

const INPUT: WordInput = {
  entry: { word: "glittery", partOfSpeech: "adjective", definitionZh: "閃亮的；帶亮片的" },
  sourceParagraph: "Last time I was in a stadium this size, I was dancing in heels and wearing a glittery leotard.",
  sourceTitle: "Taylor Swift NYU Commencement Speech",
};

function runThread(rounds: number, taskFor: (i: number) => typeof wordCustom = () => wordCustom): Body[] {
  const thread: Thread = { id: "word:x", anchor: { kind: "word", entryId: "x" }, turns: [] };
  const bodies: Body[] = [];
  for (let i = 1; i <= rounds; i++) {
    const task = taskFor(i);
    const req = task.build({ ...INPUT, question: `第 ${i} 個問題` }, { profile: defaultLearnerProfile(), history: historyOf(thread) });
    bodies.push(buildAnthropicBody(req, "claude-sonnet-5") as Body);
    const at = new Date(2026, 9, 4, 0, i).toISOString();
    const user: Turn = { id: `u${i}`, role: "user", content: `第 ${i} 個問題`, at, status: "done", sent: req.messages.at(-1)?.content };
    const answer: Turn = { id: `a${i}`, role: "assistant", content: `回答 ${i}`, at, status: "done" };
    thread.turns.push(user, answer);
  }
  return bodies;
}

// What the model actually sees: cache markers moved aside, and a string
// content treated as the single text block it is shorthand for.
const text = (c: string | Block[]) => (typeof c === "string" ? c : c.map((b) => b.text).join(""));
const plain = (m: Msg) => ({ role: m.role, text: text(m.content) });
const marked = (b: Body) => b.messages.findIndex((m) => typeof m.content !== "string" && m.content.some((x) => x.cache_control));
const breakpoints = (b: Body) => (JSON.stringify(b).match(/"cache_control"/g) ?? []).length;

// Did `next` keep the exact prefix up to `prev`'s message breakpoint?
function readsPrevious(prev: Body, next: Body): boolean {
  const k = marked(prev);
  if (k < 0) return false;
  const sys = (b: Body) => JSON.stringify(b.system.map((x) => x.text));
  return sys(prev) === sys(next) && JSON.stringify(prev.messages.slice(0, k + 1).map(plain)) === JSON.stringify(next.messages.slice(0, k + 1).map(plain));
}

describe("conversation prompt cache across a word thread", () => {
  it("the Anthropic body puts breakpoints on the base prompt and the last history message, with low effort", () => {
    const body = runThread(3)[2];
    const outline = {
      model: body.model,
      output_config: body.output_config,
      system: body.system.map((b) => ({ text: b.text.slice(0, 16), cache: !!b.cache_control })),
      messages: body.messages.map((m) => ({ role: m.role, text: text(m.content).slice(0, 32), cache: typeof m.content !== "string" })),
    };
    expect(outline).toMatchSnapshot();
    expect(breakpoints(body)).toBe(2);
  });

  it("replays each earlier question exactly as it was sent", () => {
    const bodies = runThread(4);
    for (let n = 1; n < bodies.length; n++) {
      const prev = bodies[n - 1].messages.map(plain);
      // The whole previous request (history + question) is a prefix of the next one.
      expect(bodies[n].messages.slice(0, prev.length).map(plain)).toEqual(prev);
    }
  });

  it("every follow-up reads the previous breakpoint, except when old rounds are dropped", () => {
    const bodies = runThread(15);
    const hits = bodies.slice(1).map((b, i) => readsPrevious(bodies[i], b));
    // Request n (1-based) has n-1 rounds of history. The first has no
    // history breakpoint; rounds are dropped on requests 8, 11 and 14.
    expect(hits).toEqual([
      false, // 2nd request: the 1st had no history to mark
      true, true, true, true, true, // 3–7
      false, true, true, // 8 drops q1–q3
      false, true, true, // 11 drops q4–q6
      false, true, // 14 drops q7–q9
    ]);
    for (const b of bodies) expect(breakpoints(b)).toBeLessThanOrEqual(4);
  });

  it("switching to another task on the same tier keeps the history prefix", () => {
    // usage and compare are on different tiers (models), which never share a
    // cache; custom and compare are both smart-tier.
    const bodies = runThread(3, (i) => (i === 3 ? wordCompare : wordCustom));
    expect(readsPrevious(bodies[1], bodies[2])).toBe(true);
    expect(wordUsage.tier).not.toBe(wordCompare.tier);
  });
});
