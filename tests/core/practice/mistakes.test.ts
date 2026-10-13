import { describe, expect, it } from "vitest";
import { openMistakes, recordWrong, resolveMistake } from "../../../src/core/practice/mistakes";

const F = { kind: "grammar-objective" as const, id: "t/a" };
const d = (s: string) => new Date(s);

describe("mistakes", () => {
  it("opens, resolves and reopens the same item", () => {
    const m = recordWrong(undefined, "grammar", "q1", F, d("2026-10-01T00:00:00Z"));
    expect(m).toMatchObject({ id: "grammar:q1", addedAt: "2026-10-01T00:00:00.000Z", lastWrongAt: "2026-10-01T00:00:00.000Z" });
    const r = resolveMistake(m, d("2026-10-02T00:00:00Z"));
    expect(r.resolvedAt).toBe("2026-10-02T00:00:00.000Z");
    expect(openMistakes([r])).toEqual([]);
    const again = recordWrong(r, "grammar", "q1", F, d("2026-10-03T00:00:00Z"));
    expect(again.resolvedAt).toBeUndefined();
    expect("resolvedAt" in again).toBe(false);
    expect(again.addedAt).toBe(m.addedAt);
    expect(again.lastWrongAt).toBe("2026-10-03T00:00:00.000Z");
    expect(again.updatedAt).toBe("2026-10-03T00:00:00.000Z");
  });

  it("lists open ones newest-wrong first, optionally per track", () => {
    const a = recordWrong(undefined, "grammar", "a", F, d("2026-10-01T00:00:00Z"));
    const b = recordWrong(undefined, "poly", "b", F, d("2026-10-05T00:00:00Z"));
    const c = recordWrong(undefined, "grammar", "c", F, d("2026-10-03T00:00:00Z"));
    expect(openMistakes([a, b, c]).map((x) => x.questionId)).toEqual(["b", "c", "a"]);
    expect(openMistakes([a, b, c], "grammar").map((x) => x.questionId)).toEqual(["c", "a"]);
  });
});
