import { defaultLearnerProfile } from "../../../src/core/model/settings";
import { describe, expect, it } from "vitest";
import { collectAnalysisMaterial, collectReviewMaterial, extractReportSection, type AnalysisInput } from "../../../src/core/learner/analysisMaterial";
import { monthKeyOf, monthRange, quarterKeyOf, quarterRange } from "../../../src/core/learner/period";
import type { LearnEvent } from "../../../src/core/model/learner";
import type { Thread, Turn } from "../../../src/core/model/thread";
import { reportAnalyze, REPORT_ANALYZE_PROMPT } from "../../../src/services/ai/tasks/reportAnalyze";
import { reportReview } from "../../../src/services/ai/tasks/reportReview";
import { WARM_TONE } from "../../../src/services/ai/tasks/tone";

const at = (day: string, h = 12) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00`).toISOString();
function user(id: string, day: string, extra: Partial<Turn> = {}): Turn {
  return { id, role: "user", content: `q-${id}`, at: at(day), status: "done", taskId: "paragraph.grammar", ...extra };
}
function asst(id: string, day: string, content = `a-${id}`, extra: Partial<Turn> = {}): Turn {
  return { id, role: "assistant", content, at: at(day), status: "done", ...extra };
}
function thread(id: string, anchor: Thread["anchor"], turns: Turn[]): Thread {
  return { id, anchor, turns } as Thread;
}
const para = (snapshot: string): Thread["anchor"] => ({ kind: "paragraph", path: "a.md", hash: "h", snapshot });
const period = { from: "2026-10-19", to: "2026-10-25" };
const base: AnalysisInput = { period, threads: [], events: [], words: { repeated: [], savedStillLooked: [], mostPronounced: [] }, digest: "DIGEST", level: "B1" };

describe("collectAnalysisMaterial", () => {
  it("keeps only rounds whose question falls in the period", () => {
    const th = thread("t", para("snap"), [user("u1", "2026-10-18"), asst("a1", "2026-10-18"), user("u2", "2026-10-20"), asst("a2", "2026-10-20")]);
    const m = collectAnalysisMaterial({ ...base, threads: [th] });
    expect(m.rounds).toBe(1);
    expect(m.text).toContain("q-u2");
    expect(m.text).not.toContain("q-u1");
    expect(m.text).toContain("自述程度〕B1");
    expect(m.text).toContain("DIGEST");
  });

  it("marks tombstoned rounds, sends selection, truncates snapshot and answer", () => {
    const th = thread("t", para("S".repeat(600)), [
      user("u1", "2026-10-20", { selection: "SEL-TEXT", question: "為什麼用 had been？", deletedAt: at("2026-10-21") }),
      asst("a1", "2026-10-20", "A".repeat(900), { deletedAt: at("2026-10-21") }),
    ]);
    const m = collectAnalysisMaterial({ ...base, threads: [th] });
    expect(m.text).toContain("（已刪除）");
    expect(m.text).toContain("類型：文法解析");
    expect(m.text).toContain("選取文字：SEL-TEXT");
    expect(m.text).toContain("你的問題：為什麼用 had been？");
    expect(m.text).toContain("S".repeat(500) + "…");
    expect(m.text).not.toContain("S".repeat(501));
    expect(m.text).toContain("A".repeat(800) + "…");
    expect(m.text).not.toContain("A".repeat(801));
  });

  it("names a word discussion by word and meaning", () => {
    const th = thread("w", { kind: "word", entryId: "e1" }, [user("u1", "2026-10-20", { taskId: "word.usage" }), asst("a1", "2026-10-20")]);
    const m = collectAnalysisMaterial({ ...base, threads: [th], entryLabel: (id) => (id === "e1" ? "stress（壓力）" : undefined) });
    expect(m.text).toContain("類型：用法｜對象：stress（壓力）");
  });

  it("lists the last 60 wrong answers, looking questions up", () => {
    const ev = (i: number, extra: Partial<LearnEvent> = {}): LearnEvent => ({
      id: `e${i}`,
      at: at("2026-10-20", 8 + (i % 10)) ,
      track: "grammar",
      focus: { kind: "word", id: `f${i}` },
      result: "wrong",
      ...extra,
    });
    const events = [
      ev(0, { questionId: "q0", given: "went", errorTag: "tense" }),
      ev(1, { result: "correct" }),
      ev(2, { at: at("2026-10-01") }),
      ...Array.from({ length: 70 }, (_, i) => ev(100 + i, { at: new Date(2026, 9, 21, 0, i).toISOString() })),
    ];
    const m = collectAnalysisMaterial({ ...base, events, questionOf: (id) => (id === "q0" ? { prompt: "He ___ home.", answer: "goes" } : undefined) });
    expect(m.text).toContain("最近 60 題");
    expect(m.text).not.toContain("題目：（查不到）f0"); // dropped as one of the oldest 11
    expect(m.text).toContain("題目：（查不到）f169");
    expect(m.text).not.toContain("f2");
    const only = collectAnalysisMaterial({ ...base, events: [ev(0, { questionId: "q0", given: "went", errorTag: "tense" })], questionOf: () => ({ prompt: "He ___ home.", answer: "goes" }) });
    expect(only.text).toContain("題目：He ___ home.｜你選的：went｜正確答案：goes｜錯誤類型：tense");
  });

  it("caps each word list at 20", () => {
    const repeated = Array.from({ length: 30 }, (_, i) => ({ word: `w${i}`, days: 2, lookups: 3 }));
    const m = collectAnalysisMaterial({ ...base, words: { repeated, savedStillLooked: [], mostPronounced: [] } });
    expect(m.text).toContain("w19（2 天）");
    expect(m.text).not.toContain("w20（");
  });

  it("drops the oldest rounds past 60000 characters and says so", () => {
    const turns: Turn[] = [];
    for (let i = 0; i < 30; i++) {
      turns.push(user(`u${i}`, "2026-10-20", { question: `Q${String(i).padStart(2, "0")}${"x".repeat(3000)}`, at: new Date(2026, 9, 20, 0, i).toISOString() }), asst(`a${i}`, "2026-10-20"));
    }
    const m = collectAnalysisMaterial({ ...base, threads: [thread("t", para("s"), turns)] });
    expect(m.totalRounds).toBe(30);
    expect(m.rounds).toBeLessThan(30);
    expect(m.text.length).toBeLessThanOrEqual(60_000);
    expect(m.text.startsWith(`（只附上最近 ${m.rounds} 輪討論，共 30 輪）`)).toBe(true);
    expect(m.text).toContain("Q29");
    expect(m.text).not.toContain("Q00");
  });
});

const weekText = (key: string, adv: string, analysis: string) =>
  [
    "---",
    "vocab-tracker: report",
    "---",
    `# 學習週報 ${key}`,
    "",
    "## 這週的數字",
    "",
    "### 活躍",
    "- NUMBERS-TABLE",
    "",
    "## 程度建議",
    "",
    "**維持目前程度**",
    "",
    "## 給你的建議",
    "",
    adv,
    "",
    ...(analysis ? ["## 詳細分析", "", "%% vt:begin analysis %%", analysis, "%% vt:end analysis %%", ""] : []),
    "```vocab-report-analyze",
    `key: ${key}`,
    "```",
    "",
  ].join("\n");

describe("collectReviewMaterial", () => {
  it("takes the three sections only, no number table", () => {
    const r = collectReviewMaterial([{ key: "2026-W43", text: weekText("2026-W43", "ADV", "ANALYSIS") }]);
    expect(r.truncated).toBe(false);
    expect(r.text).toContain("【程度建議】");
    expect(r.text).toContain("ADV");
    expect(r.text).toContain("ANALYSIS");
    expect(r.text).not.toContain("NUMBERS-TABLE");
    expect(r.text).not.toContain("vt:begin");
    expect(r.text).not.toContain("vocab-report-analyze");
  });

  it("cuts each week to 800 characters when too long, analysis first", () => {
    const weeks = Array.from({ length: 5 }, (_, i) => ({ key: `2026-W4${i}`, text: weekText(`2026-W4${i}`, "B".repeat(13_000), "ANALYSIS-" + "C".repeat(13_000)) }));
    const r = collectReviewMaterial(weeks);
    expect(r.truncated).toBe(true);
    expect(r.weeks).toBe(5);
    expect(r.text.length).toBeLessThan(10_000);
    expect(r.text).toContain("【詳細分析】\nANALYSIS-");
    expect(r.text).not.toContain("BBBB");
  });

  it("extractReportSection returns '' for a missing section", () => {
    expect(extractReportSection(weekText("2026-W43", "x", ""), "詳細分析")).toBe("");
  });
});

describe("month / quarter ranges", () => {
  it("builds keys", () => {
    expect(monthKeyOf("2026-10-26")).toBe("2026-10");
    expect(quarterKeyOf("2026-10-26")).toBe("2026-Q4");
    expect(quarterKeyOf("2027-01-03")).toBe("2027-Q1");
    expect(quarterKeyOf("2026-06-30")).toBe("2026-Q2");
  });
  it("gives month and quarter ranges, leap February included", () => {
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(quarterRange("2026-Q4")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(quarterRange("2027-Q1")).toEqual({ from: "2027-01-01", to: "2027-03-31" });
    expect(() => quarterRange("2026-Q5")).toThrow();
  });
});

describe("report prompts", () => {
  it("both carry WARM_TONE", () => {
    expect(REPORT_ANALYZE_PROMPT).toContain(WARM_TONE);
    const ctx = { profile: defaultLearnerProfile() } as never;
    for (const req of [reportAnalyze.build({ material: "M", level: "B1" }, ctx), reportReview.build({ material: "M", span: "這個月", level: "B1" }, ctx)]) {
      expect(JSON.stringify(req)).toContain("學習夥伴");
      expect(JSON.stringify(req)).toContain(WARM_TONE.split("\n")[0]);
    }
    expect(reportAnalyze.tier).toBe("smart");
    expect(reportAnalyze.maxTokens).toBe(8192);
    expect(reportReview.maxTokens).toBe(8192);
  });
});

describe("collectAnalysisMaterial: tier distribution (第二十三波 R7)", () => {
  const z = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, "?": 0 };
  const tiers = {
    profile: { asked: { ...z, A2: 3, B1: 4 }, looked: { ...z, B1: 2, "?": 1 }, saved: z, mature: { ...z, A2: 5 }, unknownWords: ["pug"] },
    examples: { A1: [], A2: ["basket", "battery"], B1: ["anxiety"], B2: [], C1: [], C2: [] },
  };

  it("adds a section with the counts per level and example words", () => {
    const m = collectAnalysisMaterial({ ...base, tiers });
    expect(m.text).toContain("## 你查／問的字的程度分布");
    expect(m.text).toContain("- 查／問的字（10 字）：A2 3、B1 6、不明 1");
    expect(m.text).toContain("- 熟練的字（5 字）：A2 5");
    expect(m.text).toContain("- A2 例字：basket、battery");
    expect(m.text).toContain("- B1 例字：anxiety");
    expect(m.text).not.toContain("B2 例字");
  });

  it("leaves it out with no tiers or no words", () => {
    expect(collectAnalysisMaterial({ ...base }).text).not.toContain("程度分布");
    const empty = { ...tiers, profile: { ...tiers.profile, asked: z, looked: z, mature: z } };
    expect(collectAnalysisMaterial({ ...base, tiers: empty }).text).not.toContain("程度分布");
  });
});
