import { describe, expect, it } from "vitest";
import { scheduleTopic, sessionRating } from "../../../src/core/grammar/schedule";
import { Rating } from "../../../src/core/model/srs";

const run = (correct: number, total: number) =>
  Array.from({ length: total }, (_, i) => ({ correct: i < correct }));

describe("sessionRating", () => {
  it("maps accuracy onto the four ratings", () => {
    expect(sessionRating(run(8, 8))).toBe(Rating.Easy);
    expect(sessionRating(run(6, 8))).toBe(Rating.Good); // .75
    expect(sessionRating(run(4, 8))).toBe(Rating.Hard); // .5
    expect(sessionRating(run(3, 8))).toBe(Rating.Again);
    expect(sessionRating(run(0, 3))).toBe(Rating.Again);
  });

  it("gives Easy only to rounds of 6 or more answers", () => {
    expect(sessionRating(run(5, 5))).toBe(Rating.Good);
    expect(sessionRating(run(6, 6))).toBe(Rating.Easy);
    expect(sessionRating(run(9, 10))).toBe(Rating.Easy); // .9 exactly
    expect(sessionRating(run(8, 10))).toBe(Rating.Good);
  });

  it("is undefined for an empty round", () => {
    expect(sessionRating([])).toBeUndefined();
  });
});

describe("scheduleTopic", () => {
  const now = new Date("2026-10-13T08:00:00Z");
  const days = (c: { due: string }) => (new Date(c.due).getTime() - now.getTime()) / 86_400_000;

  it("starts a card for a topic without progress, with day-sized intervals", () => {
    const again = scheduleTopic(undefined, Rating.Again, now, 0.9);
    const good = scheduleTopic(undefined, Rating.Good, now, 0.9);
    const easy = scheduleTopic(undefined, Rating.Easy, now, 0.9);
    expect(days(again)).toBeGreaterThanOrEqual(1);
    expect(days(good)).toBeGreaterThan(days(again));
    expect(days(easy)).toBeGreaterThan(days(good));
    expect(good.reps).toBe(1);
    expect(good.lastReview).toBe(now.toISOString());
  });

  it("grows the interval on a second good round and counts a lapse on Again", () => {
    const first = scheduleTopic(undefined, Rating.Good, now, 0.9);
    const later = new Date(first.due);
    const second = scheduleTopic({ srs: first }, Rating.Good, later, 0.9);
    expect(new Date(second.due).getTime() - later.getTime()).toBeGreaterThan(new Date(first.due).getTime() - now.getTime());
    expect(second.reps).toBe(2);
    const failed = scheduleTopic({ srs: second }, Rating.Again, new Date(second.due), 0.9);
    expect(failed.lapses).toBe(1);
  });

  it("a higher retention schedules sooner", () => {
    const base = scheduleTopic({ srs: scheduleTopic(undefined, Rating.Good, now, 0.9) }, Rating.Good, new Date("2026-10-20T08:00:00Z"), 0.9);
    const strict = scheduleTopic({ srs: scheduleTopic(undefined, Rating.Good, now, 0.9) }, Rating.Good, new Date("2026-10-20T08:00:00Z"), 0.97);
    expect(new Date(strict.due).getTime()).toBeLessThan(new Date(base.due).getTime());
  });
});
