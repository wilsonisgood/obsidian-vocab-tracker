import { describe, expect, it } from "vitest";
import type { AskEvent } from "../../../src/core/model/learner";
import { VocabStore } from "../../../src/core/store/VocabStore";
import { ThreadService } from "../../../src/services/threads/ThreadService";
import { MemoryStorage } from "../ai/fakes";
import { FakeAi, result, render, type Script } from "./fakes";

function setup(script: Script = async () => result("ok"), buddyContext?: () => Promise<string>) {
  const store = new VocabStore({ entries: [] }, async () => {});
  const got: AskEvent[] = [];
  let n = 0;
  let tick = 0;
  const ai = new FakeAi(script);
  const threads = new ThreadService({
    storage: new MemoryStorage(), store, ai, notes: { read: async () => "x" },
    newId: () => `id${++n}`, onAsked: (e) => got.push(e), buddyContext,
    clock: () => new Date(Date.UTC(2026, 9, 1, 0, 0, ++tick)),
  });
  return { threads, ai, got };
}

describe("ThreadService buddy", () => {
  it("askBuddy(null) starts a new buddy thread and returns its id", async () => {
    const { threads } = setup();
    const id = await threads.askBuddy(null, { taskId: "buddy.custom", question: "hi" });
    expect(id).toMatch(/^buddy:/);
    const th = threads.get(id as string);
    expect(th?.anchor).toEqual({ kind: "buddy" });
    expect(th?.turns).toHaveLength(2);
  });

  it("askBuddy(id) continues the same thread and replays history", async () => {
    const { threads, ai } = setup();
    const id = (await threads.askBuddy(null, { taskId: "buddy.custom", question: "one" })) as string;
    expect(await threads.askBuddy(id, { taskId: "buddy.plan" })).toBe(id);
    expect(threads.get(id)?.turns).toHaveLength(4);
    expect(ai.requests[1].messages.length).toBe(3);
  });

  it("refuses an id that belongs to another kind of thread", async () => {
    const { threads } = setup();
    await threads.ask({ threadId: "word:x", anchor: { kind: "trivia" } as never, taskId: "buddy.custom", input: { context: "" }, display: "d" });
    expect(await threads.askBuddy("word:x", { taskId: "buddy.custom", question: "q" })).toBeNull();
  });

  it("buddyThreads lists live buddy threads, newest first", async () => {
    const { threads } = setup();
    const a = (await threads.askBuddy(null, { taskId: "buddy.custom", question: "a" })) as string;
    const b = (await threads.askBuddy(null, { taskId: "buddy.custom", question: "b" })) as string;
    expect(threads.buddyThreads().map((x) => x.id)).toEqual([b, a]);
    await threads.askBuddy(a, { taskId: "buddy.custom", question: "again" });
    expect(threads.buddyThreads().map((x) => x.id)).toEqual([a, b]);
    await threads.deleteThread(b);
    expect(threads.buddyThreads().map((x) => x.id)).toEqual([a]);
  });

  it("reports surface buddy to onAsked", async () => {
    const { threads, got } = setup();
    await threads.askBuddy(null, { taskId: "buddy.level" });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ surface: "buddy", taskId: "buddy.level", ok: true, custom: false });
  });

  it("feeds the context into the cached block; a failing context becomes empty", async () => {
    const ok = setup(undefined, async () => "【學習紀錄摘要】\n- X");
    await ok.threads.askBuddy(null, { taskId: "buddy.custom", question: "q" });
    expect(render(ok.ai.requests[0])).toContain("(cache) ──\n〔學習者背景〕\n【學習紀錄摘要】");
    const bad = setup(undefined, async () => {
      throw new Error("boom");
    });
    await bad.threads.askBuddy(null, { taskId: "buddy.custom", question: "q" });
    expect(bad.ai.requests[0].system.slice(1).some((b) => b.cache)).toBe(false);
  });
});
