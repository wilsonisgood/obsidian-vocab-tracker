import { describe, expect, it } from "vitest";
import { baselineLevels } from "../../../../src/core/learner/levelEstimate";
import type { RadarAxis } from "../../../../src/core/learner/radar";
import { defaultLearnerProfile } from "../../../../src/core/model/settings";
import { defaultTaskRegistry } from "../../../../src/services/ai/tasks/registry";
import { isEmptyAdvice, parseReportAdvice, reportAdvise, resolveAdvice } from "../../../../src/services/ai/tasks/report";
import { parseReportAnalysis, reportAnalyze } from "../../../../src/services/ai/tasks/reportAnalyze";
import { buildReport } from "../../../../src/core/learner/report";

const base: RadarAxis[] = [
  { name: "文法", value: 0.2, clear: false, hint: "做題" },
  { name: "單字", value: 0.5, clear: true },
  { name: "閱讀", value: 0.1, clear: false, hint: "讀文章" },
  { name: "寫作", value: 0, clear: false, hint: "造句" },
];
const data = buildReport({ level: "B1", asks: [], wordTouches: [], reading: [], events: [], reviews: [], vocab: [], grammarMastered: 0 }, { from: "2026-10-19", to: "2026-10-25" });
const levels = baselineLevels(data, "B1", 12);

describe("report.advise", () => {
  const input = { digest: "活躍 3 天", level: "B1" as const, baseline: base, baselineLevels: levels, readingTitles: ["TED talk on sleep", "Coral Reefs"] };

  it("is a smart structured report task, version 4, with the warm tone", () => {
    expect(reportAdvise.id).toBe("report.advise");
    expect(reportAdvise.version).toBe(4);
    expect(reportAdvise.surface).toBe("report");
    expect(defaultTaskRegistry().get("report.advise")).toBe(reportAdvise);
    const req = reportAdvise.build(input, { profile: defaultLearnerProfile(), history: [] });
    expect(req.tier).toBe("smart");
    expect(req.output?.name).toBe("report_advice");
    expect(JSON.stringify(req.system)).toContain("語氣");
  });

  it("sends digest, level, baselines and reading titles (titles only)", () => {
    const req = reportAdvise.build(input, { profile: defaultLearnerProfile(), history: [] });
    const user = req.messages.at(-1)?.content ?? "";
    for (const s of ["活躍 3 天", "B1", "文法：活躍度 0.20，紀錄不夠", "單字：活躍度 0.50，有足夠紀錄", "字彙量：約 B1（估 2,000–2,500 字）", "TED talk on sleep", "Coral Reefs"]) {
      expect(user).toContain(s);
    }
    const none = reportAdvise.build({ ...input, readingTitles: [] }, { profile: defaultLearnerProfile(), history: [] });
    expect(none.messages.at(-1)?.content).toContain("沒有閱讀紀錄");
  });

  it("the prompt forbids naming specific articles", () => {
    const sys = JSON.stringify(reportAdvise.build(input, { profile: defaultLearnerProfile(), history: [] }).system);
    expect(sys).toContain("不要點名具體的文章");
  });
});

describe("parseReportAdvice", () => {
  const good = {
    letter: " 嗨，這週不錯。 ",
    axes: [
      { name: "文法", value: 0.8, clear: true, hint: "" },
      { name: "聽力", value: 0, clear: false, hint: "聽 TED" },
      { name: "單字", value: 0.4, clear: true, hint: "" },
      { name: "閱讀", value: 0.6, clear: true, hint: "" },
    ],
    levels: [{ area: "字彙量", level: "約 B1", detail: "估 2,000–2,500 字", basis: "自述 B1" }],
    focus: ["a", "b"],
    tryNext: ["c"],
    reading: ["d"],
  };

  it("reads a normal answer", () => {
    const a = parseReportAdvice(good);
    expect(a.letter).toBe("嗨，這週不錯。");
    expect(a.axes).toHaveLength(4);
    expect(a.axes[0]).toEqual({ name: "文法", value: 0.8, clear: true });
    expect(a.axes[1]).toEqual({ name: "聽力", value: 0, clear: false, hint: "聽 TED" });
    expect(a.levels[0]).toEqual({ area: "字彙量", level: "約 B1", detail: "估 2,000–2,500 字", basis: "自述 B1" });
    expect(a.focus).toEqual(["a", "b"]);
    expect(isEmptyAdvice(a)).toBe(false);
  });

  it("wordLevels: keeps valid levels, lowercases words, drops junk", () => {
    const a = parseReportAdvice({
      letter: "x",
      wordLevels: [{ word: "Ubiquitous", level: "c1" }, { word: "foo", level: "Z9" }, { word: "", level: "A1" }, "junk", { word: "pug", level: "B2" }],
    });
    expect(a.wordLevels).toEqual([{ word: "ubiquitous", level: "C1" }, { word: "pug", level: "B2" }]);
    expect(parseReportAdvice({ letter: "x", wordLevels: "nope" }).wordLevels).toEqual([]);
  });

  it("sends the tier summary and the unknown words, and asks for wordLevels", () => {
    const input = { digest: "d", level: "B1" as const, baseline: base, baselineLevels: levels, readingTitles: [] };
    const req = reportAdvise.build({ ...input, tierSummary: "- 查／問的字（9 字）：B1 9", unknownWords: ["ubiquitous", "pug"] }, { profile: defaultLearnerProfile(), history: [] });
    const text = JSON.stringify(req);
    expect(text).toContain("字的階層分布");
    expect(text).toContain("ubiquitous、pug");
    expect(text).toContain("wordLevels");
  });

  it("missing fields become empty", () => {
    const a = parseReportAdvice({ letter: "hi" });
    expect(a).toEqual({ letter: "hi", axes: [], levels: [], focus: [], tryNext: [], reading: [], wordLevels: [] });
    expect(parseReportAdvice(null).letter).toBe("");
    expect(isEmptyAdvice(parseReportAdvice("junk"))).toBe(true);
  });

  it("clamps value to 0–1, drops nameless axes and level rows without a level", () => {
    const a = parseReportAdvice({
      axes: [
        { name: "a", value: 3, clear: true },
        { name: "b", value: -2, clear: true },
        { name: "", value: 0.5 },
        { name: "c", value: "nope" },
      ],
      levels: [{ area: "x", level: "" }, { area: "y", level: "還看不出來", basis: "沒資料" }],
    });
    expect(a.axes.map((x) => [x.name, x.value])).toEqual([["a", 1], ["b", 0], ["c", 0]]);
    expect(a.levels).toEqual([{ area: "y", level: "還看不出來", basis: "沒資料" }]);
  });

  it("caps the lists", () => {
    const a = parseReportAdvice({ axes: Array.from({ length: 12 }, (_, i) => ({ name: `a${i}`, value: 0.5, clear: true })), focus: Array(10).fill("x"), tryNext: Array(9).fill("x"), reading: Array(5).fill("x") });
    expect(a.axes).toHaveLength(7);
    expect(a.focus).toHaveLength(6);
    expect(a.tryNext).toHaveLength(5);
    expect(a.reading).toHaveLength(3);
  });

  it("the task parses from r.json or from text", () => {
    const r = { text: "", json: good, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: "m", stop: "end" } as never;
    expect(reportAdvise.parse?.(r)?.letter).toBe("嗨，這週不錯。");
    const t = { text: JSON.stringify(good), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: "m", stop: "end" } as never;
    expect(reportAdvise.parse?.(t)?.focus).toEqual(["a", "b"]);
  });
});

describe("resolveAdvice", () => {
  it("falls back to the baselines when axes < 3 or levels are missing", () => {
    const draft = parseReportAdvice({ letter: "hi", axes: [{ name: "a", value: 1, clear: true }, { name: "b", value: 1, clear: true }], focus: ["x"] });
    const r = resolveAdvice(draft, base, levels);
    expect(r.axes).toBe(base);
    expect(r.levels).toBe(levels);
    expect(r.letter).toBe("hi");
  });
  it("keeps the AI's own when it gave enough", () => {
    const draft = parseReportAdvice({
      axes: [{ name: "a", value: 1, clear: true }, { name: "b", value: 1, clear: true }, { name: "c", value: 1, clear: true }],
      levels: [{ area: "x", level: "約 B2", basis: "y" }],
    });
    const r = resolveAdvice(draft, base, levels);
    expect(r.axes).toHaveLength(3);
    expect(r.levels).toHaveLength(1);
  });
});

describe("report.analyze", () => {
  it("is a structured task with now / next", () => {
    expect(reportAnalyze.version).toBe(2);
    expect(parseReportAnalysis({ now: "```md\nA\n```", next: " B " })).toEqual({ now: "A", next: "B" });
    expect(() => parseReportAnalysis({})).toThrow();
    expect(reportAnalyze.build({ material: "M", level: "B1" }, { profile: defaultLearnerProfile(), history: [] }).output?.name).toBe("report_analysis");
  });
});
