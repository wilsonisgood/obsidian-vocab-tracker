import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./support/obsidian"));

import { buildStressFixture } from "../fixtures/stress";
import type { FakeElement } from "./support/dom";
import { bootPlugin, ms, PERF_FACTOR, percentile, renderNote, sectionsOf, type Booted, type RenderedSection } from "./support/harness";
import { report, type Row } from "./support/report";

// 規劃書 06 §1.3 / §9.5: reading-view post-processors cost < 2 ms per
// section with 1,000 words and 200 threads. Every post-processor main.ts
// registers runs on each section of the ~300-section article, in
// registration order, and the per-section total is what's budgeted (p95):
//   WordPageDecorator · ParagraphBadges · processMarks · examHighlight.
// The word page (單字/<word>.md, written by the plugin itself) is measured
// the same way, since that's where WordPageDecorator does its work.

const BUDGET_MS = 2;
// main.ts registration order (onload).
const NAMES = ["WordPageDecorator", "ParagraphBadges", "processMarks", "examHighlight"];

const fx = buildStressFixture();
let b: Booted;

beforeAll(async () => {
  b = await bootPlugin(fx);
});
afterAll(async () => {
  await b?.unload();
});

interface Run {
  totals: number[];
  per: number[][];
}

function runAll(sections: readonly RenderedSection[]): Run {
  const pps = b.host.postProcessors;
  const per = pps.map(() => [] as number[]);
  const totals: number[] = [];
  for (const s of sections) {
    let total = 0;
    pps.forEach((pp, i) => {
      const t0 = performance.now();
      pp(s.el, s.ctx);
      const dt = performance.now() - t0;
      per[i].push(dt);
      total += dt;
    });
    totals.push(total);
  }
  return { totals, per };
}

function rowsFor(label: string, run: Run): Row[] {
  const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
  const rows: Row[] = [
    {
      metric: `${label}: per section, all post-processors`,
      budget: `p95 < ${BUDGET_MS} ms`,
      measured: `p95 ${ms(percentile(run.totals, 95))} · p50 ${ms(percentile(run.totals, 50))} · max ${ms(Math.max(...run.totals))}`,
      note: `${run.totals.length} sections, whole note ${ms(sum(run.totals))}; assert ≤ ${BUDGET_MS * PERF_FACTOR} ms`,
    },
  ];
  run.per.forEach((xs, i) => {
    rows.push({ metric: `  ${NAMES[i] ?? `post-processor #${i + 1}`}`, budget: "", measured: `p95 ${ms(percentile(xs, 95))} · max ${ms(Math.max(...xs))}` });
  });
  return rows;
}

describe("reading-view post-processors (§1.3 < 2 ms per section)", () => {
  const rows: Row[] = [];
  afterAll(() => report("reading view post-processors (fake DOM)", rows));

  it("registers the expected post-processors", () => {
    expect(b.host.postProcessors).toHaveLength(NAMES.length);
  });

  it("long article (~300 sections, 60 discussed paragraphs, 120 tracked words)", () => {
    // Warm-up pass on throwaway elements (the processors change the DOM).
    runAll(renderNote(fx.article));
    const sections = renderNote(fx.article);
    const run = runAll(sections);
    rows.push(...rowsFor("article", run));

    // They did their jobs: a ✦ n on every discussed paragraph, the tracked
    // words' marks wired, exam words underlined.
    const els = sections.map((s) => s.el as unknown as FakeElement);
    const counted = els.filter((el) => el.querySelector(".vt-pbadge.has-count"));
    const discussed = fx.threads.filter((t) => t.anchor.kind === "paragraph" && t.anchor.path === fx.article.path);
    expect(counted).toHaveLength(discussed.length);
    expect(els.some((el) => el.querySelector("mark.vt-tracked-mark"))).toBe(true);
    expect(els.some((el) => el.querySelector(".vt-exam-word"))).toBe(true);

    expect(percentile(run.totals, 95)).toBeLessThan(BUDGET_MS * PERF_FACTOR);
  });

  it("word page (單字/<word>.md with every managed section)", async () => {
    const entry = fx.liveEntries.find((e) => b.plugin.threads.wordThread(e.id))!;
    const path = await b.plugin.files.openWordPage(entry.id);
    expect(path).toBeTruthy();
    await b.plugin.exporter.flush();
    const text = b.app.vault.text(path as string) as string;
    const note = { path: path as string, text, sections: sectionsOf(text) };
    runAll(renderNote(note));
    const sections = renderNote(note);
    const run = runAll(sections);
    rows.push(...rowsFor("word page", run));
    // WordPageDecorator put its buttons on the managed headings.
    expect(sections.some((s) => (s.el as unknown as FakeElement).querySelector(".vt-wp-actions"))).toBe(true);
    expect(percentile(run.totals, 95)).toBeLessThan(BUDGET_MS * PERF_FACTOR);
  });
});
