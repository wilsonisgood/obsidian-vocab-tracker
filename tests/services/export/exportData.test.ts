import { describe, expect, it, vi } from "vitest";
import type { Family } from "../../../src/core/model/family";
import type { WordBreakdown } from "../../../src/core/model/morpheme";
import type { Thread } from "../../../src/core/model/thread";
import type { TriviaItem } from "../../../src/core/model/trivia";
import type { WordMeta } from "../../../src/core/model/wordMeta";
import { paragraphHash } from "../../../src/core/text/hash";
import { noteSections } from "../../../src/services/anchors/sections";
import { createExportData, paragraphIndexOf, type ExportDataSources } from "../../../src/services/export/exportData";
import { paragraphNumber } from "../../../src/services/files/paragraphNumber";
import { ARTICLE, entry, GLITTERY_THREAD, turn } from "./fixtures";

const NOTE = [
  "---",
  "title: x",
  "---",
  "# Speech", // 3
  "",
  "First paragraph.", // 5 → ¶1
  "",
  "```js",
  "code();",
  "```",
  "",
  "- a list", // 11 → ¶2
  "- second item",
  "",
  "> a quote", // 14 → ¶3
  "",
  "Last one,", // 16 → ¶4
  "two lines. ^vt-abc123",
].join("\n");

const sectionText = (line: number) => noteSections(NOTE).find((s) => s.lineStart === line)!.text;

function paragraphThread(id: string, anchor: Partial<Extract<Thread["anchor"], { kind: "paragraph" }>>, extra: Partial<Thread> = {}): Thread {
  return {
    id,
    anchor: { kind: "paragraph", path: ARTICLE, hash: "none", snapshot: "", ...anchor },
    turns: [turn("user", "?"), turn("assistant", "!")],
    createdAt: "2026-10-02T03:00:00.000Z",
    ...extra,
  };
}

const BLOCK = paragraphThread("p1", { blockId: "vt-abc123", hash: "stale" });
const QUOTE = paragraphThread("p2", { hash: paragraphHash(sectionText(14)) });
const GONE = paragraphThread("p3", { hash: paragraphHash("a paragraph that was deleted") });
const DELETED = paragraphThread("p4", { hash: paragraphHash(sectionText(5)) }, { deletedAt: "2026-10-03T00:00:00.000Z" });
const ELSEWHERE = paragraphThread("p5", { path: "eng/Other.md", hash: paragraphHash(sectionText(5)) });

function setup(notes: Record<string, string> = { [ARTICLE]: NOTE }) {
  const live = entry("1", "glittery", { source: { path: ARTICLE, line: 17 }, usage: { patterns: [], related: [], generatedAt: "x", model: "m" } });
  const gone = entry("2", "sequin", { deletedAt: "2026-10-01T00:00:00.000Z" });
  const threads = [GLITTERY_THREAD, BLOCK, QUOTE, GONE, DELETED, ELSEWHERE];
  const families = [
    { id: "f1", topic: "shine", label: "發光", source: "ai", groups: [] },
    { id: "f2", topic: "old", label: "舊", source: "ai", groups: [], deletedAt: "2026-10-01T00:00:00.000Z" },
  ] as Family[];
  const trivia = [
    { id: "t1", entryId: "1", mentions: [], title: "a", body: "b" },
    { id: "t2", entryId: "1", mentions: [], title: "c", body: "d", deletedAt: "2026-10-01T00:00:00.000Z" },
  ] as TriviaItem[];
  const breakdown: WordBreakdown = {
    status: "ok",
    word: "glittery",
    gloss: "閃亮的",
    generatedAt: "2026-10-05T00:00:00.000Z",
    model: "test",
    parts: [{ text: "glitter", type: "root", meaningZh: "閃光" }],
  };
  const wordMetas: WordMeta[] = [{ id: "1", breakdown }];
  const src: ExportDataSources = {
    entries: () => [live, gone],
    threads: {
      ensureLoaded: vi.fn(async () => undefined),
      wordThread: (id) => threads.find((th) => th.id === `word:${id}`),
      paragraphThreads: (path) =>
        threads.filter((th) => th.anchor.kind === "paragraph" && (path === undefined || th.anchor.path === path)),
    },
    learn: {
      ensureLoaded: vi.fn(async () => undefined),
      families: () => families,
      trivia: () => trivia,
      wordMeta: (id) => wordMetas.find((m) => m.id === id),
    },
    notes: { read: vi.fn(async (p: string) => notes[p] ?? null) },
  };
  return { src, data: createExportData(src), live };
}

describe("createExportData", () => {
  it("waits for threads.json and learn.json", async () => {
    const { src, data } = setup();
    await data.ready?.();
    expect(src.threads.ensureLoaded).toHaveBeenCalled();
    expect(src.learn.ensureLoaded).toHaveBeenCalled();
  });

  it("serves live records only", () => {
    const { data, live } = setup();
    expect(data.entries()).toEqual([live]);
    expect(data.entry("1")).toBe(live);
    expect(data.entry("2")).toBeUndefined();
    expect(data.usages("1")).toEqual({ v: live.usage });
    expect(data.usages("2")).toEqual({});
    expect(data.families().map((f) => f.id)).toEqual(["f1"]);
    expect(data.trivia().map((t) => t.id)).toEqual(["t1"]);
    expect(data.wordThread(GLITTERY_THREAD.anchor.kind === "word" ? GLITTERY_THREAD.anchor.entryId : "")).toBe(GLITTERY_THREAD);
  });

  it("reads a word's DNA breakdown from wordMeta (09 §7.1, 決定 1)", () => {
    const { data } = setup();
    expect(data.wordBreakdown?.("1")?.status).toBe("ok");
    expect(data.wordBreakdown?.("2")).toBeUndefined();
  });

  it("stays undefined when the wiring has no wordMeta (older callers still type-check)", () => {
    const { src } = setup();
    const noWordMeta = { ...src, learn: { ensureLoaded: src.learn.ensureLoaded, families: src.learn.families, trivia: src.learn.trivia } };
    expect(createExportData(noWordMeta).wordBreakdown?.("1")).toBeUndefined();
  });

  it("numbers a note's paragraph threads the way the word page header does", async () => {
    const { data, live } = setup();
    const out = await data.paragraphThreads(ARTICLE);
    expect(out.map(({ thread, index }) => [thread.id, index])).toEqual([
      ["p1", 3],
      ["p2", 2],
      ["p3", null],
    ]);
    // The .ai.md shows ¶(index + 1): same ¶ as 「出自 … ¶4」 on the word page.
    expect(out[0].index! + 1).toBe(paragraphNumber(NOTE, live.source!.line));
  });

  it("reads the note once, and marks every paragraph orphaned when it's gone", async () => {
    const { src, data } = setup({});
    const out = await data.paragraphThreads(ARTICLE);
    expect(out.map((p) => p.index)).toEqual([null, null, null]);
    expect(src.notes.read).toHaveBeenCalledTimes(1);
    expect(await data.paragraphThreads("eng/None.md")).toEqual([]);
    expect(src.notes.read).toHaveBeenCalledTimes(1);
  });
});

describe("paragraphIndexOf", () => {
  it("is 0-based among paragraphs, lists and quotes", () => {
    expect(paragraphIndexOf(NOTE, { kind: "paragraph", path: ARTICLE, hash: paragraphHash(sectionText(5)), snapshot: "" })).toBe(0);
    expect(paragraphIndexOf(NOTE, { kind: "paragraph", path: ARTICLE, hash: paragraphHash(sectionText(11)), snapshot: "" })).toBe(1);
    expect(paragraphIndexOf(null, { kind: "paragraph", path: ARTICLE, hash: "x", snapshot: "" })).toBeNull();
  });
});
