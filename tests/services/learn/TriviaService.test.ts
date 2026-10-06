import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../src/core/i18n";
import { TRIVIA_THREAD_ID } from "../../../src/core/model/trivia";
import type { TriviaThreadsPort } from "../../../src/services/learn/ports";
import { LearnStore } from "../../../src/services/learn/LearnStore";
import { TriviaService } from "../../../src/services/learn/TriviaService";
import type { ThreadService } from "../../../src/services/threads/ThreadService";
import { MemoryStorage } from "../ai/fakes";
import { entry, FakeThreads } from "./fakes";

const NOW = new Date("2026-10-04T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const APRON_ANSWER = "**a napron → an apron**\n\napron 原本是 *a napron*，和 **napkin** 同源。";

function setup(answer?: (p: { subjectEntryId?: string; taskId: string }) => string) {
  const entries = [
    entry("apron", "apron", { createdAt: daysAgo(2), partOfSpeech: "noun", definitionZh: "圍裙" }),
    entry("napkin", "napkin", { createdAt: daysAgo(20) }),
    entry("glittery", "glittery", { createdAt: daysAgo(40) }),
  ];
  const threads = new FakeThreads(answer ?? (() => APRON_ANSWER));
  const learn = new LearnStore({ storage: new MemoryStorage(), clock: () => NOW });
  let n = 0;
  let r = 0;
  const randoms = [0.1, 0.0];
  const trivia = new TriviaService({
    threads,
    vocab: { entries },
    learn,
    clock: () => NOW,
    random: () => randoms[r++ % randoms.length],
    newId: () => `item${++n}`,
  });
  return { entries, threads, learn, trivia };
}

describe("TriviaService.ask", () => {
  afterEach(() => setLocale("en"));

  it("picks a subject, tags the turns with it and sends the learned-word list", async () => {
    const { threads, trivia } = setup();
    setLocale("zh-TW");
    const result = await trivia.ask("next");

    // random 0.1 → fresh pool (apron is the only word from the last 14 days).
    expect(result?.entry.id).toBe("apron");
    expect(result).toMatchObject({ title: "a napron → an apron", body: "apron 原本是 *a napron*，和 **napkin** 同源。" });
    expect(result?.turnId).toBe(threads.get(TRIVIA_THREAD_ID)!.turns[1].id);
    const p = threads.asked[0];
    expect(p).toMatchObject({
      threadId: TRIVIA_THREAD_ID,
      anchor: { kind: "trivia-session" },
      taskId: "trivia.next",
      display: "再來一則",
      subjectEntryId: "apron",
    });
    const req = threads.requests[0];
    expect(req.system[1]).toEqual({ text: "〔已學單字〕\napron, napkin, glittery", cache: true });
    // Per-round blocks ride in the message, so the system prompt (and the
    // history cache behind it) stays the same from round to round.
    expect(req.system.some((b) => b.text.includes("〔這次的主角〕apron"))).toBe(false);
    expect(req.messages.at(-1)?.content).toContain("〔這次的主角〕apron");
    expect(req.messages.at(-1)?.content).toContain("任務：再來一則冷知識（主角：apron）");
    expect(trivia.currentSubject()?.id).toBe("apron");
  });

  it("keeps quiz / etymology / joke on the current subject, and next moves on", async () => {
    const { threads, trivia } = setup();
    await trivia.ask("next");
    await trivia.ask("etymology");
    await trivia.ask("joke");
    expect(threads.asked.map((p) => p.subjectEntryId)).toEqual(["apron", "apron", "apron"]);

    await trivia.ask("next");
    // apron was just told → excluded; only older words remain.
    expect(threads.asked[3].subjectEntryId).not.toBe("apron");
  });

  it("talks about a given word when asked from its word page", async () => {
    const { threads, trivia } = setup();
    await trivia.ask("next", { entryId: "glittery" });
    expect(threads.asked[0].subjectEntryId).toBe("glittery");
  });

  it("sends the titles already told so the model doesn't repeat them", async () => {
    const { threads, trivia } = setup();
    await trivia.ask("next");
    await trivia.ask("quiz");
    expect(trivia.told()).toEqual([
      { word: "apron", title: "a napron → an apron" },
      { word: "apron", title: "a napron → an apron" },
    ]);
    const last = threads.requests[1].messages.at(-1)?.content ?? "";
    expect(last).toContain("〔已講過的冷知識〕");
    expect(last).toContain("- apron：a napron → an apron");
  });

  it("follow-ups stay on the current subject and carry the question", async () => {
    const { threads, trivia } = setup();
    await trivia.ask("next");
    await trivia.followup("  還有類似的例子嗎？ ", "a napron");
    const p = threads.asked[1];
    expect(p).toMatchObject({ taskId: "trivia.followup", display: "還有類似的例子嗎？", question: "還有類似的例子嗎？", subjectEntryId: "apron" });
    const req = threads.requests[1];
    expect(req.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(req.messages.at(-1)?.content).toContain("〔選取的文字〕\na napron");
    // Follow-ups aren't counted as told rounds.
    expect(trivia.told()).toHaveLength(1);

    await trivia.followup("   ");
    expect(threads.asked).toHaveLength(2);
  });

  it("does nothing while an answer is streaming, or with no words", async () => {
    const { threads, trivia } = setup();
    threads.busy = true;
    expect(await trivia.ask("next")).toBeUndefined();
    expect(threads.asked).toHaveLength(0);

    const empty = new TriviaService({ threads: new FakeThreads(), vocab: { entries: [] }, learn: new LearnStore({ storage: new MemoryStorage() }) });
    expect(await empty.ask("next")).toBeUndefined();
  });

  it("still resolves with the subject (no turnId/title/body) when the answer fails", async () => {
    const { threads, trivia } = setup();
    // FakeThreads always writes a "done" turn; simulate a failure the way
    // retry() finds one — flip the just-written answer to "error" first.
    const original = threads.ask.bind(threads);
    threads.ask = async (p) => {
      await original(p);
      threads.get(TRIVIA_THREAD_ID)!.turns.at(-1)!.status = "error";
    };
    const result = await trivia.ask("next");
    expect(result).toEqual({ entry: expect.objectContaining({ id: "apron" }) });
    expect(result?.turnId).toBeUndefined();
  });

  it("stop() cancels the trivia thread", () => {
    const { threads, trivia } = setup();
    trivia.stop();
    expect(threads.stopped).toEqual([TRIVIA_THREAD_ID]);
  });
});

describe("TriviaService favorites", () => {
  it("saves an answer on its subject with title, body and mentions", async () => {
    const { trivia, threads } = setup();
    await trivia.ask("next");
    const answerId = threads.get(TRIVIA_THREAD_ID)!.turns[1].id;

    const item = trivia.favorite(answerId);
    expect(item).toMatchObject({
      id: "item1",
      entryId: "apron",
      title: "a napron → an apron",
      body: "apron 原本是 *a napron*，和 **napkin** 同源。",
      mentions: ["napkin"],
      fromTurnId: answerId,
    });
    // Idempotent per turn.
    expect(trivia.favorite(answerId)).toBe(item);
    expect(trivia.favoriteOf(answerId)).toBe(item);
    expect(trivia.favorites("apron")).toEqual([item]);
    expect(trivia.favorites("napkin")).toEqual([]);
    // Back-link on napkin's word page.
    expect(trivia.mentioning("napkin")).toEqual([item]);
    expect(trivia.mentioning("apron")).toEqual([]);

    trivia.unfavorite(item!.id);
    expect(trivia.favorites()).toEqual([]);
    expect(trivia.favoriteOf(answerId)).toBeUndefined();
  });

  it("saves a follow-up answer on the subject it was about", async () => {
    const { trivia, threads } = setup((p) => (p.taskId === "trivia.followup" ? "有，nickname 剛好反過來。" : APRON_ANSWER));
    await trivia.ask("next");
    await trivia.followup("還有類似的例子嗎？");
    const followupAnswer = threads.get(TRIVIA_THREAD_ID)!.turns[3].id;
    expect(trivia.favorite(followupAnswer)).toMatchObject({ entryId: "apron", title: "有，nickname 剛好反過來。" });
  });

  it("refuses user turns, unknown turns and answers without a subject", async () => {
    const { trivia, threads } = setup();
    await trivia.ask("next");
    const th = threads.get(TRIVIA_THREAD_ID)!;
    expect(trivia.favorite(th.turns[0].id)).toBeUndefined();
    expect(trivia.favorite("nope")).toBeUndefined();
    delete th.turns[0].subjectEntryId;
    delete th.turns[1].subjectEntryId;
    expect(trivia.favorite(th.turns[1].id)).toBeUndefined();
  });
});

describe("ThreadService compatibility", () => {
  it("ThreadService satisfies the port TriviaService needs", () => {
    // Type-level check: fails to compile if ThreadService's API drifts.
    const asPort = (t: ThreadService): TriviaThreadsPort => t;
    expect(typeof asPort).toBe("function");
  });
});

describe("TriviaService.retry", () => {
  const live = (threads: FakeThreads) => threads.get(TRIVIA_THREAD_ID)!.turns.filter((t) => !t.deletedAt);

  it("tombstones a failed quick action and asks the same kind about the same word", async () => {
    const { trivia, threads } = setup();
    await trivia.ask("etymology", { entryId: "glittery" });
    const failed = threads.get(TRIVIA_THREAD_ID)!.turns[1];
    failed.status = "error";

    await trivia.retry(failed.id);
    expect(threads.asked).toHaveLength(2);
    expect(threads.asked[1]).toMatchObject({ taskId: "trivia.etymology", subjectEntryId: "glittery" });
    expect(failed.deletedAt).toBeDefined();
    expect(live(threads)).toHaveLength(2);
  });

  it("keeps 「再來一則」 on the word of the failed round instead of picking a new one", async () => {
    const { trivia, threads } = setup();
    await trivia.ask("next", { entryId: "napkin" });
    const failed = threads.get(TRIVIA_THREAD_ID)!.turns[1];
    await trivia.retry(failed.id);
    expect(threads.asked[1]).toMatchObject({ taskId: "trivia.next", subjectEntryId: "napkin" });
  });

  it("asks a failed follow-up again with the same question", async () => {
    const { trivia, threads } = setup();
    await trivia.ask("next");
    await trivia.followup("還有類似的例子嗎？");
    const failed = threads.get(TRIVIA_THREAD_ID)!.turns[3];

    await trivia.retry(failed.id);
    expect(threads.asked).toHaveLength(3);
    expect(threads.asked[2]).toMatchObject({ taskId: "trivia.followup", question: "還有類似的例子嗎？", subjectEntryId: "apron" });
    expect(live(threads).map((t) => t.id)).toEqual(["t1", "t2", "t5", "t6"]);
  });

  it("does nothing for a user turn, an unknown turn, or while busy", async () => {
    const { trivia, threads } = setup();
    await trivia.ask("next");
    const [q, a] = threads.get(TRIVIA_THREAD_ID)!.turns;
    await trivia.retry(q.id);
    await trivia.retry("nope");
    threads.busy = true;
    await trivia.retry(a.id);
    expect(threads.asked).toHaveLength(1);
    expect(a.deletedAt).toBeUndefined();
  });
});
