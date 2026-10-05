import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../perf/support/obsidian"));

import type { VocabData, VocabEntry } from "../../src/core/model/entry";
import type { Thread } from "../../src/core/model/thread";
import { buildStressFixture } from "../fixtures/stress";
import { PLUGIN_DIR, pluginFile } from "../perf/support/app";
import { bootPlugin, openSidebar, settle, type Booted } from "../perf/support/harness";
import { VOCAB_VIEW_TYPE, type VocabSidebarView } from "../../src/ui/sidebar/VocabSidebarView";

// 從備份還原, end to end with two real plugin instances (main.ts onload
// each): the Mac restores a backup from settings, the files sync to the
// iPhone, each merges the other's copy (onExternalSettingsChange and the
// services' read-merge-write) — no restart anywhere. Sync is modelled as in
// twoDevices.test.ts: whole files, the latest copy overwrites the other.

// A small library dated well before the faked "now" of these tests.
const fx = buildStressFixture({
  words: 40,
  tombstones: 2,
  wordThreads: 6,
  paragraphThreads: 3,
  articleSections: 30,
  notes: 3,
  articleWords: 10,
  now: new Date("2025-06-01T00:00:00.000Z"),
});
const SHARDS = ["data.json", "store/threads.json", "store/learn.json", "store/reviews.json", "store/imports.json"];

let silence: { mockRestore(): void };
beforeAll(() => {
  // New words try the dictionary (offline here) and log the failure.
  silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterAll(() => silence.mockRestore());

const booted: Booted[] = [];
beforeEach(() => {
  // Only Date is faked: each step below happens at a known time, timers stay real.
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(async () => {
  for (const b of booted.splice(0)) await b.unload();
  vi.useRealTimers();
});

const at = (iso: string) => vi.setSystemTime(new Date(iso));

async function device(): Promise<Booted> {
  const b = await bootPlugin(fx);
  booted.push(b);
  // Both services hold their shard in memory, as after opening a discussion
  // or a learning page — the case where a plain file copy gets merged away.
  await b.plugin.threads.ensureLoaded();
  await b.plugin.learn.ensureLoaded();
  return b;
}

async function save(b: Booted): Promise<void> {
  await Promise.all([b.plugin.store.flush(), b.plugin.threads.flush(), b.plugin.learn.flush(), b.plugin.srs.flush()]);
}

async function deliver(from: Booted, to: Booted): Promise<void> {
  await save(from);
  for (const name of SHARDS) {
    const text = from.app.vault.adapter.files.get(pluginFile(name));
    if (text !== undefined) to.app.vault.adapter.files.set(pluginFile(name), text);
  }
  await to.plugin.onExternalSettingsChange();
  await settle();
  await save(to);
}

const word = (b: Booted, id: string): VocabEntry | undefined => b.plugin.store.entries.find((e) => e.id === id);
const byText = (b: Booted, w: string): VocabEntry | undefined => b.plugin.store.entries.find((e) => e.word === w);

async function edit(b: Booted, id: string, definition: string): Promise<void> {
  const e = word(b, id)!;
  e.definition = definition;
  await b.plugin.store.touch(e);
}

// The shared setup: both devices in sync, the Mac backs up, then (Jan 2)
// edits A, deletes B, adds 「glimmerous」, deletes a family and rates an
// answer 👎 — all synced to the iPhone. Then (Jan 3) the iPhone, offline,
// edits A and D and adds 「shimmerette」.
async function scenario() {
  at("2026-01-01T00:00:00.000Z");
  const mac = await device();
  const iphone = await device();
  const [A, B, , D] = mac.plugin.store.entries.map((e) => e.id);
  const original = { A: word(mac, A)!.definition, D: word(mac, D)!.definition };
  const family = mac.plugin.learn.families()[0].id;
  const th = fx.threads.find((t) => t.anchor.kind === "word" && t.turns.some((x) => x.role === "assistant"))!;
  const answer = th.turns.find((x) => x.role === "assistant")!.id;

  const backupPath = await mac.plugin.backups.create();
  const backupName = backupPath.slice(backupPath.lastIndexOf("/") + 1);

  at("2026-01-02T00:00:00.000Z");
  await edit(mac, A, "edited on the Mac");
  await mac.plugin.store.deleteEntry(B);
  expect(await mac.plugin.addWordToVocab("glimmerous")).toBe(true);
  mac.plugin.learn.deleteFamily(family);
  await mac.plugin.threads.setFeedback(th.id, answer, "down");
  await deliver(mac, iphone);
  expect(word(iphone, B)).toBeUndefined();
  expect(iphone.plugin.learn.family(family)).toBeUndefined();

  at("2026-01-03T00:00:00.000Z");
  await edit(iphone, A, "edited on the iPhone, offline");
  await edit(iphone, D, "edited on the iPhone, offline");
  expect(await iphone.plugin.addWordToVocab("shimmerette")).toBe(true);
  await save(iphone);

  at("2026-01-04T00:00:00.000Z");
  return { mac, iphone, A, B, D, original, family, threadId: th.id, answer, backupName };
}

const feedbackOf = (b: Booted, threadId: string, turnId: string) =>
  b.plugin.threads.get(threadId)!.turns.find((t) => t.id === turnId)!.feedback;

describe("restoring on the Mac, then syncing to the iPhone (keep words added after the backup)", () => {
  it("the Mac shows the restored data at once, without a restart", async () => {
    const s = await scenario();
    const { mac } = s;
    const result = await mac.plugin.backups.restore(s.backupName, { removeExtras: false });

    expect(word(mac, s.A)!.definition).toBe(s.original.A);
    expect(word(mac, s.B)).toBeDefined();
    expect(byText(mac, "glimmerous")).toBeDefined();
    expect(mac.plugin.learn.family(s.family)).toBeDefined();
    expect(feedbackOf(mac, s.threadId, s.answer)).toBeUndefined();
    // The store the UI reads and main.ts's own reference are the same data.
    expect(mac.plugin.vocabData).toBe(mac.plugin.store.vocabData);

    // The state before the restore was saved first, in full.
    expect(result.safetyPath).toBe(`${PLUGIN_DIR}/backup/full-2026-01-04T00-00-00.000Z-before-restore.json`);
    const safety = JSON.parse(mac.app.vault.adapter.files.get(result.safetyPath)!) as { shards: { data: VocabData } };
    expect(safety.shards.data.entries.find((e) => e.id === s.A)!.definition).toBe("edited on the Mac");
    expect(Object.keys(safety.shards)).toEqual(expect.arrayContaining(["data", "threads", "learn", "imports"]));

    // Survives the services' own next writes (read-merge-write) and a restart.
    await save(mac);
    const disk = JSON.parse(mac.app.vault.adapter.files.get(pluginFile("data.json"))!) as VocabData;
    expect(disk.entries.find((e) => e.id === s.A)!.definition).toBe(s.original.A);
    const threads = JSON.parse(mac.app.vault.adapter.files.get(pluginFile("store/threads.json"))!) as { threads: Thread[] };
    expect(threads.threads.find((t) => t.id === s.threadId)!.turns.find((t) => t.id === s.answer)!.feedback).toBeUndefined();
  });

  it("the iPhone follows the restore after syncing; its own unsynced edits to other words and its new word survive", async () => {
    const s = await scenario();
    const { mac, iphone } = s;
    await mac.plugin.backups.restore(s.backupName, { removeExtras: false });
    await deliver(mac, iphone);

    // Words the restore changed follow the restore, even over the iPhone's offline edit.
    expect(word(iphone, s.A)!.definition).toBe(s.original.A);
    expect(word(iphone, s.B)).toBeDefined();
    expect(iphone.plugin.learn.family(s.family)).toBeDefined();
    expect(feedbackOf(iphone, s.threadId, s.answer)).toBeUndefined();
    // Words it didn't touch keep the iPhone's version; new words stay.
    expect(word(iphone, s.D)!.definition).toBe("edited on the iPhone, offline");
    expect(byText(iphone, "shimmerette")).toBeDefined();
    expect(byText(iphone, "glimmerous")).toBeDefined();

    // …and the iPhone's merged copy syncs back: both devices agree.
    await deliver(iphone, mac);
    for (const b of [mac, iphone]) {
      expect(word(b, s.A)!.definition).toBe(s.original.A);
      expect(word(b, s.D)!.definition).toBe("edited on the iPhone, offline");
      expect(byText(b, "shimmerette")).toBeDefined();
    }
    expect(mac.plugin.store.entries.map((e) => e.id).sort()).toEqual(iphone.plugin.store.entries.map((e) => e.id).sort());
  });

  it("an edit made after the restore, on either device, is not undone by it", async () => {
    const s = await scenario();
    const { mac, iphone } = s;
    await mac.plugin.backups.restore(s.backupName, { removeExtras: false });
    await deliver(mac, iphone);
    at("2026-01-05T00:00:00.000Z");
    await edit(iphone, s.A, "edited on the iPhone after the restore");
    await deliver(iphone, mac);
    expect(word(mac, s.A)!.definition).toBe("edited on the iPhone after the restore");
  });
});

describe("restoring with 「一併刪除備份之後新增的」", () => {
  it("deletes the Mac's post-backup word on both devices, but not the iPhone's unsynced one", async () => {
    const s = await scenario();
    const { mac, iphone } = s;
    await mac.plugin.backups.restore(s.backupName, { removeExtras: true });
    expect(byText(mac, "glimmerous")).toBeUndefined();
    await deliver(mac, iphone);
    expect(byText(iphone, "glimmerous")).toBeUndefined();
    expect(byText(iphone, "shimmerette")).toBeDefined();
    await deliver(iphone, mac);
    expect(byText(mac, "glimmerous")).toBeUndefined();
    expect(byText(mac, "shimmerette")).toBeDefined();
  });

  it("restoring the automatic pre-restore backup the same way undoes it", async () => {
    const s = await scenario();
    const { mac } = s;
    const first = await mac.plugin.backups.restore(s.backupName, { removeExtras: true });
    at("2026-01-06T00:00:00.000Z");
    await mac.plugin.backups.restore(first.safetyPath.slice(first.safetyPath.lastIndexOf("/") + 1), { removeExtras: true });
    expect(word(mac, s.A)!.definition).toBe("edited on the Mac");
    expect(word(mac, s.B)).toBeUndefined();
    expect(byText(mac, "glimmerous")).toBeDefined();
    expect(mac.plugin.learn.family(s.family)).toBeUndefined();
    expect(feedbackOf(mac, s.threadId, s.answer)).toBe("down");
  });
});

describe("why a restore can't just copy the backup files back", () => {
  it("control: the Mac's own merge brings the newer copies straight back", async () => {
    const s = await scenario();
    const { mac } = s;
    const backup = JSON.parse(mac.app.vault.adapter.files.get(`${PLUGIN_DIR}/backup/${s.backupName}`)!) as {
      shards: Record<string, unknown>;
    };
    // Copy data.json and threads.json back by hand, then let the plugin read them.
    mac.app.vault.adapter.files.set(pluginFile("data.json"), JSON.stringify(backup.shards.data));
    mac.app.vault.adapter.files.set(pluginFile("store/threads.json"), JSON.stringify(backup.shards.threads));
    await mac.plugin.onExternalSettingsChange();
    await settle();
    await save(mac);
    expect(word(mac, s.A)!.definition).toBe("edited on the Mac");
    expect(word(mac, s.B)).toBeUndefined();
    expect(feedbackOf(mac, s.threadId, s.answer)).toBe("down");
  });
});

describe("after a restore, the open views redraw", () => {
  it("the sidebar re-renders and the changed words' notes are re-exported", async () => {
    const s = await scenario();
    const { mac } = s;
    // The sidebar the plugin opened at startup, or a new one.
    const open = mac.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0]?.view as VocabSidebarView | undefined;
    const view = open ?? (await openSidebar(mac, "all"));
    const render = vi.spyOn(view, "render");
    const wordChanged = vi.spyOn(mac.plugin.exporter, "wordChanged");
    const threadChanged = vi.spyOn(mac.plugin.exporter, "threadChanged");
    await mac.plugin.backups.restore(s.backupName, { removeExtras: false });
    expect(render).toHaveBeenCalled();
    expect(wordChanged).toHaveBeenCalledWith(s.A);
    expect(wordChanged).toHaveBeenCalledWith(s.B);
    expect(threadChanged.mock.calls.map(([t]) => t.id)).toContain(s.threadId);
  });

  it("the settings page lists the backups with their contents", async () => {
    const s = await scenario();
    const items = await s.mac.plugin.backups.list();
    expect(items[0]).toMatchObject({ name: s.backupName, kind: "full", reason: "manual" });
    expect(items[0].summary!.words).toBe(fx.liveEntries.length);
    expect(items[0].summary!.families).toBe(fx.learnShard().families.length);
  });
});
