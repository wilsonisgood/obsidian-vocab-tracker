import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./support/obsidian"));

import type { VocabSidebarView } from "../../src/ui/sidebar/VocabSidebarView";
import { buildStressFixture } from "../fixtures/stress";
import type { FakeElement } from "./support/dom";
import { bootPlugin, closeSidebar, ms, openSidebar, PERF_FACTOR, type Booted } from "./support/harness";
import { flushMicrotasks, median, report, type Row } from "./support/report";

// 規劃書 06 §1.3: with 1,000 words and 200 threads, opening the sidebar
// takes < 150 ms. Measured on the real plugin (main.ts onload) over the
// fake DOM: VocabSidebarView created → onOpen → its async parts (thread
// counts, the 段落討論 list) drawn. The All tab draws every word (1,000
// collapsed rows in groups); This note draws the long article's 120 words
// plus its 60 paragraph discussions.

const BUDGET_MS = 150;
const RUNS = 7;

const fx = buildStressFixture();
let b: Booted;

beforeAll(async () => {
  b = await bootPlugin(fx);
});
afterAll(async () => {
  await b?.unload();
});

async function timedOpen(filter: "note" | "all"): Promise<{ ms: number; view: VocabSidebarView }> {
  const t0 = performance.now();
  const view = await openSidebar(b, filter);
  await flushMicrotasks();
  return { ms: performance.now() - t0, view };
}

function root(view: VocabSidebarView): FakeElement {
  return view.containerEl.children[1] as unknown as FakeElement;
}

describe("sidebar open with 1,000 words / 200 threads (§1.3 < 150 ms)", () => {
  const rows: Row[] = [];
  afterAll(() => report("sidebar open (VocabSidebarView, fake DOM)", rows));

  for (const filter of ["all", "note"] as const) {
    it(`${filter === "all" ? "All" : "This note"} tab`, async () => {
      // First open in this worker: cold JIT, like the first open after
      // Obsidian starts.
      const cold = await timedOpen(filter);
      const el = root(cold.view);
      if (filter === "all") {
        expect(el.querySelectorAll(".vt-row")).toHaveLength(1000);
      } else {
        expect(el.querySelectorAll(".vt-row")).toHaveLength(fx.liveEntries.filter((e) => e.source?.path === fx.article.path).length);
        // The 段落討論 list finished drawing (async: it reads the note).
        const articleThreads = fx.threads.filter((t) => t.anchor.kind === "paragraph" && t.anchor.path === fx.article.path);
        expect(el.querySelectorAll(".vt-plist-row")).toHaveLength(articleThreads.length);
      }
      // ✦ n chips on words with discussions.
      expect(el.querySelectorAll(".vt-word-tc").length).toBeGreaterThan(0);
      closeSidebar(b, cold.view);

      const warm: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const r = await timedOpen(filter);
        warm.push(r.ms);
        closeSidebar(b, r.view);
      }
      const med = median(warm);
      rows.push({
        metric: `open, ${filter === "all" ? "All (1,000 rows)" : "This note (120 rows + 60 ¶)"}`,
        budget: `< ${BUDGET_MS} ms`,
        measured: `cold ${ms(cold.ms)} · median ${ms(med)} · max ${ms(Math.max(...warm))}`,
        note: `assert ≤ ${BUDGET_MS * PERF_FACTOR} ms`,
      });
      expect(cold.ms).toBeLessThan(BUDGET_MS * PERF_FACTOR);
      expect(med).toBeLessThan(BUDGET_MS * PERF_FACTOR);
    });
  }

  it("switching tabs (full redraw) stays within budget too", async () => {
    const view = await openSidebar(b, "note");
    await flushMicrotasks();
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      // Toggle order: This note, All.
      for (const idx of [1, 0]) {
        const btn = root(view).querySelectorAll(".vt-toggle-btn")[idx];
        const t0 = performance.now();
        btn.click();
        await flushMicrotasks();
        times.push(performance.now() - t0);
      }
    }
    closeSidebar(b, view);
    const med = median(times);
    rows.push({ metric: "tab switch (draw)", budget: `< ${BUDGET_MS} ms`, measured: `median ${ms(med)} · max ${ms(Math.max(...times))}` });
    expect(med).toBeLessThan(BUDGET_MS * PERF_FACTOR);
  });
});
