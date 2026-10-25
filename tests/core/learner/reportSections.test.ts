import { describe, expect, it } from "vitest";
import { collectReviewMaterial } from "../../../src/core/learner/analysisMaterial";
import { BUDDY_REPORT_SECTIONS, buddyContext } from "../../../src/core/learner/buddyContext";
import { buildReport } from "../../../src/core/learner/report";
import { renderReportFile } from "../../../src/core/learner/reportMarkdown";
import { extractReportParts, reportPart } from "../../../src/core/learner/reportSections";
import { applyAnalysis } from "../../../src/services/report/applyAnalysis";

const data = buildReport(
  { level: "B1", asks: [], wordTouches: [], reading: [], events: [], reviews: [], vocab: [], grammarMastered: 0 },
  { from: "2026-10-19", to: "2026-10-25" }
);
const advice = {
  letter: "LETTER-TEXT 這週不錯。",
  axes: [
    { name: "a", value: 1, clear: true },
    { name: "b", value: 1, clear: true },
    { name: "c", value: 1, clear: true },
  ],
  levels: [{ area: "字彙量", level: "約 B1", basis: "BASIS-X" }],
  focus: ["FOCUS-ONE", "FOCUS-TWO"],
  tryNext: ["TRY-ONE"],
  reading: ["READ-ONE"],
};
const fresh = () => renderReportFile(data, { key: "2026-W43", advice });
const analysis = { now: "**你常問什麼**\nNOW-BODY\n\n# 偷偷的標題\n更多", next: "**第 1 週**\nNEXT-BODY" };

const OLD = [
  "---",
  "verdict: keep",
  "---",
  "# 學習週報 2026-W43（2026-10-19 ～ 2026-10-25）",
  "",
  "## 這週的數字",
  "",
  "- NUMBERS",
  "",
  "## 程度建議",
  "",
  "**維持目前程度**",
  "",
  "## 給你的建議",
  "",
  "- OLD-ADVICE",
  "",
  "```vocab-report-analyze",
  "key: 2026-W43",
  "```",
  "",
].join("\n");

describe("extractReportParts: new layout", () => {
  const parts = extractReportParts(fresh());

  it("finds the letter, level table, 程度建議, 加強, 試試 and 閱讀", () => {
    expect(parts["信"]).toBe("LETTER-TEXT 這週不錯。");
    expect(parts["程度推估表"]).toContain("| 字彙量 | 約 B1 | BASIS-X |");
    expect(parts["程度推估表"]).not.toContain("vocab-report-radar");
    expect(parts["程度推估表"].startsWith("| 面向")).toBe(true);
    expect(parts["程度建議"]).toContain("**資料不夠，下期再看**");
    expect(parts["程度建議"]).not.toContain(">");
    expect(parts["照你的程度可以加強"]).toBe("- FOCUS-ONE\n- FOCUS-TWO");
    expect(parts["下週一起試試"]).toBe("- [ ] TRY-ONE");
    expect(parts["適合你的閱讀"]).toBe("- READ-ONE");
  });

  it("leaves out the number detail and the button block", () => {
    const all = Object.values(parts).join("\n");
    expect(all).not.toContain("活躍");
    expect(all).not.toContain("vocab-report-analyze");
    expect(parts["詳細分析"]).toBeUndefined();
  });

  it("returns both halves of the detailed analysis, joined", () => {
    const text = applyAnalysis(fresh(), analysis, "2026-10-26T00:00:00Z");
    const p = extractReportParts(text);
    expect(p["詳細分析 · 現況"]).toContain("NOW-BODY");
    expect(p["詳細分析 · 四週方向"]).toContain("NEXT-BODY");
    expect(p["詳細分析"]).toBe(`【現況】\n${p["詳細分析 · 現況"]}\n\n【四週方向】\n${p["詳細分析 · 四週方向"]}`);
    expect(p["詳細分析"]).not.toContain("vt:begin");
    // the other sections stay clean after the insert
    expect(p["適合你的閱讀"]).toBe("- READ-ONE");
    expect(p["照你的程度可以加強"]).toBe("- FOCUS-ONE\n- FOCUS-TWO");
  });
});

describe("extractReportParts: old layout", () => {
  it("still finds 程度建議, 給你的建議 and 詳細分析", () => {
    const text = applyAnalysis(OLD, "### 文法\nOLD-ANALYSIS", "2026-10-26T00:00:00Z");
    expect(reportPart(text, "程度建議")).toBe("**維持目前程度**");
    expect(reportPart(text, "給你的建議")).toBe("- OLD-ADVICE");
    expect(reportPart(text, "詳細分析")).toContain("OLD-ANALYSIS");
    expect(reportPart(text, "詳細分析")).not.toContain("vt:");
    expect(reportPart(text, "信")).toBe("");
    expect(reportPart(text, "不存在")).toBe("");
  });
});

describe("consumers of the sections", () => {
  const analysed = applyAnalysis(fresh(), analysis, "2026-10-26T00:00:00Z");
  const snap = {
    level: "B1",
    vocab: { total: 0, learning: 0, mature: 0, due: 0 },
    grammar: { started: 0, mastered: 0, due: 0 },
    poly: { practisedSenses: 0, weakSenses: 0 },
    weak: [],
  };

  it("the buddy gets the letter, table, advice, 加強, 試試 and the analysis from a new report", () => {
    const c = buddyContext(snap, analysed);
    for (const s of ["LETTER-TEXT", "BASIS-X", "資料不夠", "FOCUS-ONE", "TRY-ONE", "NOW-BODY", "NEXT-BODY"]) expect(c).toContain(s);
    expect(c).not.toContain("活躍");
    expect(BUDDY_REPORT_SECTIONS).toContain("照你的程度可以加強");
  });

  it("the buddy still reads an old report", () => {
    const c = buddyContext(snap, OLD);
    expect(c).toContain("OLD-ADVICE");
    expect(c).toContain("維持目前程度");
    expect(c).not.toContain("NUMBERS");
  });

  it("the review material takes the sections of either layout", () => {
    const r = collectReviewMaterial([
      { key: "2026-W42", text: OLD },
      { key: "2026-W43", text: analysed },
    ]);
    expect(r.text).toContain("OLD-ADVICE");
    expect(r.text).toContain("FOCUS-TWO");
    expect(r.text).toContain("NEXT-BODY");
    expect(r.text).not.toContain("活躍");
    expect(r.text).not.toContain("vocab-report-radar");
  });

  it("when too long, the analysis and 加強 are kept before the letter", () => {
    const long = (s: string) => s.repeat(900);
    const text = applyAnalysis(
      renderReportFile(data, { key: "2026-W43", advice: { ...advice, letter: "LETTER-" + long("L"), focus: ["FOCUS-" + long("F")] } }),
      { now: "ANALYSIS-" + long("A"), next: "" },
      "x"
    );
    const weeks = Array.from({ length: 30 }, (_, i) => ({ key: `2026-W${String(10 + i).padStart(2, "0")}`, text }));
    const r = collectReviewMaterial(weeks);
    expect(r.truncated).toBe(true);
    expect(r.text).toContain("【詳細分析】");
    expect(r.text).not.toContain("LETTER-");
  });
});

describe("applyAnalysis", () => {
  it("new layout: re-analysis swaps only the two blocks and stamps once", () => {
    const first = applyAnalysis(fresh(), analysis, "T1");
    const edited = first.replace("LETTER-TEXT", "LETTER edited");
    const second = applyAnalysis(edited, { now: "N2", next: "X2" }, "T2");
    expect(second).toContain("LETTER edited");
    expect(second).toContain("> N2");
    expect(second).toContain("> X2");
    expect(second).not.toContain("NOW-BODY");
    expect(second.match(/#### 詳細分析 · 現況/g)).toHaveLength(1);
    expect(second.match(/vt:begin analysis-now/g)).toHaveLength(1);
    expect(second).toContain("analyzed: T2");
    expect(second.match(/analyzed:/g)).toHaveLength(1);
  });

  it("new layout: every inserted line is quoted and headings are demoted", () => {
    const t = applyAnalysis(fresh(), analysis, "T1");
    const lines = t.split("\n");
    const i = lines.findIndex((l) => l.includes("vt:begin analysis-now"));
    const j = lines.findIndex((l) => l.includes("vt:end analysis-now"));
    expect(j).toBeGreaterThan(i);
    for (const l of lines.slice(i, j + 1)) expect(l.startsWith(">")).toBe(true);
    expect(t).toContain("> ##### 偷偷的標題");
    // the first callout still ends before the tip callout, separated by a blank line
    expect(lines[j + 1]).toBe("");
    expect(lines[j + 2].startsWith("> [!tip]")).toBe(true);
  });

  it("old layout: writes the ## 詳細分析 section above the button block, with one managed block", () => {
    const t = applyAnalysis(OLD, { now: "NOW-OLD", next: "NEXT-OLD" }, "T1");
    expect(t).toContain("## 詳細分析");
    expect(t.indexOf("## 詳細分析")).toBeLessThan(t.indexOf("```vocab-report-analyze"));
    expect(t).toContain("NOW-OLD");
    expect(t).toContain("NEXT-OLD");
    const again = applyAnalysis(t, "### SECOND", "T2");
    expect(again).toContain("### SECOND");
    expect(again).not.toContain("NOW-OLD");
    expect(again.match(/## 詳細分析/g)).toHaveLength(1);
  });
});
