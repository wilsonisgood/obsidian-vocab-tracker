import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  setIcon: () => undefined,
  Notice: class {},
  MarkdownRenderChild: class {
    constructor(public containerEl: unknown) {}
  },
}));

import { setLocale } from "../../../src/core/i18n";
import type { WordBreakdown } from "../../../src/core/model/morpheme";
import { breakdownButtonLabel, breakdownDisplay } from "../../../src/ui/blocks/wordHeader";

afterEach(() => setLocale("en"));

// Pure display-state logic for the word page header's emoji/拆字 area
// (規劃書 09 §7.1, A7) — no DOM needed (vitest is a node environment).

function breakdown(status: WordBreakdown["status"]): WordBreakdown {
  return { status, parts: [], gloss: "", word: "export", generatedAt: "2026-10-07T00:00:00.000Z", model: "" };
}

describe("breakdownDisplay", () => {
  it("offers the 「拆字」button when the word hasn't been analyzed yet", () => {
    expect(breakdownDisplay(undefined)).toBe("button");
  });

  it("shows the strand once analysis came back ok", () => {
    expect(breakdownDisplay(breakdown("ok"))).toBe("strand");
  });

  it("shows neither strand nor button when analysis found nothing to split (決定 5)", () => {
    expect(breakdownDisplay(breakdown("none"))).toBe("none");
  });
});

describe("breakdownButtonLabel", () => {
  it("says 拆字 / Break down when idle", () => {
    setLocale("zh-TW");
    expect(breakdownButtonLabel(false)).toBe("拆字");
    setLocale("en");
    expect(breakdownButtonLabel(false)).toBe("Break down");
  });

  it("says 拆字中… / Breaking down… while analyzeNow is in flight", () => {
    setLocale("zh-TW");
    expect(breakdownButtonLabel(true)).toBe("拆字中…");
    setLocale("en");
    expect(breakdownButtonLabel(true)).toBe("Breaking down…");
  });
});
