import { describe, expect, it } from "vitest";
import { dueLabel } from "../../../src/core/text/dueLabel";

const NOW = new Date(2026, 9, 4, 12, 0, 0);

describe("dueLabel", () => {
  it("labels overdue and later-today cards as today", () => {
    expect(dueLabel(new Date(2026, 8, 1), NOW)).toEqual({ kind: "today" });
    expect(dueLabel(new Date(2026, 9, 4, 23, 59), NOW)).toEqual({ kind: "today" });
  });

  it("shows MM/DD from tomorrow on, with the year only when it differs", () => {
    expect(dueLabel(new Date(2026, 9, 5, 0, 0), NOW)).toEqual({ kind: "date", text: "10/05" });
    expect(dueLabel(new Date(2027, 0, 9), NOW)).toEqual({ kind: "date", text: "2027/01/09" });
  });
});
