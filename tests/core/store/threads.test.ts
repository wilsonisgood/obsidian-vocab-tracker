import { describe, expect, it } from "vitest";
import type { Thread, Turn } from "../../../src/core/model/thread";
import { mergeThreads, mergeTurns, settleStaleTurns } from "../../../src/core/store/threads";

const turn = (id: string, at: string, extra: Partial<Turn> = {}): Turn => ({
  id,
  role: "user",
  content: id,
  at,
  status: "done",
  ...extra,
});

const thread = (id: string, turns: Turn[], updatedAt = "2026-10-01T00:00:00Z"): Thread => ({
  id,
  anchor: { kind: "word", entryId: id },
  turns,
  updatedAt,
});

describe("mergeTurns", () => {
  it("keeps questions asked on both devices, ordered by time", () => {
    const mac = [turn("a", "2026-10-01T10:00:00Z"), turn("b", "2026-10-01T10:00:00Z", { role: "assistant" })];
    const phone = [turn("a", "2026-10-01T10:00:00Z"), turn("c", "2026-10-01T09:00:00Z")];
    expect(mergeTurns(mac, phone).map((t) => t.id)).toEqual(["c", "a", "b"]);
  });

  it("prefers a finished copy over a streaming one, then the newer edit", () => {
    const streaming = turn("x", "2026-10-01T10:00:00Z", { status: "streaming", content: "" });
    const done = turn("x", "2026-10-01T10:00:00Z", { content: "answer" });
    expect(mergeTurns([streaming], [done])[0].content).toBe("answer");
    expect(mergeTurns([done], [streaming])[0].content).toBe("answer");

    const pinned = { ...done, pinnedToGrammar: true, updatedAt: "2026-10-02T00:00:00Z" };
    expect(mergeTurns([done], [pinned])[0].pinnedToGrammar).toBe(true);
    expect(mergeTurns([pinned], [done])[0].pinnedToGrammar).toBe(true);
  });

  it("keeps a tombstone that is newer than the live copy", () => {
    const live = turn("x", "2026-10-01T10:00:00Z");
    const dead = { ...live, deletedAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
    expect(mergeTurns([live], [dead])[0].deletedAt).toBeDefined();
  });
});

describe("mergeThreads", () => {
  it("unions threads by id and merges turns of shared threads", () => {
    const local = [thread("word:1", [turn("a", "2026-10-01T10:00:00Z")]), thread("word:2", [])];
    const remote = [thread("word:1", [turn("b", "2026-10-01T11:00:00Z")]), thread("word:3", [])];
    const merged = mergeThreads(local, remote);
    expect(merged.map((t) => t.id)).toEqual(["word:1", "word:2", "word:3"]);
    expect(merged[0].turns.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("settleStaleTurns", () => {
  it("marks turns left streaming by a closed app as aborted", () => {
    const [th] = settleStaleTurns([thread("t", [turn("a", "2026-10-01T10:00:00Z", { status: "streaming" })])]);
    expect(th.turns[0].status).toBe("aborted");
  });
});
