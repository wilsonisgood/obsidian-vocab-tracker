import { describe, expect, it } from "vitest";
import { buildReport, type ReportInput } from "../../../src/core/learner/report";
import type { ReportAdvice } from "../../../src/core/learner/reportAdvice";
import { removeFrontmatterField, renderReportFile, reportDigest, setFrontmatterField, verdictHeadline } from "../../../src/core/learner/reportMarkdown";

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

const ADVICE: ReportAdvice = {
  letter: "這週你很穩。\n下週試試長句。",
  axes: [
    { name: "文法", value: 0.8, clear: true },
    { name: "聽力", value: 0, clear: false, hint: "聽一段慢速 TED" },
    { name: "單字", value: 0.5, clear: true },
  ],
  levels: [
    { area: "字彙量", level: "約 B1", detail: "估 2,000–2,500 字", basis: "自述 B1 | 熟練 5 字" },
    { area: "長句理解", level: "還看不出來", basis: "這週的紀錄還不夠" },
  ],
  focus: ["現在完成式：have + p.p.", "長句先找主要動詞"],
  tryNext: ["讀一篇 TED 講稿", "做 10 題文法"],
  reading: ["TED 教育類，搜尋：TED-Ed"],
};

describe("renderReportFile", () => {
  const text = renderReportFile(data, { key: "2026-W43", advice: ADVICE });
  const lines = text.split("\n");

  it("renders frontmatter, a letter title and the grey period", () => {
    expect(text.startsWith("---\nvocab-tracker: report\nvocab-tracker-id: report-2026-W43\nperiod: 2026-10-19~2026-10-25\nverdict: insufficient\n---")).toBe(true);
    expect(text).not.toContain("suggested-level");
    expect(text).toContain("\n# 這週的你 · 2026-W43\n");
    expect(text).toContain('<span style="color: gray">2026-10-19 ～ 2026-10-25</span>');
    expect(renderReportFile(data, { key: "2026-W43", first: true })).toContain("# 到目前為止的你 · 2026-W43");
  });

  it("puts the letter between the title and the first callout", () => {
    const i = text.indexOf("這週你很穩。");
    expect(i).toBeGreaterThan(text.indexOf("# 這週的你"));
    expect(i).toBeLessThan(text.indexOf("> [!abstract]+ 現在的程度"));
  });

  it("builds three callouts with the right folds and every line quoted", () => {
    const abs = text.indexOf("> [!abstract]+ 現在的程度");
    const tip = text.indexOf("> [!tip]+ 接下來的建議");
    const note = text.indexOf("> [!note]- 數字明細");
    expect(abs).toBeGreaterThan(0);
    expect(tip).toBeGreaterThan(abs);
    expect(note).toBeGreaterThan(tip);
    // from the first callout to the analyze button, only blank separators are unquoted
    const from = lines.findIndex((l) => l.startsWith("> [!abstract]"));
    const to = lines.findIndex((l) => l.startsWith("```vocab-report-analyze"));
    let inCallout = false;
    for (const l of lines.slice(from, to)) {
      if (l.startsWith(">")) inCallout = true;
      else if (l === "") inCallout = false;
      else expect(inCallout, `unquoted line inside a callout: ${l}`).toBe(false);
    }
    expect(lines).toContain("> ```vocab-report-radar");
    expect(lines).toContain(">");
  });

  it("embeds the radar JSON, level table, advice, checklist and reading", () => {
    const json = lines.find((l) => l.startsWith('> {"axes"')) as string;
    const parsed = JSON.parse(json.slice(2));
    expect(parsed.axes).toHaveLength(3);
    expect(parsed.axes[1]).toEqual({ name: "聽力", value: 0, clear: false, hint: "聽一段慢速 TED" });
    expect(text).toContain("> | 面向 | 程度 | 依據 |");
    expect(text).toContain("> | 字彙量 | 約 B1（估 2,000–2,500 字） | 自述 B1 ／ 熟練 5 字 |");
    expect(text).toContain("> | 長句理解 | 還看不出來 | 這週的紀錄還不夠 |");
    expect(text).toContain("> #### 程度建議");
    expect(text).toContain("> **資料不夠，下期再看**");
    expect(text).toContain("> #### 照你的程度可以加強");
    expect(text).toContain("> - 現在完成式：have + p.p.");
    expect(text).toContain("> #### 下週一起試試");
    expect(text).toContain("> - [ ] 讀一篇 TED 講稿");
    expect(text).toContain("> #### 適合你的閱讀");
    expect(text).toContain("> - TED 教育類，搜尋：TED-Ed");
    expect(text).not.toContain("詳細分析 ·"); // only after an analysis
  });

  it("keeps the numbers in the collapsed callout, with task names and ▲", () => {
    const note = text.slice(text.indexOf("> [!note]- 數字明細"));
    expect(note).toContain("> - 文法解析：1");
    expect(note).toContain("> - 小知識：1");
    expect(note).toContain("> - mystery.task：1");
    expect(note).toContain("▲2");
    expect(text).not.toContain("## 這週的數字");
  });

  it("ends with the analyze button block", () => {
    expect(text.trimEnd().endsWith("```vocab-report-analyze\nkey: 2026-W43\n```")).toBe(true);
  });

  it("without AI: a grey note, rule-based rows marked 粗估, no checklist or reading", () => {
    const t = renderReportFile(data, { key: "2026-W43", aiNote: "AI 沒有開啟，這段略過" });
    expect(t).toContain("AI 沒有開啟，這段略過");
    expect(t).toContain("（粗估）");
    expect(t).toContain("vocab-report-radar");
    expect(t).not.toContain("- [ ]");
    expect(t).not.toContain("#### 適合你的閱讀");
    expect(t).toContain("> #### 照你的程度可以加強");
  });

  it("an empty numbers section still renders its callout", () => {
    const empty = buildReport({ ...input, asks: [], reading: [] }, { from: "2026-10-19", to: "2026-10-25" });
    expect(renderReportFile(empty, { key: "2026-W43" })).toContain("> [!note]- 數字明細");
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

describe("frontmatter fields", () => {
  it("sets and removes a field", () => {
    const t = "---\na: 1\nb: 2\n---\n\nbody";
    expect(setFrontmatterField(t, "c", "3")).toContain("b: 2\nc: 3\n---");
    expect(removeFrontmatterField(t, "a")).toBe("---\nb: 2\n---\n\nbody");
    expect(removeFrontmatterField(t, "zzz")).toBe(t);
  });
});

describe("renderReportFile: vocab-report-tiers block (第二十三波 R7)", () => {
  const z = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, "?": 0 };
  const withTiers = { ...data, tiers: { asked: { ...z, B1: 2 }, looked: { ...z, B1: 1, B2: 1 }, saved: z, mature: { ...z, A2: 3 }, unknownWords: [] } };

  it("puts the block inside the 現在的程度 callout, right under the level table", () => {
    const text = renderReportFile(withTiers, { key: "2026-W43", advice: ADVICE });
    const lines = text.split("\n");
    const i = lines.indexOf("> ```vocab-report-tiers");
    expect(i).toBeGreaterThan(0);
    expect(lines[i + 1]).toBe('> {"asked":{"A1":0,"A2":0,"B1":3,"B2":1,"C1":0,"C2":0,"?":0},"mature":{"A1":0,"A2":3,"B1":0,"B2":0,"C1":0,"C2":0,"?":0}}');
    expect(lines[i + 2]).toBe("> ```");
    expect(lines.findIndex((l) => l.startsWith("> | 字彙量"))).toBeLessThan(i);
    expect(i).toBeLessThan(lines.indexOf("> #### 程度建議"));
  });

  it("no block without tiers or without any words", () => {
    expect(renderReportFile(data, { key: "2026-W43", advice: ADVICE })).not.toContain("vocab-report-tiers");
    expect(renderReportFile({ ...data, tiers: { ...withTiers.tiers, asked: z, looked: z, mature: z } }, { key: "2026-W43" })).not.toContain("vocab-report-tiers");
  });
});
