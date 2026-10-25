import { describe, expect, it } from "vitest";
import { baselineLevels, UNKNOWN_LEVEL } from "../../../src/core/learner/levelEstimate";
import { baselineAxes, labelAnchor, parseRadarSource, radarLayout, radarPoint, type RadarAxis } from "../../../src/core/learner/radar";
import { buildReport, type ReportInput } from "../../../src/core/learner/report";
import { collectReadingTitles } from "../../../src/core/learner/reportAdvice";
import type { AskEvent, LearnEvent, ReadingVisit } from "../../../src/core/model/learner";

const P = { from: "2026-10-19", to: "2026-10-25" };
const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();
let n = 0;
const many = <T>(k: number, f: (i: number) => T): T[] => Array.from({ length: k }, (_, i) => f(i));
const ask = (taskId: string): AskEvent => ({ id: `a${n++}`, at: at("2026-10-20"), surface: "paragraph", taskId, custom: false, ok: true });
const ev = (track: LearnEvent["track"], result: LearnEvent["result"], topic = "articles-advanced"): LearnEvent => ({
  id: `e${n++}`,
  at: at("2026-10-20"),
  track,
  focus: { kind: "grammar-objective", id: `${topic}/x` },
  result,
});
function data(o: Partial<ReportInput> = {}) {
  return buildReport({ level: "B1", asks: [], wordTouches: [], reading: [], events: [], reviews: [], vocab: [], grammarMastered: 0, ...o }, P);
}
const axis = (d: ReturnType<typeof data>, name: string): RadarAxis => baselineAxes(d).find((a) => a.name === name) as RadarAxis;

describe("baselineAxes", () => {
  it("has the six areas, all unclear and empty with no records", () => {
    const axes = baselineAxes(data());
    expect(axes.map((a) => a.name)).toEqual(["文法", "單字", "閱讀", "多義字", "長句理解", "寫作"]);
    for (const a of axes) {
      expect(a.value).toBe(0);
      expect(a.clear).toBe(false);
      expect(a.hint).toBeTruthy();
    }
  });

  it("文法: clear at 10 grammar questions; discussions add to the value but not to clear", () => {
    expect(axis(data({ events: many(9, () => ev("grammar", "correct")), asks: many(5, () => ask("paragraph.grammar")) }), "文法").clear).toBe(false);
    const a = axis(data({ events: many(10, () => ev("grammar", "correct")), asks: many(5, () => ask("paragraph.grammar")) }), "文法");
    expect(a.clear).toBe(true);
    expect(a.hint).toBeUndefined();
    expect(a.value).toBeCloseTo(15 / 30);
  });

  it("單字: reviews + new saved; clear at 20 reviews", () => {
    const reviews = many(20, () => ({ id: `r${n++}`, entryId: "v", at: at("2026-10-20"), rating: 3 as const, mode: "manual" as const, elapsedMs: 1000 }));
    const a = axis(data({ reviews }), "單字");
    expect(a.clear).toBe(true);
    expect(a.value).toBeCloseTo(20 / 50);
    expect(axis(data({ reviews: reviews.slice(0, 19) }), "單字").clear).toBe(false);
  });

  it("閱讀: clear at 3 articles; 多義字: 10 poly questions", () => {
    const visit = (p: string): ReadingVisit => ({ id: p, day: "2026-10-20", at: at("2026-10-20"), updatedAt: at("2026-10-20"), path: p, title: p, kinds: ["word"] });
    expect(axis(data({ reading: [visit("a"), visit("b"), visit("c")] }), "閱讀").clear).toBe(true);
    expect(axis(data({ reading: [visit("a"), visit("b")] }), "閱讀").clear).toBe(false);
    expect(axis(data({ events: many(10, () => ev("poly", "correct")) }), "多義字").clear).toBe(true);
  });

  it("長句理解 (translate + grammar, clear at 5) and 寫作 (review + writing + sentence, clear at 3)", () => {
    expect(axis(data({ asks: [...many(3, () => ask("paragraph.translate")), ...many(2, () => ask("paragraph.grammar"))] }), "長句理解").clear).toBe(true);
    expect(axis(data({ asks: many(4, () => ask("paragraph.translate")) }), "長句理解").clear).toBe(false);
    const w = axis(data({ asks: [ask("buddy.review"), ask("buddy.writing"), ask("word.sentence")] }), "寫作");
    expect(w.clear).toBe(true);
    expect(w.value).toBeCloseTo(3 / 6);
  });

  it("caps the value at 1", () => {
    expect(axis(data({ events: many(80, () => ev("grammar", "correct")) }), "文法").value).toBe(1);
  });
});

describe("baselineLevels", () => {
  const row = (ls: ReturnType<typeof baselineLevels>, area: string) => ls.find((l) => l.area === area)!;

  it("marks every row 粗估", () => {
    for (const l of baselineLevels(data(), "B1", 40)) expect(l.rough).toBe(true);
  });

  it("字彙量 follows the self-reported level; none → 還看不出來", () => {
    const l = row(baselineLevels(data(), "B1", 40), "字彙量");
    expect(l.level).toBe("約 B1");
    expect(l.detail).toBe("估 2,000–2,500 字");
    expect(l.basis).toBe("以自述程度＋熟練 40 字粗估");
    expect(row(baselineLevels(data(), "C1"), "字彙量").detail).toBe("估 8,000–10,000 字");
    expect(row(baselineLevels(data(), ""), "字彙量").level).toBe(UNKNOWN_LEVEL);
  });

  it("文法: under 10 questions → 還看不出來", () => {
    const l = row(baselineLevels(data({ events: many(9, () => ev("grammar", "correct")) }), "B1"), "文法");
    expect(l.level).toBe(UNKNOWN_LEVEL);
    expect(l.basis).toContain("9 題");
  });

  it("文法: the highest band answered ≥ 70% decides", () => {
    // articles-advanced sits in band 4–6 → B1–B2
    const good = row(baselineLevels(data({ events: [...many(8, () => ev("grammar", "correct")), ...many(2, () => ev("grammar", "wrong"))] }), "B1"), "文法");
    expect(good.level).toBe("約 B1–B2");
    expect(good.basis).toContain("80%");
    const weak = row(baselineLevels(data({ events: [...many(4, () => ev("grammar", "correct")), ...many(6, () => ev("grammar", "wrong"))] }), "B1"), "文法");
    expect(weak.level).toBe("約 A1–A2 以下");
  });

  it("the other areas are 還看不出來 with the stock basis", () => {
    const ls = baselineLevels(data(), "B1");
    for (const a of ["多義字熟悉度", "長句理解", "寫作", "閱讀"]) {
      expect(row(ls, a)).toMatchObject({ level: UNKNOWN_LEVEL, basis: "這週的紀錄還不夠" });
    }
  });
});

describe("radar geometry", () => {
  const mk = (n: number): RadarAxis[] => many(n, (i) => ({ name: `a${i}`, value: 1, clear: i % 2 === 0 }));

  it("the first axis points straight up, then clockwise", () => {
    const top = radarPoint(0, 4, 100, 150, 150);
    expect(top.x).toBeCloseTo(150);
    expect(top.y).toBeCloseTo(50);
    const right = radarPoint(1, 4, 100, 150, 150);
    expect(right.x).toBeCloseTo(250);
    expect(right.y).toBeCloseTo(150);
  });

  it("6 axes: 6 vertices, 2 rings, anchors by side", () => {
    const L = radarLayout(mk(6));
    expect(L.vertices).toHaveLength(6);
    expect(L.spokes).toHaveLength(6);
    expect(L.rings).toHaveLength(2);
    expect(L.rings[0].split(" ")).toHaveLength(6);
    expect(L.labels.map((l) => l.anchor)).toEqual(["middle", "start", "start", "middle", "end", "end"]);
    expect(L.labels[0].y).toBeLessThan(L.cy - L.radius);
    expect(L.labels[3].y).toBeGreaterThan(L.cy + L.radius);
  });

  it("3 axes still draw", () => {
    const L = radarLayout(mk(3));
    expect(L.polygon.split(" ")).toHaveLength(3);
    expect(L.labels.map((l) => l.anchor)).toEqual(["middle", "start", "end"]);
  });

  it("unclear axes get a ？ label; vertices keep clear; value scales the radius", () => {
    const L = radarLayout([{ name: "x", value: 0.5, clear: true }, { name: "y", value: 0, clear: false }, { name: "z", value: 1, clear: false }]);
    expect(L.labels[1].text).toBe("y？");
    expect(L.labels[0].text).toBe("x");
    expect(L.vertices.map((v) => v.clear)).toEqual([true, false, false]);
    expect(L.cy - L.vertices[0].y).toBeCloseTo(L.radius / 2);
    expect(L.vertices[1].x).toBeCloseTo(L.cx);
  });

  it("labelAnchor", () => {
    expect(labelAnchor(0, 5)).toBe("middle");
  });
});

describe("parseRadarSource", () => {
  it("reads axes, clamps values, drops nameless ones", () => {
    const axes = parseRadarSource('{"axes":[{"name":"a","value":2,"clear":true},{"name":"b","value":-1,"clear":false,"hint":"h"},{"value":1},{"name":"c","value":"x"}]}');
    expect(axes).toEqual([
      { name: "a", value: 1, clear: true },
      { name: "b", value: 0, clear: false, hint: "h" },
      { name: "c", value: 0, clear: true },
    ]);
  });
  it("is null for broken JSON or fewer than 3 axes", () => {
    expect(parseRadarSource("{oops")).toBeNull();
    expect(parseRadarSource('{"axes":[{"name":"a","value":1}]}')).toBeNull();
    expect(parseRadarSource("{}")).toBeNull();
  });
});

describe("collectReadingTitles", () => {
  const v = (day: string, title: string): ReadingVisit => ({ id: `${day}${title}`, day, at: "", updatedAt: "", path: `${title}.md`, title, kinds: ["word"] });
  const period = { from: "2026-10-19", to: "2026-10-25" };

  it("takes the period and the 30 days before, newest first, each title once", () => {
    const t = collectReadingTitles(
      [v("2026-10-20", "B"), v("2026-09-19", "edge"), v("2026-09-18", "too old"), v("2026-10-10", "A"), v("2026-10-21", "B"), v("2026-10-26", "future"), v("2026-10-22", " ")],
      period
    );
    expect(t).toEqual(["B", "A", "edge"]);
  });

  it("stops at 30 titles", () => {
    const visits = many(45, (i) => v("2026-10-20", `T${i}`));
    expect(collectReadingTitles(visits, period)).toHaveLength(30);
  });
});
