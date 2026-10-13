import { describe, expect, it } from "vitest";
import { Rating } from "../../../src/core/model/srs";
import { createEmptyCard, fromFsrsCard, GRADE, makeFsrs, toFsrsCard } from "../../../src/core/srs/fsrsCard";

describe("fsrsCard", () => {
  it("round-trips a scheduled card through the persisted shape", () => {
    const now = new Date("2026-10-13T08:00:00Z");
    const card = makeFsrs(0.9).next(createEmptyCard(now), now, GRADE[Rating.Good]).card;
    const saved = fromFsrsCard(card);
    expect(fromFsrsCard(toFsrsCard(saved))).toEqual(saved);
    expect(saved.due).toBe(card.due.toISOString());
  });

  it("short-term steps are optional", () => {
    const now = new Date("2026-10-13T08:00:00Z");
    const step = (shortTerm: boolean) =>
      makeFsrs(0.9, { shortTerm }).next(createEmptyCard(now), now, GRADE[Rating.Good]).card.due.getTime() - now.getTime();
    expect(step(true)).toBeLessThan(86_400_000);
    expect(step(false)).toBeGreaterThanOrEqual(86_400_000);
  });
});
