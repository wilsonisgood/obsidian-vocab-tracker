import { describe, expect, it } from "vitest";
import { dockSummary } from "../../../src/ui/blocks/grammarPracticeModel";

describe("dockSummary", () => {
  it("每題只算第一次作答", () => {
    expect(dockSummary([])).toEqual({ right: 0, total: 0 });
    expect(
      dockSummary([
        { id: "a", correct: true },
        { id: "b", correct: false },
        { id: "b", correct: true },
        { id: "c", correct: true },
      ])
    ).toEqual({ right: 2, total: 3 });
  });
});
