import { describe, expect, it } from "vitest";
import { isoWeekKey, previousWeek, shiftRange, weekRange } from "../../../src/core/learner/period";

describe("isoWeekKey", () => {
  it("handles ordinary days", () => {
    expect(isoWeekKey("2026-10-26")).toBe("2026-W44");
    expect(isoWeekKey("2026-10-25")).toBe("2026-W43");
  });
  it("crosses the year boundary", () => {
    expect(isoWeekKey("2026-12-31")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-04")).toBe("2027-W01");
    expect(isoWeekKey("2024-12-30")).toBe("2025-W01");
  });
});

describe("weekRange", () => {
  it("is Monday to Sunday", () => {
    expect(weekRange("2026-W43")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });
  it("covers 2020-W53 and 2026-W53", () => {
    expect(weekRange("2020-W53")).toEqual({ from: "2020-12-28", to: "2021-01-03" });
    expect(weekRange("2026-W53")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(weekRange("2027-W01")).toEqual({ from: "2027-01-04", to: "2027-01-10" });
  });
  it("round-trips with isoWeekKey", () => {
    for (const k of ["2020-W53", "2021-W01", "2026-W01", "2026-W43"]) {
      expect(isoWeekKey(weekRange(k).from)).toBe(k);
      expect(isoWeekKey(weekRange(k).to)).toBe(k);
    }
  });
});

describe("previousWeek", () => {
  it("returns the week before", () => {
    expect(previousWeek("2026-10-26")).toEqual({ key: "2026-W43", from: "2026-10-19", to: "2026-10-25" });
  });
  it("crosses years", () => {
    expect(previousWeek("2027-01-04")).toEqual({ key: "2026-W53", from: "2026-12-28", to: "2027-01-03" });
    expect(previousWeek("2021-01-05").key).toBe("2020-W53");
  });
});

describe("shiftRange", () => {
  it("shifts by its own length", () => {
    expect(shiftRange({ from: "2026-10-19", to: "2026-10-25" })).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });
  it("shifts by explicit days across a year", () => {
    expect(shiftRange({ from: "2027-01-01", to: "2027-01-03" }, 7)).toEqual({ from: "2026-12-25", to: "2026-12-27" });
  });
});
