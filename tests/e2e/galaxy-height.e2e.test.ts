// 1013-2: the Galaxy window reaches the visible bottom (16px margin, at
// least 400px) — in the full-screen view Galaxy.md opens as, and embedded.
import { afterAll, beforeAll, expect, it } from "vitest";
import { screenshotPath } from "./lib/launcher";
import { endSession, startSession, type E2eSession } from "./lib/setup";

let s: E2eSession;
beforeAll(async () => { s = await startSession(9351); }, 90000);
afterAll(async () => { await endSession(s); });

const PROBE = `(() => {
  const g = [...document.querySelectorAll(".workspace-leaf.mod-active .vt-gx-graph")].find(e => e.getBoundingClientRect().height);
  if (!g) return "no graph";
  const sc = g.closest(".markdown-preview-view") || g.closest(".cm-scroller") || g.closest(".view-content");
  const r = g.getBoundingClientRect(), sr = sc.getBoundingClientRect();
  return JSON.stringify({ scroller: sc.className.slice(0,60), graphTop: Math.round(r.top), graphBottom: Math.round(r.bottom), styleH: g.style.height,
    scTop: Math.round(sr.top), scBottom: Math.round(sr.bottom), scrollTop: sc.scrollTop, inner: innerHeight,
    pv: !!g.closest(".markdown-preview-view"), vc: !!g.closest(".view-content"), cm: !!g.closest(".cm-scroller") });
})()`;

async function open(mode: "preview" | "source") {
  await s.cdp.evaluate(`(async () => {
    const f = app.vault.getFiles().find(f => /^(Galaxy|字族樹)\\.md$/.test(f.name));
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(f, { state: { mode: "${mode}", source: false } });
    return f.path;
  })()`);
  await new Promise((r) => setTimeout(r, 2500));
}

interface Probe { graphTop: number; graphBottom: number; scBottom: number }
function expectFilled(label: string, raw: unknown): void {
  console.log(label, raw);
  const p = JSON.parse(String(raw)) as Probe;
  const h = p.graphBottom - p.graphTop;
  if (h > 402) expect(Math.abs(p.scBottom - 16 - p.graphBottom), label).toBeLessThanOrEqual(2);
  else expect(h, label).toBeGreaterThanOrEqual(398);
}

it("Galaxy window reaches the bottom", async () => {
  await new Promise((r) => setTimeout(r, 3000));
  for (const mode of ["preview", "source"] as const) {
    await open(mode);
    const raw = await s.cdp.evaluate(PROBE);
    if (typeof raw !== "string" || !raw.startsWith("{")) await s.cdp.screenshot(screenshotPath(`gx-${mode}.png`));
    expectFilled(mode, raw);
  }
  // Embedded block in an ordinary note, then a shorter window.
  await s.cdp.evaluate(`(async () => {
    const f = await app.vault.create("gx-embed.md", "# Embed\\n\\nSome text above.\\n\\n\\u0060\\u0060\\u0060vocab-galaxy\\n\\u0060\\u0060\\u0060\\n");
    await app.workspace.getLeaf(false).openFile(f, { state: { mode: "preview" } });
  })()`);
  await new Promise((r) => setTimeout(r, 2500));
  expectFilled("embed", await s.cdp.evaluate(PROBE));
  await s.cdp.evaluate(`(() => { require("electron").remote?.getCurrentWindow?.().setSize(1000, 650); return 1; })()`).catch(() => 0);
  await new Promise((r) => setTimeout(r, 1500));
  expectFilled("embed-small", await s.cdp.evaluate(PROBE));
  await open("preview");
  expectFilled("full-small", await s.cdp.evaluate(PROBE));
}, 120000);
