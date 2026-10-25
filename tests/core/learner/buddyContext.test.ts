import { describe, expect, it } from "vitest";
import { buddyContext, reportSection, type BuddySnapshot } from "../../../src/core/learner/buddyContext";

const snap: BuddySnapshot = {
  level: "B1",
  vocab: { total: 120, learning: 40, mature: 30, due: 5 },
  grammar: { started: 4, mastered: 2, due: 1 },
  poly: { practisedSenses: 3, weakSenses: 1 },
  weak: [{ focus: { kind: "grammar", id: "present-perfect" }, track: "grammar", wrong: 3, commonGiven: "went" }],
};
const empty: BuddySnapshot = {
  level: "",
  vocab: { total: 0, learning: 0, mature: 0, due: 0 },
  grammar: { started: 0, mastered: 0, due: 0 },
  poly: { practisedSenses: 0, weakSenses: 0 },
  weak: [],
};
const report = `---\nverdict: keep\n---\n## 本週概況\n\n略\n\n## 程度建議\n\n**維持 B1**\n\n## 給你的建議\n\n- 多讀短文\n\n## 詳細分析\n\n### 文法\n\n現在完成式常錯\n\n## 附錄\n\n不要放`;

describe("buddyContext", () => {
  it("summarises the snapshot without a report", () => {
    const c = buddyContext(snap);
    expect(c).toContain("B1");
    expect(c).toContain("120");
    expect(c).toContain("present-perfect");
    expect(c).not.toContain("最新學習報告");
  });

  it("adds the three report sections, nothing else", () => {
    const c = buddyContext(snap, report);
    expect(c).toContain("維持 B1");
    expect(c).toContain("多讀短文");
    expect(c).toContain("現在完成式常錯");
    expect(c).not.toContain("不要放");
    expect(c).not.toContain("本週概況");
  });

  it("clips each section at 3000 characters", () => {
    const long = `## 給你的建議\n\n${"字".repeat(5000)}\n`;
    const c = buddyContext(empty, long);
    expect(c.length).toBeLessThan(3100);
    expect(c.endsWith("…")).toBe(true);
  });

  it("is empty when there is nothing to say", () => {
    expect(buddyContext(empty)).toBe("");
    expect(buddyContext(empty, "  ")).toBe("");
  });

  it("reportSection finds a section by heading prefix", () => {
    expect(reportSection(report, "詳細分析")).toContain("### 文法");
    expect(reportSection(report, "不存在")).toBe("");
  });
});
