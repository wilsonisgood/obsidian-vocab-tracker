import { describe, expect, it } from "vitest";
import { renderReportFile } from "../../../src/core/learner/reportMarkdown";
import { buildReport } from "../../../src/core/learner/report";
import type { Thread } from "../../../src/core/model/thread";
import { ReportService, type ReportServiceDeps } from "../../../src/services/report/ReportService";
import { FakeLearnAi, result } from "../learn/fakes";

const NOW = new Date(2026, 9, 26, 9, 0, 0); // Monday 2026-10-26
const FOLDER = "R";
const PATH = `${FOLDER}/vocab-report-2026-W43.md`;

class FakeVault {
  files = new Map<string, string>();
  exists = (p: string) => this.files.has(p);
  create = async (p: string, c: string) => void this.files.set(p, c);
  process = async (p: string, fn: (t: string) => string) => void this.files.set(p, fn(this.files.get(p) ?? ""));
  list = (f: string) => [...this.files.keys()].filter((p) => p.startsWith(`${f}/`));
  frontmatterOf = (p: string) => {
    const t = this.files.get(p);
    if (!t) return undefined;
    const fm: Record<string, string> = {};
    for (const m of t.matchAll(/^([a-z-]+): (.*)$/gm)) fm[m[1]] = m[2];
    return fm;
  };
}

const THREAD: Thread = {
  id: "t",
  anchor: { kind: "paragraph", path: "a.md", hash: "h", snapshot: "SNAPSHOT" },
  turns: [
    { id: "u1", role: "user", content: "QQ", at: new Date("2026-10-20T10:00:00").toISOString(), status: "done", taskId: "paragraph.grammar" },
    { id: "a1", role: "assistant", content: "AA", at: new Date("2026-10-20T10:00:05").toISOString(), status: "done" },
  ],
} as Thread;

function setup(opts: { aiReady?: boolean; reply?: string; fail?: boolean } = {}) {
  const vault = new FakeVault();
  const ai = new FakeLearnAi(() => {
    if (opts.fail) throw new Error("boom");
    return result(opts.reply ?? "### 你常問什麼\n文法");
  });
  const model: ReportServiceDeps["model"] = {
    activity: () => ({ asks: [], wordTouches: [], reading: [], events: [], reviews: [] }),
    snapshot: () => ({ grammar: { started: 0, mastered: 0, due: 0 } }) as never,
    level: () => "B1",
  };
  const svc = new ReportService({
    model,
    vocab: { entries: [] },
    vault,
    folder: () => FOLDER,
    enabled: () => true,
    ai,
    aiReady: () => opts.aiReady ?? true,
    now: () => NOW,
    threads: () => [THREAD],
    read: async (p) => vault.files.get(p) ?? null,
  });
  return { svc, vault, ai };
}

function report(key: string, advice = "ADVICE"): string {
  const data = buildReport(
    { level: "B1", asks: [], wordTouches: [], reading: [], events: [], reviews: [], vocab: [], grammarMastered: 0 },
    { from: "2026-10-19", to: "2026-10-25" },
    { from: "2026-10-12", to: "2026-10-18" }
  );
  return renderReportFile(data, { key, advice: [advice] });
}

describe("ReportService.analyze", () => {
  it("returns missing when the report note is not there", async () => {
    const { svc, ai } = setup();
    expect(await svc.analyze("2026-W43")).toBe("missing");
    expect(ai.requests).toHaveLength(0);
  });

  it("returns no-ai without calling the AI", async () => {
    const { svc, vault, ai } = setup({ aiReady: false });
    vault.files.set(PATH, report("2026-W43"));
    expect(await svc.analyze("2026-W43")).toBe("no-ai");
    expect(ai.requests).toHaveLength(0);
  });

  it("writes the analysis block above the button block and stamps analyzed", async () => {
    const { svc, vault, ai } = setup();
    vault.files.set(PATH, report("2026-W43"));
    expect(await svc.analyze("2026-W43")).toBe("written");
    const t = vault.files.get(PATH) as string;
    expect(t).toContain("analyzed: 2026-10-26T");
    expect(t).toContain("## 詳細分析");
    expect(t).toContain("### 你常問什麼");
    expect(t.indexOf("## 給你的建議")).toBeLessThan(t.indexOf("## 詳細分析"));
    expect(t.indexOf("## 詳細分析")).toBeLessThan(t.indexOf("```vocab-report-analyze"));
    expect(t).toContain("key: 2026-W43");
    expect(JSON.stringify(ai.requests[0])).toContain("QQ"); // the thread made it in
    expect(svc.isAnalyzing("2026-W43")).toBe(false);
  });

  it("re-analysis only swaps the managed block", async () => {
    const { svc, vault, ai } = setup();
    vault.files.set(PATH, report("2026-W43"));
    await svc.analyze("2026-W43");
    const first = vault.files.get(PATH) as string;
    const edited = first.replace("ADVICE", "ADVICE edited by hand");
    vault.files.set(PATH, edited);
    ai.script = () => result("### NEW");
    await svc.analyze("2026-W43");
    const t = vault.files.get(PATH) as string;
    expect(t).toContain("### NEW");
    expect(t).not.toContain("### 你常問什麼");
    expect(t).toContain("ADVICE edited by hand");
    expect(t.match(/## 詳細分析/g)).toHaveLength(1);
    expect(t.match(/analyzed:/g)).toHaveLength(1);
  });

  it("returns failed and leaves the note alone when the AI fails", async () => {
    const { svc, vault } = setup({ fail: true });
    const before = report("2026-W43");
    vault.files.set(PATH, before);
    expect(await svc.analyze("2026-W43")).toBe("failed");
    expect(vault.files.get(PATH)).toBe(before);
  });

  it("returns busy while one is running", async () => {
    const { svc, vault, ai } = setup();
    vault.files.set(PATH, report("2026-W43"));
    let release: () => void = () => {};
    ai.script = () => new Promise((r) => (release = () => r(result("### X"))));
    const p = svc.analyze("2026-W43");
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(svc.isAnalyzing("2026-W43")).toBe(true);
    expect(await svc.analyze("2026-W43")).toBe("busy");
    release();
    expect(await p).toBe("written");
  });
});

describe("ReportService.review", () => {
  it("is empty when no weekly report falls in the month", async () => {
    const { svc, vault } = setup();
    vault.files.set(`${FOLDER}/vocab-report-2026-W38.md`, report("2026-W38")); // Sunday 2026-09-20
    expect(await svc.review("month")).toEqual({ result: "empty" });
  });

  it("returns no-ai", async () => {
    const { svc } = setup({ aiReady: false });
    expect(await svc.review("month")).toEqual({ result: "no-ai" });
  });

  it("writes the month review from the weeks whose Sunday is in it", async () => {
    const { svc, vault, ai } = setup({ reply: "### 這段時間的變化\n進步" });
    vault.files.set(`${FOLDER}/vocab-report-2026-W38.md`, report("2026-W38", "OLD-SEPT"));
    vault.files.set(`${FOLDER}/vocab-report-2026-W43.md`, report("2026-W43", "OCT-ADVICE"));
    const r = await svc.review("month");
    expect(r).toEqual({ result: "written", path: `${FOLDER}/vocab-review-2026-10.md` });
    const t = vault.files.get(r.path as string) as string;
    expect(t).toContain("vocab-tracker: report");
    expect(t).toContain("vocab-tracker-id: review-2026-10");
    expect(t).toContain("period: 2026-10-01~2026-10-26");
    expect(t).toContain("### 這段時間的變化");
    const sent = JSON.stringify(ai.requests[0]);
    expect(sent).toContain("OCT-ADVICE");
    expect(sent).not.toContain("OLD-SEPT");
    // overwrite on a second press
    ai.script = () => result("### 第二次");
    await svc.review("month");
    expect(vault.files.get(r.path as string)).toContain("### 第二次");
    expect(vault.files.get(r.path as string)).not.toContain("### 這段時間的變化");
  });

  it("the quarter review spans the quarter up to today", async () => {
    const { svc, vault } = setup();
    vault.files.set(`${FOLDER}/vocab-report-2026-W38.md`, report("2026-W38", "SEPT"));
    vault.files.set(`${FOLDER}/vocab-report-2026-W40.md`, report("2026-W40", "EARLY-OCT"));
    const r = await svc.review("quarter");
    expect(r.path).toBe(`${FOLDER}/vocab-review-2026-Q4.md`);
    const t = vault.files.get(r.path as string) as string;
    expect(t).toContain("period: 2026-10-01~2026-10-26");
  });
});
