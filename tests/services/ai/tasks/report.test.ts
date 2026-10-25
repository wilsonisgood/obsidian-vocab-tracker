import { describe, expect, it } from "vitest";
import { defaultLearnerProfile } from "../../../../src/core/model/settings";
import { defaultTaskRegistry } from "../../../../src/services/ai/tasks/registry";
import { parseReportAdvice, reportAdvise } from "../../../../src/services/ai/tasks/report";

describe("report.advise", () => {
  it("is a smart report task carrying the digest and level", () => {
    expect(reportAdvise.id).toBe("report.advise");
    expect(reportAdvise.surface).toBe("report");
    expect(defaultTaskRegistry().get("report.advise")).toBe(reportAdvise);
    const req = reportAdvise.build({ digest: "活躍 3 天", level: "B1" }, { profile: defaultLearnerProfile(), history: [] });
    expect(req.tier).toBe("smart");
    const user = req.messages.at(-1)?.content ?? "";
    expect(user).toContain("活躍 3 天");
    expect(user).toContain("B1");
  });
  it("parses bullets into paragraphs", () => {
    expect(parseReportAdvice("```\n- 一\n* 二\n3. 三\n\n## 標題\n```")).toEqual(["一", "二", "三"]);
  });
});
