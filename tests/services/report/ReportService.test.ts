import { describe, expect, it } from "vitest";
import { localDayOf } from "../../../src/core/learner/reading";
import type { AskEvent, WordTouch } from "../../../src/core/model/learner";
import { ReportService, type ReportServiceDeps } from "../../../src/services/report/ReportService";
import { FakeLearnAi, result } from "../learn/fakes";

const NOW = new Date(2026, 9, 26, 9, 0, 0); // Monday 2026-10-26 → last week is 2026-W43 (10-19..10-25)
const FOLDER = "vocab-list/Report";

const ADVICE_JSON = JSON.stringify({
  letter: "這週你很穩。",
  axes: [
    { name: "文法", value: 0.4, clear: true, hint: "" },
    { name: "聽力", value: 0, clear: false, hint: "聽一段慢速的 TED" },
    { name: "單字", value: 0.6, clear: true, hint: "" },
  ],
  levels: [{ area: "字彙量", level: "約 B1", detail: "估 2,000–2,500 字", basis: "自述 B1" }],
  focus: ["多練習現在完成式", "把查過的字再複習一次"],
  tryNext: ["聽一段 TED 看看聽力"],
  reading: ["TED 教育類，搜尋：TED-Ed"],
});

function ask(id: string, day: string, taskId = "paragraph.translate"): AskEvent {
  return { id, at: new Date(`${day}T12:00:00`).toISOString(), surface: "paragraph", taskId, custom: false, ok: true };
}
function touch(day: string, word: string): WordTouch {
  return { id: `${day}|${word}`, day, word, lookup: 1, pronounce: 0, saved: false, updatedAt: "" };
}

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

function setup(opts: { wordCefr?: Map<string, "A1" | "A2" | "B1" | "B2" | "C1" | "C2">; saved?: { word: string; level: string }[][]; reading?: never[]; asks?: AskEvent[]; touches?: WordTouch[]; aiReady?: boolean; enabled?: boolean; reply?: string; failAi?: boolean } = {}) {
  const extra = opts.wordCefr ?? new Map<string, "A1" | "A2" | "B1" | "B2" | "C1" | "C2">();
  const vault = new FakeVault();
  const asks = opts.asks ?? [];
  const touches = opts.touches ?? [];
  const ai = new FakeLearnAi(() => {
    if (opts.failAi) throw new Error("boom");
    return result(opts.reply ?? ADVICE_JSON);
  });
  const model: ReportServiceDeps["model"] = {
    activity: (from, to) => ({
      asks: asks.filter((a) => {
        const d = localDayOf(new Date(a.at));
        return d >= from && d <= to;
      }),
      wordTouches: touches.filter((t) => t.day >= from && t.day <= to),
      reading: (opts.reading ?? []).filter((r: { day: string }) => r.day >= from && r.day <= to),
      events: [],
      reviews: [],
    }),
    snapshot: () => ({ grammar: { started: 0, mastered: 2, due: 0 }, vocab: { total: 0, learning: 0, mature: 5, due: 0 } }) as never,
    level: () => "B1",
    wordCefr: () => extra,
  };
  const svc = new ReportService({
    model,
    setWordCefr: (entries) => {
      opts.saved?.push(entries);
      for (const e of entries) extra.set(e.word, e.level as "C1");
    },
    vocab: { entries: [] },
    vault,
    folder: () => FOLDER,
    enabled: () => opts.enabled ?? true,
    ai,
    aiReady: () => opts.aiReady ?? true,
    now: () => NOW,
  });
  return { svc, vault, ai };
}

const PATH = `${FOLDER}/vocab-report-2026-W43.md`;
const busyWeek = [ask("a1", "2026-10-20"), ask("a2", "2026-10-21", "paragraph.grammar")];

describe("ReportService.write", () => {
  it("writes last week's report with frontmatter, numbers and AI advice", async () => {
    const { svc, vault } = setup({ asks: busyWeek });
    expect(await svc.maybeWriteLastWeek()).toBe("written");
    const text = vault.files.get(PATH) as string;
    expect(text).toContain("vocab-tracker: report");
    expect(text).toContain("vocab-tracker-id: report-2026-W43");
    expect(text).toContain("period: 2026-10-20~2026-10-25");
    expect(text).toContain("verdict: ");
    expect(text).toContain("# 到目前為止的你 · 2026-W43"); // first report
    expect(text).toContain("> [!note]- 數字明細");
    expect(text).toContain("AI 討論");
    expect(text).toContain("翻譯：1");
    expect(text).toContain("> #### 程度建議");
    expect(text).toContain("> #### 照你的程度可以加強");
    expect(text).toContain("- 多練習現在完成式");
    expect(text).toContain("這週你很穩。");
    expect(text).toContain("- [ ] 聽一段 TED 看看聽力");
    expect(text).toContain("| 字彙量 | 約 B1（估 2,000–2,500 字） | 自述 B1 |");
    expect(text).toContain('"name":"聽力","value":0,"clear":false');
    expect(text).not.toContain("### 查字");
    expect(text).not.toContain("### 單字複習");
  });

  it("uses the earliest record as the start of the first report", async () => {
    const { svc, vault } = setup({ asks: [ask("old", "2026-09-01"), ...busyWeek] });
    await svc.write("2026-W43");
    expect(vault.files.get(PATH)).toContain("period: 2026-09-01~2026-10-25");
  });

  it("is a normal weekly report once an earlier one exists", async () => {
    const { svc, vault } = setup({ asks: [ask("old", "2026-09-01"), ...busyWeek] });
    vault.files.set(`${FOLDER}/vocab-report-2026-W42.md`, "x");
    await svc.write("2026-W43");
    const text = vault.files.get(PATH) as string;
    expect(text).toContain("period: 2026-10-19~2026-10-25");
    expect(text).toContain("# 這週的你 · 2026-W43");
  });

  it("skips an existing report, unless overwrite", async () => {
    const { svc, vault } = setup({ asks: busyWeek });
    vault.files.set(PATH, "old");
    expect(await svc.write("2026-W43")).toBe("exists");
    expect(vault.files.get(PATH)).toBe("old");
    expect(await svc.write("2026-W43", { overwrite: true })).toBe("written");
    expect(vault.files.get(PATH)).toContain("vocab-tracker: report");
  });

  it("returns empty when the week had no activity", async () => {
    const { svc, vault } = setup({ asks: [ask("x", "2026-10-10")] });
    vault.files.set(`${FOLDER}/vocab-report-2026-W42.md`, "x"); // not the first report
    expect(await svc.maybeWriteLastWeek()).toBe("empty");
    expect(vault.files.size).toBe(1);
  });

  it("still writes without AI and says why", async () => {
    const { svc, vault, ai } = setup({ asks: busyWeek, aiReady: false });
    expect(await svc.write("2026-W43")).toBe("written");
    expect(ai.requests).toHaveLength(0);
    const text = vault.files.get(PATH) as string;
    expect(text).toContain("AI 沒有開啟，這段略過");
    // the rule-based levels stand in, every row marked 粗估
    expect(text).toContain("| 字彙量 | 約 B1（估 2,000–2,500 字）（粗估） |");
    expect(text).toContain("vocab-report-radar");
  });

  it("notes an AI failure but still writes", async () => {
    const { svc, vault } = setup({ asks: busyWeek, failAi: true });
    expect(await svc.write("2026-W43")).toBe("written");
    expect(vault.files.get(PATH)).toContain("AI 這次沒寫成功");
    expect(svc.status()).toBe("idle");
  });

  it("sends the baselines and reading titles (no paths) to the AI", async () => {
    const reading = [
      { id: "1", day: "2026-10-01", at: "", updatedAt: "", path: "SECRET/path.md", title: "TED talk on sleep", kinds: ["word"] },
      { id: "2", day: "2026-08-01", at: "", updatedAt: "", path: "old.md", title: "Too old", kinds: ["word"] },
    ];
    const { svc, ai, vault } = setup({ asks: busyWeek, reading: reading as never });
    vault.files.set(`${FOLDER}/vocab-report-2026-W42.md`, "x"); // not the first report
    await svc.write("2026-W43");
    const sent = JSON.stringify(ai.requests[0]);
    expect(sent).toContain("TED talk on sleep");
    expect(sent).not.toContain("Too old");
    expect(sent).not.toContain("SECRET");
    expect(sent).toContain("活躍度基準");
    expect(sent).toContain("程度粗估");
  });

  it("sends only the numbers digest to the AI", async () => {
    const { svc, ai } = setup({ asks: busyWeek, touches: [touch("2026-10-20", "ephemeral")] });
    await svc.write("2026-W43");
    const sent = JSON.stringify(ai.requests[0]);
    expect(sent).toContain("查字 1 次");
    expect(sent).toContain("學習數據");
  });

  it("returns busy for a concurrent write of the same key", async () => {
    const { svc } = setup({ asks: busyWeek });
    const [a, b] = await Promise.all([svc.write("2026-W43"), svc.write("2026-W43")]);
    expect([a, b].sort()).toEqual(["busy", "written"]);
  });
});

describe("ReportService status and latest", () => {
  it("maybeWriteLastWeek is off when disabled", async () => {
    const { svc, vault } = setup({ asks: busyWeek, enabled: false });
    expect(await svc.maybeWriteLastWeek()).toBe("off");
    expect(svc.status()).toBe("off");
    expect(vault.files.size).toBe(0);
  });

  it("notifies listeners while writing", async () => {
    const { svc } = setup({ asks: busyWeek });
    const seen: string[] = [];
    svc.onChange(() => seen.push(svc.status()));
    await svc.write("2026-W43");
    expect(seen).toEqual(["writing", "idle"]);
  });

  it("latest picks the newest key and reads the frontmatter", async () => {
    const { svc, vault } = setup();
    expect(await svc.latest()).toBeNull();
    vault.files.set(`${FOLDER}/vocab-report-2026-W41.md`, "verdict: down\n");
    vault.files.set(`${FOLDER}/vocab-report-2026-W43.md`, "verdict: up\nsuggested-level: B2\n");
    vault.files.set(`${FOLDER}/other.md`, "x");
    const l = await svc.latest();
    expect(l).toMatchObject({ key: "2026-W43", path: `${FOLDER}/vocab-report-2026-W43.md`, verdict: "up", suggestedLevel: "B2" });
    expect(l?.headline).toBe("可以往上一級試試（建議 B2）");
  });
});

describe("ReportService: word levels (第二十三波 R7)", () => {
  const WORDS = ["walk", "book", "blue", "basket", "anxiety", "apology", "arena", "arrogant", "ubiquitous", "pug"];
  const touches = WORDS.map((w) => touch("2026-10-21", w));
  const reply = (extra: object = {}) => JSON.stringify({ ...JSON.parse(ADVICE_JSON), ...extra });

  it("sends the unknown words and the tier summary to the AI", async () => {
    const { svc, ai } = setup({ asks: busyWeek, touches });
    await svc.write("2026-W43");
    const sent = JSON.stringify(ai.requests[0]);
    expect(sent).toContain("ubiquitous、pug");
    expect(sent).toContain("字的階層分布");
    expect(sent).not.toContain("walk、"); // known words are not asked about
  });

  it("stores the AI's levels (only for words asked about) and counts them in the same report", async () => {
    const saved: { word: string; level: string }[][] = [];
    const { svc, vault } = setup({
      asks: busyWeek,
      touches,
      saved,
      reply: reply({ wordLevels: [{ word: "ubiquitous", level: "C1" }, { word: "pug", level: "B2" }, { word: "walk", level: "C2" }] }),
    });
    await svc.write("2026-W43");
    expect(saved).toEqual([[{ word: "ubiquitous", level: "C1" }, { word: "pug", level: "B2" }]]);
    const text = vault.files.get(PATH) as string;
    const block = /vocab-report-tiers\n> (\{.*\})/.exec(text);
    expect(block).not.toBeNull();
    const asked = JSON.parse((block as RegExpExecArray)[1]).asked;
    // before the AI answered "?" was 2; afterwards the two words sit at C1 and B2
    expect(asked).toMatchObject({ A1: 3, A2: 1, B1: 2, B2: 3, C1: 1, "?": 0 });
  });

  it("without AI nothing is stored and unknown words stay as ?", async () => {
    const saved: { word: string; level: string }[][] = [];
    const { svc, vault } = setup({ asks: busyWeek, touches, saved, aiReady: false });
    await svc.write("2026-W43");
    expect(saved).toEqual([]);
    expect(vault.files.get(PATH)).toContain('"?":2');
    // 8 leveled words → judged by the tiers, not marked 粗估
    expect(vault.files.get(PATH)).toContain("| 字彙量 | 約 A1（估 500–700 字） | 你查／問的字：A1 38%");
  });

  it("words tagged earlier are not sent again", async () => {
    const { svc, ai } = setup({ asks: busyWeek, touches, wordCefr: new Map([["ubiquitous", "C1" as const]]) });
    await svc.write("2026-W43");
    const sent = JSON.stringify(ai.requests[0]);
    expect(sent).toContain("pug");
    expect(sent).not.toContain("ubiquitous、");
  });
});
