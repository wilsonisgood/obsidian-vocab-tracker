import { describe, expect, it } from "vitest";
import { mergeReviewLogs, pruneReviewLogs } from "../../../src/core/store/reviewLogs";
import type { ReviewLog } from "../../../src/core/model/srs";

function log(id: string, at: string, overrides: Partial<ReviewLog> = {}): ReviewLog {
  return { id, entryId: "e1", at, rating: 3, mode: "en-zh", elapsedMs: 0, ...overrides };
}

describe("mergeReviewLogs", () => {
  it("unions by id and keeps both devices' reviews", () => {
    const local = [log("a", "2026-10-01T10:00:00.000Z"), log("b", "2026-10-01T11:00:00.000Z")];
    const remote = [log("b", "2026-10-01T11:00:00.000Z"), log("c", "2026-10-01T09:00:00.000Z")];
    expect(mergeReviewLogs(local, remote).map((l) => l.id)).toEqual(["c", "a", "b"]);
  });

  it("is order-independent and idempotent", () => {
    const a = [log("a", "2026-10-01T10:00:00.000Z")];
    const b = [log("b", "2026-10-02T10:00:00.000Z")];
    const ab = mergeReviewLogs(a, b);
    expect(mergeReviewLogs(b, a)).toEqual(ab);
    expect(mergeReviewLogs(ab, ab)).toEqual(ab);
  });

  it("keeps the first copy when ids collide (logs are immutable)", () => {
    const merged = mergeReviewLogs([log("a", "2026-10-01T10:00:00.000Z", { rating: 1 })], [
      log("a", "2026-10-01T10:00:00.000Z", { rating: 4 }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].rating).toBe(1);
  });
});

describe("pruneReviewLogs", () => {
  it("drops logs older than the retention window", () => {
    const now = new Date("2026-10-04T00:00:00.000Z");
    const logs = [
      log("old", "2026-07-01T00:00:00.000Z"),
      log("edge", "2026-07-06T00:00:00.000Z"),
      log("new", "2026-10-03T00:00:00.000Z"),
    ];
    expect(pruneReviewLogs(logs, now).map((l) => l.id)).toEqual(["edge", "new"]);
    expect(pruneReviewLogs(logs, now, 7).map((l) => l.id)).toEqual(["new"]);
  });
});
