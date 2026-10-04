import { describe, expect, it } from "vitest";
import {
  buildQueue,
  countDueBetween,
  newIntroducedToday,
} from "../../../src/services/srs/queue";
import type { ReviewLog } from "../../../src/core/model/srs";
import { makeEntry, reviewCard } from "./fixtures";

// Local-time dates throughout: "today" is the local calendar day.
const NOW = new Date(2026, 9, 4, 12, 0, 0);
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

function newLog(entryId: string, at: Date, prevState: 0 | 1 | 2 | 3 = 0): ReviewLog {
  return { id: `${entryId}-${at.getTime()}`, entryId, at: at.toISOString(), rating: 3, mode: "en-zh", elapsedMs: 0, prevState };
}

describe("buildQueue", () => {
  it("puts due reviews first, sorted by due date, then new cards oldest-first", () => {
    const entries = [
      makeEntry({ id: "new-late", createdAt: "2026-09-02T00:00:00.000Z" }),
      makeEntry({ id: "due-2h-ago", srs: reviewCard(hoursFromNow(-2)) }),
      makeEntry({ id: "future", srs: reviewCard(hoursFromNow(5)) }),
      makeEntry({ id: "new-early", createdAt: "2026-09-01T00:00:00.000Z" }),
      makeEntry({ id: "due-1d-ago", srs: reviewCard(hoursFromNow(-24)) }),
    ];
    const q = buildQueue(entries, {}, { now: NOW, dailyNew: 20, logs: [] });
    expect(q.map((e) => e.id)).toEqual(["due-1d-ago", "due-2h-ago", "new-early", "new-late"]);
  });

  it("treats an explicit New-state card like a missing one", () => {
    const card = { ...reviewCard(hoursFromNow(10)), state: 0 as const };
    const q = buildQueue([makeEntry({ id: "a", srs: card })], {}, { now: NOW, dailyNew: 20, logs: [] });
    expect(q.map((e) => e.id)).toEqual(["a"]);
  });

  it("caps new cards by the daily limit minus cards already introduced today", () => {
    const entries = ["a", "b", "c", "d"].map((id, i) =>
      makeEntry({ id, createdAt: `2026-09-0${i + 1}T00:00:00.000Z` })
    );
    const logs = [
      newLog("x", new Date(2026, 9, 4, 8)),
      newLog("x", new Date(2026, 9, 4, 9)), // same card again: one slot only
      newLog("y", new Date(2026, 9, 3, 23)), // yesterday: doesn't count
      newLog("z", new Date(2026, 9, 4, 10), 2), // was already a review card
    ];
    expect(newIntroducedToday(logs, NOW)).toBe(1);
    const q = buildQueue(entries, {}, { now: NOW, dailyNew: 3, logs });
    expect(q.map((e) => e.id)).toEqual(["a", "b"]);
    expect(buildQueue(entries, {}, { now: NOW, dailyNew: 0, logs })).toEqual([]);
  });

  it("skips deleted entries and filters by source prefix and limit", () => {
    const entries = [
      makeEntry({ id: "a", source: { path: "eng/a.md", line: 0 } }),
      makeEntry({ id: "b", source: { path: "other/b.md", line: 0 } }),
      makeEntry({ id: "c", source: { path: "eng/c.md", line: 0 }, deletedAt: "2026-10-01T00:00:00.000Z" }),
      makeEntry({ id: "d", source: null }),
      makeEntry({ id: "e", source: { path: "eng/e.md", line: 0 } }),
    ];
    const ctx = { now: NOW, dailyNew: 20, logs: [] };
    expect(buildQueue(entries, { source: "eng/" }, ctx).map((e) => e.id)).toEqual(["a", "e"]);
    expect(buildQueue(entries, { limit: 2 }, ctx).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("skips cards without a usable example in cloze mode", () => {
    const entries = [
      makeEntry({ id: "a", word: "toil", example: "We toil all day." }),
      makeEntry({ id: "b", word: "ethos", example: "" }),
      makeEntry({ id: "c", word: "sweat", example: "No match here." }),
    ];
    const ctx = { now: NOW, dailyNew: 20, logs: [] };
    expect(buildQueue(entries, { mode: "cloze" }, ctx).map((e) => e.id)).toEqual(["a"]);
    expect(buildQueue(entries, { mode: "en-zh" }, ctx)).toHaveLength(3);
  });
});

describe("countDueBetween", () => {
  it("counts scheduled cards due in the window, ignoring new cards", () => {
    const tomorrow = new Date(2026, 9, 5);
    const dayAfter = new Date(2026, 9, 6);
    const entries = [
      makeEntry({ id: "a", srs: reviewCard(new Date(2026, 9, 5, 9)) }),
      makeEntry({ id: "b", srs: reviewCard(new Date(2026, 9, 6, 9)) }),
      makeEntry({ id: "c" }),
    ];
    expect(countDueBetween(entries, {}, tomorrow, dayAfter)).toBe(1);
  });
});
