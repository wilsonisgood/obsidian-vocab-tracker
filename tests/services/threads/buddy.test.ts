import { describe, expect, it } from "vitest";
import type { ShareItem } from "../../../src/core/learner/sharePick";
import type { AskEvent } from "../../../src/core/model/learner";
import { VocabStore } from "../../../src/core/store/VocabStore";
import { ThreadService } from "../../../src/services/threads/ThreadService";
import { MemoryStorage } from "../ai/fakes";
import { FakeAi, result, render, type Script } from "./fakes";

function setup(
  script: Script = async () => result("ok"),
  buddyContext?: (taskId: string) => Promise<string>,
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

describe("buddy context by task", () => {
  it("passes the task id to buddyContext", async () => {
    const seen: string[] = [];
    const { threads } = setup(undefined, async (taskId) => (seen.push(taskId), ""));
    const id = (await threads.askBuddy(null, { taskId: "buddy.grammar" })) as string;
    await threads.askBuddy(id, { taskId: "buddy.custom", question: "q" });
    expect(seen).toEqual(["buddy.grammar", "buddy.custom"]);
  });
});

describe("buddy suggestions", () => {
  it("parses the 〔接著聊〕 line into the answer turn, keeping the raw text", async () => {
    const { threads } = setup(async () => result("好的。\n〔接著聊〕貓的英文｜點餐用語｜夢想旅行"));
    const id = (await threads.askBuddy(null, { taskId: "buddy.custom", question: "q" })) as string;
    const answer = threads.get(id)?.turns[1];
    expect(answer?.suggestions).toEqual(["貓的英文", "點餐用語", "夢想旅行"]);
    expect(answer?.content).toContain("〔接著聊〕");
  });
  it("no line, no suggestions", async () => {
    const { threads } = setup();
    const id = (await threads.askBuddy(null, { taskId: "buddy.custom", question: "q" })) as string;
    expect(threads.get(id)?.turns[1].suggestions).toBeUndefined();
  });
});

describe("buddy archive (oldest 8 of 10 live groups)", () => {
  function withArchive(over: { exists?: (p: string) => boolean; hasNote?: (id: string) => boolean; fail?: boolean } = {}) {
    const files = new Map<string, string>();
    const saved: string[] = [];
    const s = setup(undefined, undefined, {
      buddyArchive: {
        folder: () => "vocab-list/討論串",
        exists: over.exists ?? ((p) => files.has(p)),
        create: async (p, c) => {
          if (over.fail) throw new Error("disk full");
          files.set(p, c);
        },
        hasNote: over.hasNote,
        onSaved: (p) => saved.push(p),
      },
    });
    return { ...s, files, saved };
  }
  const ask = (threads: ThreadService, id: string | null, n: number) => threads.askBuddy(id, { taskId: "buddy.custom", question: `q${n}` });
  const live = (threads: ThreadService, id: string) => threads.get(id)?.turns.filter((t) => !t.deletedAt && t.role === "user").map((t) => t.question);
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("waits for 10, saves and deletes the oldest 8, keeps the newest 2, then counts on", async () => {
    const { threads, files, saved } = withArchive();
    const id = (await ask(threads, null, 0)) as string;
    for (let n = 1; n < 9; n++) await ask(threads, id, n);
    await flush();
    expect(files.size).toBe(0);
    await ask(threads, id, 9);
    await flush();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^vocab-list\/討論串\/Buddy-0_8-\d{12}\.md$/);
    const note = [...files.values()][0];
    expect(note).toContain("**你**：q0");
    expect(note).toContain("**你**：q7");
    expect(note).not.toContain("**你**：q8");
    expect(live(threads, id)).toEqual(["q8", "q9"]);
    expect(threads.get(id)?.archivedCount).toBe(8);
    // tombstoned, not removed
    expect(threads.get(id)?.turns).toHaveLength(20);
    for (let n = 10; n < 18; n++) await ask(threads, id, n);
    await flush();
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatch(/Buddy-8_16-/);
    expect(live(threads, id)).toEqual(["q16", "q17"]);
    expect(threads.get(id)?.archivedCount).toBe(16);
  });

  it("deletes nothing when the note can't be written", async () => {
    const { threads, files } = withArchive({ fail: true });
    const id = (await ask(threads, null, 0)) as string;
    for (let n = 1; n < 10; n++) await ask(threads, id, n);
    await flush();
    expect(files.size).toBe(0);
    expect(live(threads, id)).toHaveLength(10);
    expect(threads.get(id)?.archivedCount).toBeUndefined();
  });

  it("doesn't rewrite a note that already exists, but still tidies the chat", async () => {
    const { threads, files } = withArchive({ hasNote: () => true });
    const id = (await ask(threads, null, 0)) as string;
    for (let n = 1; n < 10; n++) await ask(threads, id, n);
    await flush();
    expect(files.size).toBe(0);
    expect(live(threads, id)).toEqual(["q8", "q9"]);
  });
});
