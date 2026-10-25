import { describe, expect, it } from "vitest";
import { applyLevelOffer, reasonKey, writeButtonKey, type ReportCardLatest } from "../../../src/ui/blocks/reportCardState";

const L = (p: Partial<ReportCardLatest>): ReportCardLatest => ({ key: "2026-W43", path: "p", verdict: "up", suggestedLevel: "B2", headline: "h", ...p });

describe("applyLevelOffer", () => {
  it("offers the level for up/down when it differs", () => {
    expect(applyLevelOffer(L({}), "B1")).toBe("B2");
    expect(applyLevelOffer(L({ verdict: "down", suggestedLevel: "A2" }), "B1")).toBe("A2");
    expect(applyLevelOffer(L({}), "")).toBe("B2");
  });
  it("offers nothing otherwise", () => {
    expect(applyLevelOffer(null, "B1")).toBeNull();
    expect(applyLevelOffer(L({}), "B2")).toBeNull();
    expect(applyLevelOffer(L({ verdict: "keep" }), "B1")).toBeNull();
    expect(applyLevelOffer(L({ verdict: "insufficient" }), "B1")).toBeNull();
    expect(applyLevelOffer(L({ suggestedLevel: undefined }), "B1")).toBeNull();
  });
});

describe("writeButtonKey / reasonKey", () => {
  it("picks the button text", () => {
    expect(writeButtonKey("idle", false)).toBe("dashboard.report.write");
    expect(writeButtonKey("idle", true)).toBe("dashboard.report.rewrite");
    expect(writeButtonKey("failed", true)).toBe("dashboard.report.rewrite");
    expect(writeButtonKey("writing", true)).toBe("dashboard.report.writing");
  });
  it("maps status to a reason", () => {
    expect(reasonKey("off")).toBe("dashboard.report.off");
    expect(reasonKey("failed")).toBe("dashboard.report.failed");
    expect(reasonKey("idle")).toBeNull();
    expect(reasonKey("writing")).toBeNull();
  });
});
