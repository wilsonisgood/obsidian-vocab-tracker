import { describe, expect, it } from "vitest";
import type { LearnEvent, ReadingVisit } from "../../../src/core/model/learner";
import { DiaryService, dayOfStamp, type DiaryServiceDeps } from "../../../src/services/diary/DiaryService";
import { entry, FakeLearnAi, result } from "../learn/fakes";

const NOW = new Date(2026, 9, 16, 9, 0, 0); // local 2026-10-16
const YESTERDAY = "2026-10-15";

function visit(day: string, path: string, title: string, heading?: string): ReadingVisit {
  return { id: `${day}|${path}|${heading ?? ""}`, day, at: "", updatedAt: "", path, title, heading, kinds: ["word"] };
}
function ev(id: string, at: string, focus: string, res: LearnEvent["result"]): LearnEvent {
  return { id, at, track: "grammar", focus: { kind: "grammar-objective", id: focus }, result: res };
}

class FakeVault {
  files = new Map<string, string>();
  exists = (p: string) => this.files.has(p);
  create = async (p: string, c: string) => void this.files.set(p, c);
  process = async (p: string, fn: (t: string) => string) => void this.files.set(p, fn(this.files.get(p) ?? ""));
  read = async (p: string) => this.files.get(p) ?? null;
  list = (f: string) => [...this.files.keys()].filter((p) => p.startsWith(`${f}/`));
  frontmatterOf = (p: string) => {
    const t = this.files.get(p);
    if (!t) return undefined;
    const kind = /diary-kind: (\w+)/.exec(t)?.[1];
    const srcs = [...t.matchAll(/^ {2}- "(.*)"$/gm)].map((m) => m[1]);
    return { "diary-kind": kind, "diary-sources": srcs };
  };
}

function setup(opts: {
  visits?: ReadingVisit[];
  events?: LearnEvent[];
  entries?: ReturnType<typeof entry>[];
  replies?: string[];
  random?: number;
  aiReady?: boolean;
  settings?: Partial<DiaryServiceDeps["settings"] extends () => infer S ? S : never>;
} = {}) {
  const vault = new FakeVault();
  const picks: { kind: string; key: string; day: string }[] = [];
  const replies = [...(opts.replies ?? ["PICK: -\n\nA nice day. I met **apron**."])];
  const ai = new FakeLearnAi(() => result(replies.length > 1 ? (replies.shift() as string) : replies[0]));
  const svc = new DiaryService({
    ai,
    aiReady: () => opts.aiReady ?? true,
    learner: {
      readingOn: (d) => (opts.visits ?? []).filter((v) => v.day === d),
      learnEvents: () => opts.events ?? [],
      diaryPicks: () => [],
      recordDiaryPick: (p) => void picks.push(p),
    },
    vocab: { entries: opts.entries ?? [] },
    learn: { trivia: () => [] },
    vault,
    folder: () => "vocab-list/日記",
    level: () => "B1",
    settings: () => ({ enabled: true, specialEvery: 5, ...opts.settings }),
    labels: () => ({ subtitleFrom: "", disclaimer: "AI may be wrong." }),
    now: () => NOW,
    random: () => opts.random ?? 0.99,
  });
  return { svc, vault, picks, ai };
}

const added = (word: string, day: string) => entry(`id-${word}`, word, { added: `${day} 10:00:00` });

describe("dayOfStamp", () => {
  it("reads local stamps and ISO strings", () => {
    expect(dayOfStamp("2026-10-15 23:59:00")).toBe("2026-10-15");
    expect(dayOfStamp("")).toBe("");
  });
});

describe("DiaryService.collectMaterial", () => {
  it("groups visits by path and de-dups headings", () => {
    const { svc } = setup({
      visits: [visit(YESTERDAY, "a.md", "A", "Intro"), visit(YESTERDAY, "a.md", "A", "Intro"), visit(YESTERDAY, "a.md", "A", "Part 2"), visit(YESTERDAY, "b.md", "B")],
    });
    const m = svc.collectMaterial(YESTERDAY);
    expect(m.articles).toEqual([
      { path: "a.md", title: "A", headings: ["Intro", "Part 2"] },
      { path: "b.md", title: "B", headings: [] },
    ]);
  });

  it("puts wrong grammar answers first", () => {
    const { svc } = setup({
      entries: [added("apron", YESTERDAY)],
      events: [ev("1", `${YESTERDAY}T09:00:00`, "t/ok", "correct"), ev("2", `${YESTERDAY}T09:01:00`, "t/bad-one", "wrong")],
    });
    const kinds = svc.collectMaterial(YESTERDAY).points.map((p) => p.kind);
    expect(kinds).toEqual(["grammar-wrong", "new-word", "grammar-right"]);
  });

  it("looks back up to 7 days for points, not further", () => {
    const near = setup({ entries: [added("apron", "2026-10-10")] }).svc.collectMaterial(YESTERDAY);
    expect(near.points.map((p) => p.label)).toEqual(["apron"]);
    expect(near.points[0].day).toBe("2026-10-10");
    const far = setup({ entries: [added("apron", "2026-10-07")] }).svc.collectMaterial(YESTERDAY);
    expect(far.points).toEqual([]);
  });

  it("counts a word reviewed that day, but not twice when it was added that day", () => {
    const { svc } = setup({
      entries: [entry("r", "glitter", { added: "2026-09-01 10:00:00", lastReviewed: `${YESTERDAY} 08:00:00` }), entry("n", "apron", { added: `${YESTERDAY} 07:00:00`, lastReviewed: `${YESTERDAY} 08:00:00` })],
    });
    const pts = svc.collectMaterial(YESTERDAY).points.map((p) => `${p.kind}:${p.label}`);
    expect(pts).toEqual(["new-word:apron", "review-word:glitter"]);
  });
});

describe("DiaryService.recent", () => {
  it("reads kind and sources of the latest three diaries before the day", async () => {
    const { svc, vault } = setup();
    const base = (k: string, s: string) => `---\ndiary-kind: ${k}\ndiary-sources:\n  - "${s}"\n---\n`;
    for (const [d, k] of [["2026-10-10", "diary"], ["2026-10-11", "quote"], ["2026-10-12", "place"], ["2026-10-13", "diary"]]) vault.files.set(`vocab-list/日記/${d}.md`, base(k, `s-${d}`));
    vault.files.set("vocab-list/日記/notes.md", "x");
    const r = svc.recent("2026-10-13");
    expect(r.map((x) => x.day)).toEqual(["2026-10-12", "2026-10-11", "2026-10-10"]);
    expect(r[0]).toEqual({ day: "2026-10-12", kind: "place", sources: ["s-2026-10-12"] });
  });
});

describe("DiaryService.write", () => {
  it("writes a plain diary with bold words and skips the pick", async () => {
    const { svc, vault, picks } = setup({ visits: [visit(YESTERDAY, "a.md", "Alpha"), visit(YESTERDAY, "b.md", "Beta")], entries: [added("apron", YESTERDAY)] });
    expect(await svc.write(YESTERDAY)).toBe("written");
    const text = vault.files.get(`vocab-list/日記/${YESTERDAY}.md`)!;
    expect(text).toContain("vocab-tracker: diary");
    expect(text).toContain("diary-kind: diary");
    expect(text).toContain("**apron**");
    expect(picks).toEqual([]);
  });

  it("skips when the file exists unless overwrite", async () => {
    const { svc, vault, ai } = setup();
    vault.files.set(`vocab-list/日記/${YESTERDAY}.md`, "old");
    expect(await svc.write(YESTERDAY)).toBe("exists");
    expect(ai.requests).toHaveLength(0);
    expect(await svc.write(YESTERDAY, { overwrite: true })).toBe("written");
    expect(vault.files.get(`vocab-list/日記/${YESTERDAY}.md`)).not.toBe("old");
  });

  it("writes a quote diary and records the pick", async () => {
    const { svc, vault, picks } = setup({ random: 0, replies: ["PICK: Maya Angelou | Nothing will work unless you do.\n\nI thought about it."] }); // no material → special
    expect(await svc.write(YESTERDAY)).toBe("written");
    const text = vault.files.get(`vocab-list/日記/${YESTERDAY}.md`)!;
    expect(text).toContain("diary-kind: quote");
    expect(text).toContain("Maya Angelou");
    expect(text).toContain("AI may be wrong.");
    expect(picks).toEqual([{ kind: "quote", key: "maya angelou|nothing will work unless you do", day: YESTERDAY }]);
  });

  it("records a place pick", async () => {
    const { svc, picks } = setup({ random: 0.9, replies: ["PICK: Santorini\n\nWhite walls."] });
    await svc.write(YESTERDAY);
    expect(picks).toEqual([{ kind: "place", key: "santorini", day: YESTERDAY }]);
  });

  it("retries a bad quote once, then falls back to a plain diary", async () => {
    const { svc, vault, ai, picks } = setup({ random: 0, replies: ["PICK: nonsense\n\nBody one.", "PICK: still nonsense\n\nBody two.", "PICK: -\n\nPlain body."] });
    // random 0 → quote; "nonsense" has no | so the quote is undefined
    expect(await svc.write(YESTERDAY)).toBe("written");
    expect(ai.requests).toHaveLength(3);
    const text = vault.files.get(`vocab-list/日記/${YESTERDAY}.md`)!;
    expect(text).toContain("diary-kind: diary");
    expect(text).toContain("Plain body.");
    expect(picks).toEqual([]);
  });

  it("stays quiet without AI", async () => {
    const { svc, vault } = setup({ aiReady: false });
    expect(await svc.write(YESTERDAY)).toBe("no-ai");
    expect(svc.status()).toBe("no-ai");
    expect(vault.files.size).toBe(0);
  });

  it("runs one write per day at a time", async () => {
    const { svc } = setup({ visits: [visit(YESTERDAY, "a.md", "A")], random: 0.99 });
    const [a, b] = await Promise.all([svc.write(YESTERDAY), svc.write(YESTERDAY)]);
    expect([a, b].sort()).toEqual(["busy", "written"]);
  });

  it("specialEvery 0 never switches on purpose", async () => {
    const { svc, vault } = setup({ visits: [visit(YESTERDAY, "a.md", "A"), visit(YESTERDAY, "b.md", "B")], random: 0, settings: { specialEvery: 0 } });
    await svc.write(YESTERDAY);
    expect(vault.files.get(`vocab-list/日記/${YESTERDAY}.md`)).toContain("diary-kind: diary");
  });
});

describe("DiaryService.maybeWriteYesterday", () => {
  it("writes yesterday once, skips if present, skips when off", async () => {
    const a = setup({ visits: [visit(YESTERDAY, "a.md", "A")] });
    expect(await a.svc.maybeWriteYesterday()).toBe("written");
    expect(a.vault.files.has(`vocab-list/日記/${YESTERDAY}.md`)).toBe(true);
    expect(await a.svc.maybeWriteYesterday()).toBe("exists");
    const off = setup({ settings: { enabled: false } });
    expect(await off.svc.maybeWriteYesterday()).toBe("off");
    expect(off.ai.requests).toHaveLength(0);
    expect(off.svc.status()).toBe("off");
  });
});
