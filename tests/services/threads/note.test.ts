import { describe, expect, it } from "vitest";
import type { Anchor } from "../../../src/core/model/thread";
import { VocabStore } from "../../../src/core/store/VocabStore";
import { ThreadService } from "../../../src/services/threads/ThreadService";
import { MemoryStorage } from "../ai/fakes";
import { MemoryVault } from "../anchors/fakes";
import { FakeAi, result, type Script } from "./fakes";

const PATH = "eng/Batteries.md";
const NOTE = "# Batteries\n\nSodium cells trade density for ==cost==. ^vt-a1\n\nGrid operators now buy them.\n";

function setup(script: Script) {
  const ai = new FakeAi(script);
  const vault = new MemoryVault({ [PATH]: NOTE });
  const discussed: { anchor: Anchor; ok: boolean }[] = [];
  let n = 0;
  let clock = Date.parse("2026-10-30T08:00:00Z");
  const threads = new ThreadService({
    storage: new MemoryStorage(),
    store: new VocabStore({ entries: [] }, async () => {}),
    ai,
    notes: vault,
    clock: () => new Date((clock += 1000)),
    newId: () => `id${++n}`,
    onDiscussed: (anchor, ok) => discussed.push({ anchor, ok }),
  });
  return { ai, threads, discussed };
}

describe("ThreadService whole-note discussion (1030 #4)", () => {
  it("asks about the whole article, numbered like the ¶ elsewhere, in one thread per note", async () => {
    const { ai, threads, discussed } = setup(async () => result("主旨：鈉電池以能量密度換取便宜。"));
    const id = threads.noteThreadId(PATH);
    expect(await threads.askNote(PATH, { taskId: "note.mainIdea" })).toBe(id);
    const req = ai.requests[0];
    const system = req.system.map((b) => b.text).join("\n");
    expect(system).toContain("〔文章〕《Batteries》");
    expect(system).toContain("¶2 Sodium cells trade density for cost.");
    expect(system).not.toContain("^vt-a1");
    expect(req.messages.at(-1)!.content).toContain("任務：這篇的主旨");
    expect(threads.noteThread(PATH)).toMatchObject({ id, anchor: { kind: "note", path: PATH } });
    expect(discussed).toEqual([{ anchor: { kind: "note", path: PATH }, ok: true }]);

    await threads.askNote(PATH, { taskId: "note.custom", question: "作者的立場是？" });
    expect(threads.noteThread(PATH)!.turns.filter((t) => t.role === "user")).toHaveLength(2);
    expect(ai.requests[1].messages.at(-1)!.content).toContain("作者的立場是？");
  });

  it("follows the note when it's renamed, and never reuses a deleted thread's id", async () => {
    const { threads } = setup(async () => result("ok"));
    const id = (await threads.askNote(PATH, { taskId: "note.structure" }))!;
    await threads.renameParagraphPath("eng", "english");
    expect(threads.noteThread("english/Batteries.md")?.id).toBe(id);
    expect(threads.noteThreadId("english/Batteries.md")).toBe(id);
    expect(threads.noteThread(PATH)).toBeUndefined();
    threads.get(id)!.deletedAt = "2026-10-30T09:00:00.000Z";
    const fresh = threads.noteThreadId("english/Batteries.md");
    expect(fresh).not.toBe(id);
    expect(threads.noteThreadId("english/Batteries.md")).toBe(fresh);
  });

  it("a missing note sends nothing", async () => {
    const { ai, threads } = setup(async () => result("ok"));
    expect(await threads.askNote("nope.md", { taskId: "note.mainIdea" })).toBeNull();
    expect(ai.requests).toHaveLength(0);
  });
});
