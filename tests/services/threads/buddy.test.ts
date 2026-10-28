import { describe, expect, it } from "vitest";
import type { ShareItem } from "../../../src/core/learner/sharePick";
import type { AskEvent } from "../../../src/core/model/learner";
import { VocabStore } from "../../../src/core/store/VocabStore";
import { ThreadService } from "../../../src/services/threads/ThreadService";
import { MemoryStorage } from "../ai/fakes";
import { FakeAi, result, render, type Script } from "./fakes";

function setup(
  script: Script = async () => result("ok"),
  buddyContext?: () => Promise<string>,
  extra: Partial<ConstructorParameters<typeof ThreadService>[0]> = {}
) {
  const store = new VocabStore({ entries: [] }, async () => {});
  const got: AskEvent[] = [];
  let n = 0;
  let tick = 0;
  const ai = new FakeAi(script);
  const threads = new ThreadService({
    storage: new MemoryStorage(), store, ai, notes: { read: async () => "x" },
    newId: () => `id${++n}`, onAsked: (e) => got.push(e), buddyContext,
    clock: () => new Date(Date.UTC(2026, 9, 1, 0, 0, ++tick)),
    ...extra,
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

describe("buddy.share", () => {
  const word = (w: string): ShareItem => ({ kind: "word", key: `w:${w}`, word: w, meaning: "意思" });

  it("hands one picked item to the prompt and avoids the last picks", async () => {
    const { threads, ai } = setup(undefined, undefined, { shareMaterial: async () => [word("a"), word("b")], random: () => 0 });
    const id = (await threads.askBuddy(null, { taskId: "buddy.share" })) as string;
    expect(render(ai.requests[0])).toContain("單字：a（意思）");
    await threads.askBuddy(id, { taskId: "buddy.share" });
    expect(render(ai.requests[1])).toContain("單字：b（意思）");
  });

  it("with no material, invites a chat about what he read", async () => {
    const { threads, ai } = setup(undefined, undefined, { shareMaterial: async () => [] });
    await threads.askBuddy(null, { taskId: "buddy.share" });
    expect(render(ai.requests[0])).toContain("目前找不到他最近讀過的東西");
  });
});

describe("buddy ten-question archive", () => {
  function withArchive(over: { exists?: (p: string) => boolean; hasNote?: (id: string) => boolean } = {}) {
    const files = new Map<string, string>();
    const saved: [string, number, number][] = [];
    const s = setup(undefined, undefined, {
      buddyArchive: {
        folder: () => "vocab-list/討論串",
        exists: over.exists ?? ((p) => files.has(p)),
        create: async (p, c) => void files.set(p, c),
        hasNote: over.hasNote,
        onSaved: (p, a, b) => saved.push([p, a, b]),
      },
    });
    return { ...s, files, saved };
  }
  const ask = (threads: ThreadService, id: string | null, n: number) => threads.askBuddy(id, { taskId: "buddy.custom", question: `q${n}` });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("saves questions 1–10 once, then 11–20, not before", async () => {
    const { threads, files, saved } = withArchive();
    const id = (await ask(threads, null, 0)) as string;
    for (let n = 1; n < 9; n++) await ask(threads, id, n);
    await flush();
    expect(files.size).toBe(0);
    await ask(threads, id, 9);
    await flush();
    expect(saved).toHaveLength(1);
    expect(saved[0][0]).toMatch(/^vocab-list\/討論串\/Buddy-0_10-\d{12}\.md$/);
    expect([saved[0][1], saved[0][2]]).toEqual([0, 10]);
    expect([...files.values()][0]).toContain("**你**：q9");
    expect(threads.get(id)?.archived).toEqual([0]);
    await ask(threads, id, 10);
    await flush();
    expect(files.size).toBe(1);
    for (let n = 11; n < 20; n++) await ask(threads, id, n);
    await flush();
    expect(saved.map((x) => [x[1], x[2]])).toEqual([[0, 10], [10, 20]]);
  });

  it("doesn't rewrite a batch already marked saved, and skips one another device saved", async () => {
    const { threads, files } = withArchive({ hasNote: () => true });
    const id = (await ask(threads, null, 0)) as string;
    for (let n = 1; n < 10; n++) await ask(threads, id, n);
    await flush();
    expect(files.size).toBe(0);
    expect(threads.get(id)?.archived).toEqual([0]);
  });
});
