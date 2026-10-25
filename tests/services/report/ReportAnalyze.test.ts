import { describe, expect, it } from "vitest";
import { baselineAxes } from "../../../src/core/learner/radar";
import type { ReportAdvice } from "../../../src/core/learner/reportAdvice";
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
    return result(opts.reply ?? ANALYSIS_JSON);
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

const advice = (text: string): ReportAdvice => ({ letter: "", axes: baselineAxes(DATA), levels: [], focus: [text], tryNext: [], reading: [] });
const DATA = buildReport(
  { level: "B1", asks: [], wordTouches: [], reading: [], events: [], reviews: [], vocab: [], grammarMastered: 0 },
  { from: "2026-10-19", to: "2026-10-25" },
  { from: "2026-10-12", to: "2026-10-18" }
);

function report(key: string, adv = "ADVICE"): string {
  return renderReportFile(DATA, { key, advice: advice(adv) });
}
const ANALYSIS_JSON = JSON.stringify({ now: "**你常問什麼**\n文法", next: "**第 1 週**\n練現在完成式" });

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

  it("writes the two halves into the two callouts and stamps analyzed", async () => {
    const { svc, vault, ai } = setup({ reply: ANALYSIS_JSON });
    vault.files.set(PATH, report("2026-W43"));
    expect(await svc.analyze("2026-W43")).toBe("written");
    const t = vault.files.get(PATH) as string;
    expect(t).toContain("analyzed: 2026-10-26T");
    expect(t).toContain("> #### 詳細分析 · 現況");
    expect(t).toContain("> #### 詳細分析 · 四週方向");
    expect(t).toContain("> **你常問什麼**");
    expect(t).toContain("> 練現在完成式");
    expect(t.indexOf("[!abstract]")).toBeLessThan(t.indexOf("詳細分析 · 現況"));
    expect(t.indexOf("詳細分析 · 現況")).toBeLessThan(t.indexOf("[!tip]"));
    expect(t.indexOf("[!tip]")).toBeLessThan(t.indexOf("詳細分析 · 四週方向"));
    expect(t.indexOf("詳細分析 · 四週方向")).toBeLessThan(t.indexOf("[!note]-"));
    expect(t.indexOf("詳細分析 · 四週方向")).toBeLessThan(t.indexOf("```vocab-report-analyze"));
    expect(JSON.stringify(ai.requests[0])).toContain("QQ"); // the thread made it in
    expect(svc.isAnalyzing("2026-W43")).toBe(false);
  });

  it("re-analysis only swaps the managed blocks", async () => {
    const { svc, vault, ai } = setup({ reply: ANALYSIS_JSON });
    vault.files.set(PATH, report("2026-W43"));
    await svc.analyze("2026-W43");
    const edited = (vault.files.get(PATH) as string).replace("ADVICE", "ADVICE edited by hand");
    vault.files.set(PATH, edited);
    ai.script = () => result(JSON.stringify({ now: "NEW-NOW", next: "NEW-NEXT" }));
    await svc.analyze("2026-W43");
    const t = vault.files.get(PATH) as string;
    expect(t).toContain("> NEW-NOW");
    expect(t).toContain("> NEW-NEXT");
    expect(t).not.toContain("你常問什麼");
    expect(t).toContain("ADVICE edited by hand");
    expect(t.match(/詳細分析 · 現況/g)).toHaveLength(1);
    expect(t.match(/詳細分析 · 四週方向/g)).toHaveLength(1);
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
    ai.script = () => new Promise((r) => (release = () => r(result(ANALYSIS_JSON))));
    const p = svc.analyze("2026-W43");
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(svc.isAnalyzing("2026-W43")).toBe(true);
    expect(await svc.analyze("2026-W43")).toBe("busy");
    release();
    expect(await p).toBe("written");
  });
});

describe("ReportService.pendingAnalysis / withPrevious", () => {
  const P = (k: string) => `${FOLDER}/vocab-report-${k}.md`;
  const withFm = (k: string, extra: string) => report(k).replace("verdict:", `${extra}\nverdict:`);

  it("lists the unbroken run of existing, unanalysed weeks before, oldest first", () => {
    const { svc, vault } = setup();
    for (const k of ["2026-W39", "2026-W41", "2026-W42", "2026-W43"]) vault.files.set(P(k), report(k));
    vault.files.set(P("2026-W44"), report("2026-W44"));
    expect(svc.pendingAnalysis("2026-W44")).toEqual(["2026-W41", "2026-W42", "2026-W43"]); // W40 is missing
  });

  it("stops at an analysed week and skips analyzed-in ones", () => {
    const { svc, vault } = setup();
    vault.files.set(P("2026-W41"), report("2026-W41"));
    vault.files.set(P("2026-W42"), withFm("2026-W42", "analyzed: 2026-10-20T00:00:00Z"));
    vault.files.set(P("2026-W43"), report("2026-W43"));
    vault.files.set(P("2026-W44"), report("2026-W44"));
    expect(svc.pendingAnalysis("2026-W44")).toEqual(["2026-W43"]);
    vault.files.set(P("2026-W43"), withFm("2026-W43", "analyzed-in: 2026-W44"));
    expect(svc.pendingAnalysis("2026-W44")).toEqual([]);
  });

  it("looks back at most 8 weeks", () => {
    const { svc, vault } = setup();
    const keys = Array.from({ length: 11 }, (_, i) => `2026-W${String(30 + i).padStart(2, "0")}`); // W30..W40
    for (const k of keys) vault.files.set(P(k), report(k));
    vault.files.set(P("2026-W41"), report("2026-W41"));
    const pending = svc.pendingAnalysis("2026-W41");
    expect(pending).toHaveLength(8);
    expect(pending[0]).toBe("2026-W33");
    expect(pending[7]).toBe("2026-W40");
  });

  it("works across a year boundary", () => {
    const { svc, vault } = setup();
    vault.files.set(P("2025-W52"), report("2025-W52"));
    vault.files.set(P("2026-W01"), report("2026-W01"));
    expect(svc.pendingAnalysis("2026-W01")).toEqual(["2025-W52"]);
  });

  it("withPrevious analyses from the earliest pending week and marks the others", async () => {
    const { svc, vault, ai } = setup({ reply: ANALYSIS_JSON });
    const w42 = report("2026-W42").replace("period: 2026-10-19~2026-10-25", "period: 2026-10-12~2026-10-18");
    vault.files.set(P("2026-W42"), w42);
    vault.files.set(PATH, report("2026-W43"));
    expect(await svc.analyze("2026-W43", { withPrevious: true })).toBe("written");
    expect(JSON.stringify(ai.requests[0])).toContain("2026-10-12");
    const t = vault.files.get(PATH) as string;
    expect(t).toContain("analyzed-from: 2026-10-12");
    expect(t).toContain("analyzed: ");
    expect(vault.files.get(P("2026-W42"))).toContain("analyzed-in: 2026-W43");
    expect(vault.files.get(P("2026-W42"))).not.toContain("analyzed: ");
    expect(svc.pendingAnalysis("2026-W43")).toEqual([]);
    // re-analysis keeps the span; "this week only" drops it
    await svc.analyze("2026-W43");
    expect(vault.files.get(PATH)).toContain("analyzed-from: 2026-10-12");
    await svc.analyze("2026-W43", { withPrevious: false });
    expect(vault.files.get(PATH)).not.toContain("analyzed-from");
  });

  it("without withPrevious nothing else is touched", async () => {
    const { svc, vault } = setup({ reply: ANALYSIS_JSON });
    vault.files.set(P("2026-W42"), report("2026-W42"));
    vault.files.set(PATH, report("2026-W43"));
    await svc.analyze("2026-W43");
    expect(vault.files.get(P("2026-W42"))).toBe(report("2026-W42"));
    expect(vault.files.get(PATH)).not.toContain("analyzed-from");
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
