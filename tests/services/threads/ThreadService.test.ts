import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Thread } from "../../../src/core/model/thread";
import type { NoteReaderPort } from "../../../src/core/ports";
import { VocabStore } from "../../../src/core/store/VocabStore";
import type { AiRunResult } from "../../../src/services/ai/AiService";
import { AiError } from "../../../src/services/ai/errors";
import { historyOf, THREADS_SHARD, ThreadService } from "../../../src/services/threads/ThreadService";
import { addPin, pinText, removePin } from "../../../src/services/threads/pin";
import { MemoryStorage } from "../ai/fakes";
import { FakeAi, result, type Script } from "./fakes";

const NOTE = "# Speech\n\nLast time I was in a stadium this size, I was wearing a ==glittery== leotard.\n\nThe end.";

function entry(): VocabEntry {
  return {
    id: "e1",
    word: "glittery",
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "閃亮的",
    phonetic: "",
    partOfSpeech: "adjective",
    grammar: "",
    source: { path: "eng/Speech.md", line: 2 },
    added: "",
    lastReviewed: "",
    reviews: 0,
  };
}

function setup(script: Script) {
  const storage = new MemoryStorage();
  const store = new VocabStore({ entries: [entry()] }, async () => {});
  const ai = new FakeAi(script);
  const notes: NoteReaderPort = { read: async (p) => (p === "eng/Speech.md" ? NOTE : null) };
  let n = 0;
  let clock = Date.parse("2026-10-04T08:00:00Z");
  const threads = new ThreadService({
    storage,
    store,
    ai,
    notes,
    clock: () => new Date((clock += 1000)),
    newId: () => `id${++n}`,
  });
  return { storage, store, ai, threads, entry: store.entries[0] };
}

describe("ThreadService.askWord", () => {
  it("streams an answer into a new word thread and saves it", async () => {
    const { threads, ai, storage, entry } = setup(async (_req, opt) => {
      opt.onDelta?.("你問的是");
      opt.onDelta?.("：…");
      return result("你問的是：…\n\n**glittery** = 閃亮的");
    });
    const deltas: string[] = [];
    threads.events.on("thread:turn-delta", (d) => deltas.push(d.text));

    await threads.askWord(entry, { taskId: "word.usage", selection: "wearing a glittery leotard" });

    expect(deltas).toEqual(["你問的是", "你問的是：…"]);
    const th = threads.wordThread("e1") as Thread;
    expect(th.anchor).toEqual({ kind: "word", entryId: "e1", origin: { path: "eng/Speech.md" } });
    const [q, a] = th.turns;
    expect(q).toMatchObject({ role: "user", content: "Usage", taskId: "word.usage", selection: "wearing a glittery leotard" });
    expect(q.sent).toContain("〔選取的文字〕\nwearing a glittery leotard");
    expect(a).toMatchObject({ role: "assistant", status: "done", taskVersion: 3, model: "claude-sonnet-5", stop: "end" });
    expect(threads.isBusy(th.id)).toBe(false);
    expect(threads.wordQuestionCount("e1")).toBe(1);

    // The prompt got the full source paragraph, without highlight marks.
    expect(ai.requests[0].system[1].text).toContain("I was wearing a glittery leotard.");

    await threads.flush();
    const saved = storage.shards.get(THREADS_SHARD) as { threads: Thread[] };
    expect(saved.threads[0].turns).toHaveLength(2);
  });

  it("replays earlier rounds verbatim as history", async () => {
    const { threads, ai, entry } = setup(async () => result("answer"));
    await threads.askWord(entry, { taskId: "word.compare" });
    await threads.askWord(entry, { taskId: "word.custom", question: "可以造一個句子嗎？" });

    const first = threads.wordThread("e1")?.turns[0];
    const second = ai.requests[1];
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second.messages[0].content).toBe(first?.sent);
    expect(second.messages[1].content).toBe("answer");
    expect(second.messages[2].content).toContain("可以造一個句子嗎？");
    expect(threads.wordThread("e1")?.turns[2].content).toBe("可以造一個句子嗎？");
  });

  it("keeps the streamed text when stopped", async () => {
    const { threads, entry } = setup(
      (_req, opt) =>
        new Promise((_resolve, reject) => {
          opt.onDelta?.("half an ");
          opt.onDelta?.("answer");
          setTimeout(() => reject(new AiError("aborted", undefined, { partialText: "half an answer" })), 0);
        })
    );
    const pending = threads.askWord(entry, { taskId: "word.usage" });
    await new Promise((r) => setTimeout(r, 0));
    expect(threads.isBusy("word:e1")).toBe(true);
    await pending;

    const a = threads.wordThread("e1")?.turns[1];
    expect(a).toMatchObject({ status: "aborted", content: "half an answer" });
    // A stopped answer with text still counts as context for the next question.
    expect(historyOf(threads.wordThread("e1"))).toHaveLength(2);
  });

  it("records errors and leaves failed rounds out of the history", async () => {
    const { threads, entry } = setup(async () => {
      throw new AiError("bad_request", "model: claude-nope not found");
    });
    await threads.askWord(entry, { taskId: "word.usage" });
    const a = threads.wordThread("e1")?.turns[1];
    expect(a).toMatchObject({ status: "error", error: "bad_request", errorMessage: "model: claude-nope not found" });
    expect(historyOf(threads.wordThread("e1"))).toEqual([]);
  });

  it("retry tombstones the failed round and asks the same question again", async () => {
    let fail = true;
    const { threads, entry } = setup(async () => {
      if (fail) throw new AiError("overloaded");
      return result("ok");
    });
    await threads.askWord(entry, { taskId: "word.custom", question: "why?", selection: "glittery leotard" });
    fail = false;
    const failed = threads.wordThread("e1")?.turns[1].id as string;
    await threads.retryWord(entry, failed);

    const th = threads.wordThread("e1") as Thread;
    expect(th.turns.filter((t) => t.deletedAt)).toHaveLength(2);
    const live = th.turns.filter((t) => !t.deletedAt);
    expect(live.map((t) => t.content)).toEqual(["why?", "ok"]);
    expect(live[0].selection).toBe("glittery leotard");
    expect(threads.wordQuestionCount("e1")).toBe(1);
  });

  it("keeps a trivia round's subject on both turns", async () => {
    const { threads } = setup(async () => result("**Apron** 原本是 a napron"));
    await threads.ask({
      threadId: "trivia-session",
      anchor: { kind: "trivia-session" },
      taskId: "trivia.next",
      input: { knownWords: ["glittery"], told: [] },
      display: "再來一則",
      subjectEntryId: "e1",
    });
    expect(threads.get("trivia-session")!.turns.map((t) => t.subjectEntryId)).toEqual(["e1", "e1"]);
  });

  it("ignores a second question while one is streaming", async () => {
    let release: (r: AiRunResult) => void = () => {};
    const { threads, ai, entry } = setup(() => new Promise((r) => (release = r)));
    const first = threads.askWord(entry, { taskId: "word.usage" });
    await new Promise((r) => setTimeout(r, 0));
    await threads.askWord(entry, { taskId: "word.sentence" });
    release(result("done"));
    await first;
    expect(ai.requests).toHaveLength(1);
  });
});

describe("ThreadService persistence", () => {
  it("merges another device's turns on save instead of overwriting them", async () => {
    const { threads, storage, entry } = setup(async () => result("mine"));
    storage.shards.set(THREADS_SHARD, {
      threads: [
        {
          id: "word:e1",
          anchor: { kind: "word", entryId: "e1" },
          turns: [{ id: "phone-q", role: "user", content: "from phone", at: "2026-10-03T00:00:00Z", status: "done" }],
        },
      ],
    });
    await threads.ensureLoaded();
    // Synced in after we loaded: a second phone question.
    const disk = storage.shards.get(THREADS_SHARD) as { threads: Thread[] };
    disk.threads[0].turns.push({ id: "phone-q2", role: "user", content: "later", at: "2026-10-03T01:00:00Z", status: "done" });

    await threads.askWord(entry, { taskId: "word.usage" });
    await threads.flush();
    const saved = storage.shards.get(THREADS_SHARD) as { threads: Thread[] };
    expect(saved.threads[0].turns.map((t) => t.id)).toEqual(["phone-q", "phone-q2", "id1", "id2"]);
  });

  it("dispose saves an in-flight answer as stopped with its partial text", async () => {
    const { threads, storage, entry } = setup((_req, opt) => {
      opt.onDelta?.("partial");
      return new Promise(() => {});
    });
    void threads.askWord(entry, { taskId: "word.usage" });
    await new Promise((r) => setTimeout(r, 0));
    threads.dispose();
    await threads.flush();
    const saved = storage.shards.get(THREADS_SHARD) as { threads: Thread[] };
    expect(saved.threads[0].turns[1]).toMatchObject({ status: "aborted", content: "partial" });
  });

  it("settles turns left streaming on disk when first loaded", async () => {
    const { threads, storage } = setup(async () => result(""));
    storage.shards.set(THREADS_SHARD, {
      threads: [
        {
          id: "word:e1",
          anchor: { kind: "word", entryId: "e1" },
          turns: [{ id: "a", role: "assistant", content: "", at: "2026-10-03T00:00:00Z", status: "streaming" }],
        },
      ],
    });
    await threads.ensureLoaded();
    expect(threads.wordThread("e1")?.turns[0].status).toBe("aborted");
  });
});

describe("pin to grammar", () => {
  it("strips the scope line and appends / removes the answer", async () => {
    const { threads, entry } = setup(async () => result("你問的是：「I was wearing a glittery leotard.」\n\n**亮片感**的形容詞"));
    entry.grammar = "形容詞";
    await threads.askWord(entry, { taskId: "word.usage" });
    const answer = threads.wordThread("e1")?.turns[1].id as string;

    await threads.setPinned(entry, answer, true);
    expect(entry.grammar).toBe("形容詞\n\n**亮片感**的形容詞");
    expect(threads.wordThread("e1")?.turns[1].pinnedToGrammar).toBe(true);

    await threads.setPinned(entry, answer, false);
    expect(entry.grammar).toBe("形容詞");
  });

  it("strips the selection reminder before the scope line, so neither reaches the grammar note", async () => {
    const { threads, entry } = setup(async () =>
      result("你選取的文字裡似乎沒有 glittery，以下以出處段落為準。\n\n你問的是：「I was wearing a glittery leotard.」\n\n**亮片感**的形容詞")
    );
    entry.grammar = "形容詞";
    await threads.askWord(entry, { taskId: "word.usage", selection: "Someone read stories to you." });
    await threads.setPinned(entry, threads.wordThread("e1")?.turns[1].id as string, true);
    expect(entry.grammar).toBe("形容詞\n\n**亮片感**的形容詞");
  });

  it("pinText removes every reminder variant", () => {
    const body = "**亮片感**的形容詞";
    const scope = "你問的是：「wearing a glittery leotard」\n\n";
    for (const notice of [
      "你選取的文字裡沒有 glittery，以下以出處段落為準。",
      "你選取的文字裡似乎沒有 glittery，以下以出處段落為準。",
      "你選取的文字裡似乎沒有 toil，以下以出處句子為準。",
      "你選取的文字裡似乎沒有 toil，以下直接說明 toil。",
      "你選取的文字中好像沒有 glittery，所以以下以出處為準：",
      "**你選取的文字裡似乎沒有 glittery，以下以出處段落為準。**",
      "> 你選取的文字裡似乎沒有 glittery。",
    ]) {
      expect(pinText(`${notice}\n\n${scope}${body}`)).toBe(body);
      expect(pinText(`${notice}\n${body}`)).toBe(body);
    }
    expect(pinText("**你問的是：**「x」\n\nbody")).toBe("body");
    // Only a leading reminder is stripped; the same words inside the body stay.
    expect(pinText(`${body}\n\n你選取的文字裡似乎沒有 x`)).toBe(`${body}\n\n你選取的文字裡似乎沒有 x`);
  });

  it("helpers", () => {
    expect(pinText("你問的是：整段（¶2）\n\nbody")).toBe("body");
    expect(pinText("no scope line")).toBe("no scope line");
    expect(addPin("", "x")).toBe("x");
    expect(addPin("a\n\nx", "x")).toBe("a\n\nx");
    expect(removePin("a\n\nx\n\nb", "x")).toBe("a\n\nb");
    expect(removePin("edited", "x")).toBe("edited");
  });
});
