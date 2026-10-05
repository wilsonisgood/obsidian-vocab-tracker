import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../perf/support/obsidian"));

import type { VocabData, VocabEntry } from "../../src/core/model/entry";
import type { Thread } from "../../src/core/model/thread";
import { wordThreadId } from "../../src/core/model/thread";
import { merge } from "../../src/core/store/merge";
import { mergeThreads } from "../../src/core/store/threads";
import { buildStressFixture } from "../fixtures/stress";
import { pluginFile } from "../perf/support/app";
import { setNetworkHandler } from "../perf/support/dom";
import { bootPlugin, settle, type Booted } from "../perf/support/harness";

// 規劃書 06 §1.3「Mac 與 iPhone 同時各加 1 個字、各問 1 題，同步後兩邊都
// 在（不再是「最後寫入者贏」）」, end to end with two real plugin instances
// (main.ts onload each), the 1,000-word / 200-thread library on both, and
// a real AI round trip (AiService → fetch → recorded Anthropic SSE).
//
// Sync is modelled the way iCloud / Obsidian Sync / Git behave for the
// plugin folder: whole files, and when both devices changed a file before
// syncing, one device's copy simply overwrites the other's. The plugin
// must merge on the event Obsidian fires for that (onExternalSettingsChange)
// and its own read-merge-write saves.

const fx = buildStressFixture();
const SSE = readFileSync(new URL("../fixtures/sse/anthropic-basic.txt", import.meta.url), "utf8");
const SHARDS = ["data.json", "store/threads.json"];

let silence: { mockRestore(): void };
beforeAll(() => {
  // New words try the dictionary (offline here) and log the failure.
  silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
  setNetworkHandler(() => new Response(SSE, { status: 200, headers: { "content-type": "text/event-stream" } }));
});
afterAll(() => {
  setNetworkHandler(null);
  silence.mockRestore();
});

const booted: Booted[] = [];
afterEach(async () => {
  for (const b of booted.splice(0)) await b.unload();
});

function withKey(): VocabData {
  const data = fx.data();
  data.settings!.ai!.providers.anthropic.apiKey = "sk-ant-test";
  return data;
}

async function device(): Promise<Booted> {
  const b = await bootPlugin(fx, { data: withKey() });
  booted.push(b);
  return b;
}

async function save(b: Booted): Promise<void> {
  await b.plugin.store.flush();
  await b.plugin.threads.flush();
}

function disk<T>(b: Booted, name: string): T {
  return JSON.parse(b.app.vault.adapter.files.get(pluginFile(name))!) as T;
}

// The sync service delivers `from`'s copy of every shard to `to`,
// overwriting whatever `to` had, and Obsidian tells `to`'s plugin.
async function deliver(from: Booted, to: Booted): Promise<void> {
  for (const name of SHARDS) to.app.vault.adapter.files.set(pluginFile(name), from.app.vault.adapter.files.get(pluginFile(name))!);
  await to.plugin.onExternalSettingsChange();
  await settle();
  await save(to);
}

// Both changed their files before either synced; the iPhone's copy reached
// the cloud last, so it overwrites the Mac's — then the Mac's merged
// result syncs back to the iPhone.
async function syncConflict(mac: Booted, iphone: Booted): Promise<void> {
  await save(mac);
  await save(iphone);
  await deliver(iphone, mac);
  await deliver(mac, iphone);
}

function liveWord(b: Booted, word: string): VocabEntry | undefined {
  return b.plugin.store.entries.find((e) => e.word === word);
}

function questions(threads: readonly Thread[], threadId: string): string[] {
  const th = threads.find((t) => t.id === threadId);
  return (th?.turns ?? []).filter((t) => t.role === "user" && !t.deletedAt).map((t) => t.id);
}

// The two shards on their own: each device's data.json / threads.json
// merged with the other's, in both orders (each device merges "mine +
// theirs"), must end up with the same records.
describe("the merges themselves: two devices' shards → one", () => {
  it("data.json and threads.json converge to the same union in either order", () => {
    const stamp = new Date(fx.now.getTime() + 60_000).toISOString();
    const word = (id: string, w: string): VocabEntry => ({ ...structuredClone(fx.liveEntries[0]), id, word: w, createdAt: stamp, updatedAt: stamp, rev: 0 });
    const mac = fx.data();
    const phone = fx.data();
    mac.entries.push(word("mac-1", "glimmerous"));
    phone.entries.push(word("phone-1", "shimmerette"));

    const shared = fx.threads.find((t) => t.anchor.kind === "word")!;
    const ask = (threads: Thread[], id: string, at: string) => {
      const th = threads.find((t) => t.id === shared.id)!;
      th.turns.push({ id, role: "user", content: "?", at, status: "done" }, { id: `${id}-a`, role: "assistant", content: "!", at, status: "done" });
      th.updatedAt = at;
      th.rev = (th.rev ?? 0) + 1;
      return threads;
    };
    const macThreads = ask(fx.threadsShard().threads, "mac-q", stamp);
    const phoneThreads = ask(fx.threadsShard().threads, "phone-q", stamp);

    const wordsOf = (d: VocabData) => d.entries.map((e) => e.id).sort();
    expect(wordsOf(merge(mac, phone))).toEqual(wordsOf(merge(phone, mac)));
    expect(wordsOf(merge(mac, phone))).toEqual(expect.arrayContaining(["mac-1", "phone-1"]));

    const qs = (ts: Thread[]) => questions(ts, shared.id).sort();
    expect(qs(mergeThreads(macThreads, phoneThreads))).toEqual(qs(mergeThreads(phoneThreads, macThreads)));
    expect(qs(mergeThreads(macThreads, phoneThreads))).toEqual(expect.arrayContaining(["mac-q", "phone-q"]));
  });
});

describe("Mac and iPhone each add a word and ask a question at the same time", () => {
  // Mac: adds 「glimmerous」 and asks about it. iPhone: adds 「shimmerette」
  // and asks about it. Then the conflicting sync.
  async function ownWords() {
    const mac = await device();
    const iphone = await device();
    expect(await mac.plugin.addWordToVocab("glimmerous")).toBe(true);
    expect(await iphone.plugin.addWordToVocab("shimmerette")).toBe(true);
    const macWord = liveWord(mac, "glimmerous")!;
    const phoneWord = liveWord(iphone, "shimmerette")!;
    await mac.plugin.threads.askWord(macWord, { taskId: "word.usage" });
    await iphone.plugin.threads.askWord(phoneWord, { taskId: "word.usage" });
    // A real answer came back (AiService → fetch → SSE).
    expect(mac.plugin.threads.wordThread(macWord.id)?.turns[1]).toMatchObject({ status: "done", provider: "anthropic" });
    await syncConflict(mac, iphone);
    return { mac, iphone, macWord, phoneWord };
  }

  // Both ask in the same existing word thread instead (turn-level union).
  async function sharedThread() {
    const mac = await device();
    const iphone = await device();
    const shared = fx.threads.find((t) => t.anchor.kind === "word")!;
    const entryId = (shared.anchor as { entryId: string }).entryId;
    const before = questions(fx.threads, shared.id).length;
    await mac.plugin.addWordToVocab("glimmerous");
    await iphone.plugin.addWordToVocab("shimmerette");
    await mac.plugin.threads.askWord(mac.plugin.store.entries.find((e) => e.id === entryId)!, { taskId: "word.compare" });
    await iphone.plugin.threads.askWord(iphone.plugin.store.entries.find((e) => e.id === entryId)!, { taskId: "word.sentence" });
    await syncConflict(mac, iphone);
    return { mac, iphone, entryId, before };
  }

  it("both words are on both devices, in memory and in data.json", async () => {
    const { mac, iphone } = await ownWords();
    for (const b of [mac, iphone]) {
      expect(liveWord(b, "glimmerous")).toBeDefined();
      expect(liveWord(b, "shimmerette")).toBeDefined();
      expect(b.plugin.store.entries).toHaveLength(1002);
      const words = disk<VocabData>(b, "data.json").entries.map((e) => e.word);
      expect(words).toContain("glimmerous");
      expect(words).toContain("shimmerette");
    }
  });

  it("the device whose file was overwritten merges both questions back in", async () => {
    const { mac, macWord, phoneWord } = await ownWords();
    expect(mac.plugin.threads.wordQuestionCount(macWord.id)).toBe(1);
    expect(mac.plugin.threads.wordQuestionCount(phoneWord.id)).toBe(1);
  });

  it("…also within one shared thread (turn union)", async () => {
    const { mac, entryId, before } = await sharedThread();
    expect(mac.plugin.threads.wordQuestionCount(entryId)).toBe(before + 2);
  });
});

// The other direction. After the conflict the Mac's question was only in
// the Mac's memory; ThreadService.reload() now writes the union back when
// it differs from the synced copy (K-1, the way main.ts
// onExternalSettingsChange already did for data.json), so the iPhone gets
// it and the Mac keeps it across a restart.
describe("…and the question reaches the other device too (threads.json)", () => {
  it("each asks about their new word: the iPhone gets the Mac's question", async () => {
    const mac = await device();
    const iphone = await device();
    await mac.plugin.addWordToVocab("glimmerous");
    await iphone.plugin.addWordToVocab("shimmerette");
    const macWord = liveWord(mac, "glimmerous")!;
    await mac.plugin.threads.askWord(macWord, { taskId: "word.usage" });
    await iphone.plugin.threads.askWord(liveWord(iphone, "shimmerette")!, { taskId: "word.usage" });
    await syncConflict(mac, iphone);
    expect(iphone.plugin.threads.wordQuestionCount(macWord.id)).toBe(1);
    expect(questions(disk<{ threads: Thread[] }>(iphone, "store/threads.json").threads, wordThreadId(macWord.id))).toHaveLength(1);
  });

  it("same thread: the iPhone ends up with both questions", async () => {
    const mac = await device();
    const iphone = await device();
    const shared = fx.threads.find((t) => t.anchor.kind === "word")!;
    const entryId = (shared.anchor as { entryId: string }).entryId;
    const before = questions(fx.threads, shared.id).length;
    await mac.plugin.threads.askWord(mac.plugin.store.entries.find((e) => e.id === entryId)!, { taskId: "word.compare" });
    await iphone.plugin.threads.askWord(iphone.plugin.store.entries.find((e) => e.id === entryId)!, { taskId: "word.sentence" });
    await syncConflict(mac, iphone);
    expect(iphone.plugin.threads.wordQuestionCount(entryId)).toBe(before + 2);
  });

  it("the Mac keeps its own question across a restart", async () => {
    const mac = await device();
    const iphone = await device();
    const word = fx.liveEntries.find((e) => !mac.plugin.threads.wordThread(e.id))!;
    await mac.plugin.threads.askWord(word, { taskId: "word.usage" });
    await iphone.plugin.threads.askWord(iphone.plugin.store.entries.find((e) => e.id === word.id)!, { taskId: "word.mnemonic" });
    await save(mac);
    await save(iphone);
    await deliver(iphone, mac);
    // Restart: the Mac reads what's on its disk.
    await mac.unload();
    booted.splice(booted.indexOf(mac), 1);
    const restarted = await bootPlugin(fx, {}, mac.app);
    booted.push(restarted);
    await restarted.plugin.threads.ensureLoaded();
    expect(restarted.plugin.threads.wordQuestionCount(word.id)).toBe(2);
  });
});
