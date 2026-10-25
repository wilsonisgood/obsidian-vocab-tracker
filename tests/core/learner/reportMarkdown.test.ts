import { describe, expect, it } from "vitest";
import { buildReport, type ReportInput } from "../../../src/core/learner/report";
import { renderReportFile, reportDigest, verdictHeadline } from "../../../src/core/learner/reportMarkdown";

const input: ReportInput = {
  level: "B1",
  asks: [
    { id: "1", at: new Date("2026-10-20T10:00:00").toISOString(), surface: "paragraph", taskId: "paragraph.grammar", custom: false, ok: true },
    { id: "2", at: new Date("2026-10-21T10:00:00").toISOString(), surface: "trivia", taskId: "trivia.more", custom: false, ok: true },
    { id: "3", at: new Date("2026-10-21T11:00:00").toISOString(), surface: "other", taskId: "mystery.task", custom: false, ok: true },
    { id: "0", at: new Date("2026-10-13T10:00:00").toISOString(), surface: "paragraph", taskId: "paragraph.grammar", custom: false, ok: true },
  ],
  wordTouches: [],
  reading: [{ id: "r", day: "2026-10-20", at: "", updatedAt: "", path: "SECRET ARTICLE BODY.md", title: "Coral Reefs", kinds: ["word"] }],
  events: [],
  reviews: [],
  vocab: [],
  grammarMastered: 0,
};
const data = buildReport(input, { from: "2026-10-19", to: "2026-10-25" }, { from: "2026-10-12", to: "2026-10-18" });

describe("renderReportFile", () => {
  it("renders frontmatter, task names and ▲ against the previous period", () => {
    const text = renderReportFile(data, { key: "2026-W43", advice: ["先把文法補好。"] });
    expect(text.startsWith("---\nvocab-tracker: report\nvocab-tracker-id: report-2026-W43\nperiod: 2026-10-19~2026-10-25\nverdict: insufficient\n---")).toBe(true);
    expect(text).not.toContain("suggested-level");
    expect(text).toContain("# 學習週報 2026-W43（2026-10-19 ～ 2026-10-25）");
    expect(text).toContain("文法解析：1");
    expect(text).toContain("小知識：1");
    expect(text).toContain("mystery.task：1");
    expect(text).toContain("▲2");
    expect(text).toContain("資料不夠，下期再看");
    expect(text).toContain("先把文法補好。");
  });
  it("omits empty sections and shows the note when no advice", () => {
    const text = renderReportFile(data, { key: "2026-W43", aiNote: "AI 沒有開啟，這段略過" });
    expect(text).not.toContain("### 單字複習");
    expect(text).not.toContain("### 弱點");
    expect(text).toContain("AI 沒有開啟，這段略過");
  });
});

describe("verdictHeadline", () => {
  it("covers the four verdicts", () => {
    expect(verdictHeadline("up", "B2")).toBe("可以往上一級試試（建議 B2）");
    expect(verdictHeadline("keep")).toBe("維持目前程度");
    expect(verdictHeadline("down")).toBe("建議先回頭補基礎");
    expect(verdictHeadline("insufficient")).toBe("資料不夠，下期再看");
  });
});

describe("reportDigest", () => {
  it("has numbers but no article titles or paths", () => {
    const d = reportDigest(data);
    expect(d).toContain("AI 討論 3 次");
    expect(d).not.toContain("SECRET");
    expect(d).not.toContain("Coral");
  });
});
