import { describe, expect, it } from "vitest";
import { grammarSightings, sightingsByTopic, sightingsOfPath } from "../../../src/core/grammar/sightings";
import type { Anchor, Thread, Turn } from "../../../src/core/model/thread";

function user(id: string, at: string, selection?: string): Turn {
  return { id, role: "user", content: "q", at, status: "done", ...(selection ? { selection } : {}) };
}
function ai(id: string, at: string, content: string, extra: Partial<Turn> = {}): Turn {
  return { id, role: "assistant", content, at, status: "done", taskId: "paragraph.grammar", ...extra };
}
function thread(id: string, turns: Turn[], path = "a.md", anchor?: Anchor): Thread {
  return { id, anchor: anchor ?? { kind: "paragraph", path, hash: "h", snapshot: `snap-${id}` }, turns };
}
const trailer = (...ids: string[]) => `說明\n<!-- vt-grammar: ${ids.join(", ")} -->`;

describe("grammarSightings", () => {
  it("collects topics from done grammar answers on paragraphs", () => {
    const t = thread("t1", [user("u1", "2026-10-01T00:00:00Z", "He has gone."), ai("a1", "2026-10-01T00:00:05Z", trailer("past-simple", "passive-basic"))]);
    const s = grammarSightings([t]);
    expect(s.map((x) => x.topicId).sort()).toEqual(["passive-basic", "past-simple"]);
    expect(s[0]).toMatchObject({ threadId: "t1", turnId: "a1", path: "a.md", snapshot: "snap-t1", selection: "He has gone.", at: "2026-10-01T00:00:05Z" });
  });

  it("ignores other tasks, unfinished/deleted turns, other anchors and unknown ids", () => {
    const threads = [
      thread("t1", [ai("a1", "2026-10-01T00:00:00Z", trailer("past-simple"), { taskId: "paragraph.translate" })]),
      thread("t2", [ai("a2", "2026-10-01T00:00:00Z", trailer("past-simple"), { status: "streaming" })]),
      thread("t3", [ai("a3", "2026-10-01T00:00:00Z", trailer("past-simple"), { deletedAt: "2026-10-02T00:00:00Z" })]),
      thread("t4", [ai("a4", "2026-10-01T00:00:00Z", trailer("past-simple"))], "", { kind: "word", entryId: "e" }),
      thread("t5", [ai("a5", "2026-10-01T00:00:00Z", trailer("not-a-topic"))]),
      thread("t6", [ai("a6", "2026-10-01T00:00:00Z", "no trailer")]),
    ];
    expect(grammarSightings(threads)).toEqual([]);
  });

  it("keeps the newest sighting per thread and topic, newest first overall", () => {
    const t = thread("t1", [
      ai("a1", "2026-10-01T00:00:00Z", trailer("past-simple")),
      ai("a2", "2026-10-03T00:00:00Z", trailer("past-simple", "passive-basic")),
    ]);
    const other = thread("t2", [ai("a3", "2026-10-02T00:00:00Z", trailer("past-simple"))], "b.md");
    const s = grammarSightings([t, other]);
    expect(s.map((x) => `${x.threadId}:${x.topicId}:${x.turnId}`)).toEqual(["t1:past-simple:a2", "t1:passive-basic:a2", "t2:past-simple:a3"]);
  });

  it("groups by topic and filters by path", () => {
    const s = grammarSightings([
      thread("t1", [ai("a1", "2026-10-01T00:00:00Z", trailer("past-simple"))], "a.md"),
      thread("t2", [ai("a2", "2026-10-02T00:00:00Z", trailer("past-simple", "passive-basic"))], "b.md"),
    ]);
    expect(sightingsByTopic(s).get("past-simple")?.map((x) => x.path)).toEqual(["b.md", "a.md"]);
    expect(sightingsOfPath(s, "b.md").map((x) => x.topicId).sort()).toEqual(["passive-basic", "past-simple"]);
    expect(sightingsOfPath(s, "zzz.md")).toEqual([]);
  });
});
