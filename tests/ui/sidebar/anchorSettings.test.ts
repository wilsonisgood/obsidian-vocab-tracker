import { describe, expect, it } from "vitest";
import { needsBlockIdNotice, patchAnchorSettings, resolveAnchorSettings } from "../../../src/ui/sidebar/anchorSettings";

describe("anchor settings", () => {
  it("defaults to block mode with the notice not seen", () => {
    expect(resolveAnchorSettings(undefined)).toEqual({ mode: "block", blockIdNoticeSeen: false });
    expect(resolveAnchorSettings({ schemaVersion: 2 })).toEqual({ mode: "block", blockIdNoticeSeen: false });
    expect(resolveAnchorSettings({ anchors: { mode: "weird", blockIdNoticeSeen: "yes" } })).toEqual({
      mode: "block",
      blockIdNoticeSeen: false,
    });
  });

  it("reads hash mode and the seen flag", () => {
    const s = { anchors: { mode: "hash", blockIdNoticeSeen: true, updatedAt: "2026-10-05T00:00:00Z" } };
    expect(resolveAnchorSettings(s)).toEqual({ mode: "hash", blockIdNoticeSeen: true, updatedAt: "2026-10-05T00:00:00Z" });
  });

  it("patches without dropping unknown keys", () => {
    const s: Record<string, unknown> = { anchors: { mode: "block", future: 1 } };
    patchAnchorSettings(s, { mode: "hash" });
    expect(s.anchors).toEqual({ mode: "hash", blockIdNoticeSeen: false, future: 1 });
    const empty: Record<string, unknown> = {};
    patchAnchorSettings(empty, { blockIdNoticeSeen: true });
    expect(empty.anchors).toEqual({ mode: "block", blockIdNoticeSeen: true });
  });

  it("explains block ids only before one would really be written", () => {
    const fresh = resolveAnchorSettings(undefined);
    expect(needsBlockIdNotice(fresh, "A paragraph.")).toBe(true);
    // Already ends in a block id: it's reused, nothing is written.
    expect(needsBlockIdNotice(fresh, "A paragraph. ^mine")).toBe(false);
    expect(needsBlockIdNotice({ ...fresh, blockIdNoticeSeen: true }, "A paragraph.")).toBe(false);
    expect(needsBlockIdNotice({ ...fresh, mode: "hash" }, "A paragraph.")).toBe(false);
  });
});
