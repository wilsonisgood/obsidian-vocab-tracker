import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Thread } from "../../../src/core/model/thread";
import { VocabStore } from "../../../src/core/store/VocabStore";
import type { AiRunResult } from "../../../src/services/ai/AiService";
import { AiError } from "../../../src/services/ai/errors";
import { ParagraphAnchorService, type ParagraphAnchor } from "../../../src/services/anchors/ParagraphAnchorService";
import { ParagraphIndex } from "../../../src/services/anchors/ParagraphIndex";
import type { AnchorMode } from "../../../src/core/ports";
import { sectionText } from "../../../src/services/anchors/sections";
import { THREADS_SHARD, ThreadService } from "../../../src/services/threads/ThreadService";
import { MemoryStorage } from "../ai/fakes";
import { idSource, MemoryVault } from "../anchors/fakes";
import { FakeAi, render, result, type Script } from "./fakes";

const PATH = "eng/Taylor Swift NYU Commencement Speech.md";
const NOTE = [
  "# Commencement", // 0
  "", // 1
  "Hi. Hello. Hi.", // 2
  "", // 3
  "Last time I was in a stadium this size, I was dancing in heels and wearing a ==glittery== leotard.", // 4
  "This ensemble is much more my speed.", // 5
  "", // 6
  "To the honorees and everyone who came today — I am ==elated== to be here.", // 7
].join("\n");

function entry(id: string, word: string): VocabEntry {
  return {
    id,
    word,
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: { path: PATH, line: 4 },
    added: "",
    lastReviewed: "",
    reviews: 0,
  };
}

function setup(script: Script, mode: AnchorMode = "block") {
  const storage = new MemoryStorage();
  const store = new VocabStore({ entries: [entry("e1", "glittery"), entry("e2", "elated"), entry("e3", "ensemble")] }, async () => {});
  const ai = new FakeAi(script);
  const vault = new MemoryVault({ [PATH]: NOTE });
  const anchors = new ParagraphAnchorService({ vault, mode: () => mode, random: idSource("p4r4gr") });
  let n = 0;
  let clock = Date.parse("2026-10-04T08:00:00Z");
  const threads = new ThreadService({
    storage,
    store,
    ai,
    notes: vault,
    anchors,
    clock: () => new Date((clock += 1000)),
    newId: () => `id${++n}`,
  });
  const index = new ParagraphIndex();
  index.attach(threads);
  return { storage, store, ai, vault, threads, index };
}

const section = (content: string, lineStart: number, lineEnd: number) => ({
  path: PATH,
  lineStart,
  lineEnd,
  text: sectionText(content, lineStart, lineEnd),
});

describe("ThreadService.askParagraph", () => {
  it("first question anchors the paragraph, creates the thread and sends the article", async () => {
    const { threads, ai, vault, storage } = setup(async () => result("你問的是：整段（¶3）\n\n她在開玩笑。"));
    const id = await threads.askParagraph(section(NOTE, 4, 5), { taskId: "paragraph.translate" });

    expect(id).toBe("paragraph:id1");
    expect(vault.files.get(PATH)?.split("\n")[5]).toBe("This ensemble is much more my speed. ^vt-p4r4gr");
    const th = threads.get(id as string) as Thread;
    expect(th.anchor).toMatchObject({ kind: "paragraph", path: PATH, blockId: "vt-p4r4gr" });
    const [q, a] = th.turns;
    expect(q).toMatchObject({ role: "user", content: "Translate", taskId: "paragraph.translate" });
    expect(q.sent).toBe(ai.requests[0].messages.at(-1)?.content);
    expect(a).toMatchObject({ role: "assistant", status: "done", taskVersion: 2 });
    expect(threads.paragraphQuestionCount(th.id)).toBe(1);

    await threads.flush();
    expect((storage.shards.get(THREADS_SHARD) as { threads: Thread[] }).threads).toHaveLength(1);
  });

  it("snapshot: the request for a custom question with a selection", async () => {
    const { threads, ai } = setup(async () => result("ok"));
    await threads.askParagraph(section(NOTE, 4, 5), {
      taskId: "paragraph.custom",
      question: "「more my speed」是什麼意思？",
      selection: "much more my speed",
    });
    expect(render(ai.requests[0])).toMatchSnapshot();
  });

  it("snapshot: vocab only lists known words that are in the paragraph", async () => {
    const { threads, ai } = setup(async () => result("ok"), "hash");
    await threads.askParagraph(section(NOTE, 4, 5), { taskId: "paragraph.vocab" });
    const last = ai.requests[0].messages.at(-1)?.content ?? "";
    expect(last).toContain("glittery, ensemble");
    expect(last).not.toContain("elated");
    expect(last).toMatchSnapshot();
  });

  it("follow-ups reuse the thread and replay `sent` verbatim as history", async () => {
    const { threads, ai, vault } = setup(async () => result("answer"));
    const id = await threads.askParagraph(section(NOTE, 4, 5), { taskId: "paragraph.grammar" });
    // The UI now sees the paragraph with its block id.
    const now = vault.files.get(PATH) ?? "";
    const again = await threads.askParagraph(section(now, 4, 5), { taskId: "paragraph.custom", question: "再解釋一次？" });
    expect(again).toBe(id);
    expect(threads.paragraphThreads(PATH)).toHaveLength(1);

    const first = threads.get(id as string)?.turns[0];
    const second = ai.requests[1];
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second.messages[0].content).toBe(first?.sent);
    expect(second.messages[1].content).toBe("answer");
    expect(vault.writes).toEqual([PATH]);
  });

  it("the discussion follows the paragraph when it moves", async () => {
    const { threads, ai, vault } = setup(async () => result("ok"));
    const id = (await threads.askParagraph(section(NOTE, 4, 5), { taskId: "paragraph.grammar" })) as string;
    vault.files.set(PATH, (vault.files.get(PATH) ?? "").replace("Hi. Hello. Hi.", "A new opening.\n\nHi. Hello. Hi."));
    await threads.askParagraph({ threadId: id }, { taskId: "paragraph.translate" });
    // Now ¶4 in the article, and still the same paragraph.
    expect(ai.requests[1].system[2].text).toContain("〔目前段落〕¶4\nLast time I was in a stadium");
    expect(await threads.paragraphStatus(id)).toMatchObject({ status: "found", via: "blockId", edited: false });
  });

  it("hash mode: no note edits, and an edited paragraph turns the thread orphaned", async () => {
    const { threads, vault, index } = setup(async () => result("ok"), "hash");
    const id = (await threads.askParagraph(section(NOTE, 2, 2), { taskId: "paragraph.translate" })) as string;
    expect(vault.writes).toEqual([]);
    expect((threads.get(id)?.anchor as ParagraphAnchor).blockId).toBeUndefined();
    expect(index.count(PATH, "Hi. Hello. Hi.")).toBe(1);
    expect(threads.paragraphThread(PATH, "Hi. ==Hello==. Hi.")?.id).toBe(id);

    vault.files.set(PATH, NOTE.replace("Hi. Hello. Hi.", "Hi there."));
    expect(await threads.paragraphStatus(id)).toEqual({ status: "orphan", reason: "missing-paragraph" });
  });

  it("block mode: an edited paragraph is still found, flagged 原文已修改", async () => {
    const { threads, vault } = setup(async () => result("ok"));
    const id = (await threads.askParagraph(section(NOTE, 2, 2), { taskId: "paragraph.translate" })) as string;
    vault.files.set(PATH, (vault.files.get(PATH) ?? "").replace("Hi. Hello. Hi.", "Hi there."));
    expect(await threads.paragraphStatus(id)).toMatchObject({ status: "found", via: "blockId", edited: true });
  });

  it("an orphaned thread (note deleted) can still be asked about its snapshot", async () => {
    const { threads, vault, ai } = setup(async () => result("ok"));
    const id = (await threads.askParagraph(section(NOTE, 2, 2), { taskId: "paragraph.translate" })) as string;
    vault.files.delete(PATH);
    expect(await threads.paragraphStatus(id)).toEqual({ status: "orphan", reason: "missing-file" });
    await threads.askParagraph({ threadId: id }, { taskId: "paragraph.grammar" });
    expect(ai.requests[1].system[2].text).toBe("〔目前段落〕¶1\nHi. Hello. Hi.");
  });

  it("keeps the badge index in step", async () => {
    const { threads, index, vault } = setup(async () => result("ok"));
    await threads.askParagraph(section(NOTE, 4, 5), { taskId: "paragraph.grammar" });
    const now = vault.files.get(PATH) ?? "";
    expect(index.count(PATH, sectionText(now, 4, 5))).toBe(1);
    await threads.askParagraph(section(now, 4, 5), { taskId: "paragraph.vocab" });
    expect(index.count(PATH, sectionText(now, 4, 5))).toBe(2);
    expect(index.count(PATH, sectionText(now, 2, 2))).toBe(0);
  });

  it("a double click doesn't anchor the same paragraph twice", async () => {
    let release: (r: AiRunResult) => void = () => {};
    const { threads, ai, vault } = setup(() => new Promise((r) => (release = r)));
    const first = threads.askParagraph(section(NOTE, 4, 5), { taskId: "paragraph.grammar" });
    const second = await threads.askParagraph(section(NOTE, 4, 5), { taskId: "paragraph.grammar" });
    expect(second).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    // While streaming, another question on the same thread is ignored too.
    const id = threads.paragraphThreads(PATH)[0].id;
    expect(await threads.askParagraph({ threadId: id }, { taskId: "paragraph.vocab" })).toBeNull();
    release(result("done"));
    await first;
    expect(ai.requests).toHaveLength(1);
    expect(vault.files.get(PATH)?.match(/\^vt-/g)).toHaveLength(1);
  });

  it("retry tombstones the failed round and asks again", async () => {
    let fail = true;
    const { threads } = setup(async () => {
      if (fail) throw new AiError("overloaded");
      return result("ok");
    });
    const id = (await threads.askParagraph(section(NOTE, 2, 2), {
      taskId: "paragraph.custom",
      question: "why?",
      selection: "Hello",
    })) as string;
    fail = false;
    await threads.retryParagraph(id, threads.get(id)?.turns[1].id as string);
    const live = threads.get(id)?.turns.filter((t) => !t.deletedAt) ?? [];
    expect(live.map((t) => t.content)).toEqual(["why?", "ok"]);
    expect(live[0].selection).toBe("Hello");
  });

  it("throws without an anchor service", async () => {
    const t = new ThreadService({
      storage: new MemoryStorage(),
      store: new VocabStore({ entries: [] }, async () => {}),
      ai: new FakeAi(async () => result("")),
      notes: { read: async () => null },
    });
    await expect(t.askParagraph(section(NOTE, 2, 2), { taskId: "paragraph.grammar" })).rejects.toThrow(/anchors/);
  });
});

describe("paragraph thread housekeeping (規劃書 06 §4.6)", () => {
  it("renaming a note (or its folder) moves the anchors and the badges", async () => {
    const { threads, index } = setup(async () => result("ok"), "hash");
    const id = (await threads.askParagraph(section(NOTE, 2, 2), { taskId: "paragraph.grammar" })) as string;

    expect(await threads.renameParagraphPath(PATH, "eng/Speech.md")).toBe(1);
    expect((threads.get(id)?.anchor as ParagraphAnchor).path).toBe("eng/Speech.md");
    expect(await threads.renameParagraphPath("eng", "english")).toBe(1);
    expect(threads.paragraphThreads("english/Speech.md")).toHaveLength(1);
    expect(index.count("english/Speech.md", "Hi. Hello. Hi.")).toBe(1);
    expect(index.count(PATH, "Hi. Hello. Hi.")).toBe(0);
    expect(await threads.renameParagraphPath("other.md", "x.md")).toBe(0);
  });

  it("rebinding points an orphaned thread at another paragraph", async () => {
    const { threads, vault } = setup(async () => result("ok"));
    const id = (await threads.askParagraph(section(NOTE, 2, 2), { taskId: "paragraph.grammar" })) as string;
    vault.files.set(PATH, NOTE.replace("Hi. Hello. Hi.\n\n", ""));
    expect(await threads.paragraphStatus(id)).toMatchObject({ status: "orphan" });

    const now = vault.files.get(PATH) ?? "";
    expect(await threads.rebindParagraph(id, section(now, 5, 5))).toBe(true);
    expect(await threads.paragraphStatus(id)).toMatchObject({ status: "found", via: "blockId" });
    expect(threads.get(id)?.turns).toHaveLength(2);
  });

  it("deleting tombstones the thread and clears its badge", async () => {
    const { threads, index, storage } = setup(async () => result("ok"), "hash");
    const id = (await threads.askParagraph(section(NOTE, 2, 2), { taskId: "paragraph.grammar" })) as string;
    await threads.deleteThread(id);
    expect(threads.get(id)).toBeUndefined();
    expect(threads.paragraphThreads()).toEqual([]);
    expect(index.count(PATH, "Hi. Hello. Hi.")).toBe(0);
    await threads.flush();
    const saved = (storage.shards.get(THREADS_SHARD) as { threads: Thread[] }).threads;
    expect(saved[0].deletedAt).toBeTruthy();
  });

  it("paragraph threads don't show up as word threads and vice versa", async () => {
    const { threads } = setup(async () => result("ok"), "hash");
    await threads.askParagraph(section(NOTE, 2, 2), { taskId: "paragraph.grammar" });
    expect(threads.wordThread("e1")).toBeUndefined();
    expect(threads.paragraphThread("other.md", "Hi. Hello. Hi.")).toBeUndefined();
  });
});
