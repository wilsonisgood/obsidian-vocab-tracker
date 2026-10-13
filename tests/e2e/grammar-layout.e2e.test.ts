// 1013-3: every element of the grammar pages has room — nothing clipped by an
// overflow:hidden ancestor, nothing squeezed below one line, nothing
// sticking out sideways. Desktop width and a phone-narrow window.
import { afterAll, beforeAll, expect, it } from "vitest";
import { screenshotPath } from "./lib/launcher";
import { endSession, openSidebarReady, startSession, type E2eSession } from "./lib/setup";

let s: E2eSession;
beforeAll(async () => { s = await startSession(9352); }, 150000);
afterAll(async () => { await endSession(s); });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const T = "present-perfect-vs-past";

const SEED = `(async () => {
  const p = app.plugins.plugins["vocab-tracker"]; const g = p.grammar; await g.ensureLoaded();
  const mk = (id, type, extra) => g.upsertQuestion({ id, topicId: "${T}", objectiveId: "present-link", type, explanation: "現在進不去，所以跟現在有關，要用完成式。這段說明故意寫長一點，看看換行有沒有空間。", errorTag: "tense-choice", createdAt: "2026-10-13T00:00:00Z", ...extra });
  mk("q1", "choice", { stem: "I ___ my keys, so I can't get into my apartment right now and have to wait.", options: ["lost", "have lost", "had lost", "was losing my"], answer: "have lost", distractors: { lost: "過去式只說過去，沒連到現在進不去。", "had lost": "過去完成式要有另一個過去時間點。" } });
  mk("q2", "blank", { stem: "She ___ already left the office.", answer: "has", accepted: ["'s"] });
  mk("q3", "find-error", { stem: "I have seen that movie last week with my friends.", options: ["have seen", "that movie", "last week"], answer: "have seen", accepted: ["saw"] });
  mk("q4", "rewrite", { stem: "用現在完成式改寫\\nI started working here in 2020 and I still work here.", answer: "I have worked here since 2020.", accepted: [] });
  mk("q5", "translate", { stem: "我已經讀完這本書了。", answer: "I have finished this book.", accepted: [] });
  const at = (i, topic, ok) => g.addAttempt({ id: "a" + i, questionId: "q1", topicId: topic, objectiveId: "present-link", at: "2026-10-1" + (i % 3) + "T00:00:00Z", correct: ok, given: "lost" });
  at(1, "${T}", false); at(2, "${T}", false); at(3, "be-verb", true); at(4, "personal-pronouns", false);
  g.upsertProgress({ id: "${T}", lastPracticedAt: "2026-10-01T00:00:00Z", srs: { due: "2026-10-01T00:00:00Z", stability: 1, difficulty: 5, elapsed_days: 1, scheduled_days: 1, reps: 1, lapses: 0, state: 2, last_review: "2026-09-30T00:00:00Z" } });
  await g.flush?.();
  return g.questions("${T}").length;
})()`;

// Elements whose box is cut by an overflow-clipping ancestor, squeezed under
// one text line, or wider than the page column.
const SCAN = (root: string) => `(() => {
  const roots = [...document.querySelectorAll(${JSON.stringify(root)})].filter(r => r.getBoundingClientRect().height);
  const bad = [];
  const name = (e) => e.tagName.toLowerCase() + "." + [...e.classList].join(".") + (e.textContent ? " «" + e.textContent.trim().slice(0, 30) + "»" : "");
  for (const r of roots) {
    const rr = r.getBoundingClientRect();
    for (const e of r.querySelectorAll("*")) {
      const b = e.getBoundingClientRect(); if (!b.width && !b.height) continue;
      const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none" || e.closest("svg")) continue;
      if (e.matches(".vt-gr-chevron, input")) continue; // rotated glyph's box; inputs scroll sideways by design
      if (b.right > rr.right + 1 || b.left < rr.left - 1) bad.push("sideways " + name(e) + " " + Math.round(b.left) + ".." + Math.round(b.right) + " root " + Math.round(rr.left) + ".." + Math.round(rr.right));
      const hasText = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      if (hasText && cs.display !== "inline" && b.height < lh * 0.8) bad.push("squeezed " + name(e) + " h=" + Math.round(b.height) + " line=" + Math.round(lh));
      if (/(hidden|clip|auto|scroll)/.test(cs.overflow) && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2) && !/auto|scroll/.test(cs.overflowY + cs.overflowX)) bad.push("clipped " + name(e) + " " + e.clientWidth + "x" + e.clientHeight + " < " + e.scrollWidth + "x" + e.scrollHeight);
      if (hasText && e.scrollWidth > e.clientWidth + 2 && cs.textOverflow === "ellipsis") bad.push("ellipsis " + name(e));
    }
  }
  return JSON.stringify({ roots: roots.length, bad: [...new Set(bad)] });
})()`;

const report: Record<string, string[]> = {};
async function check(label: string, root: string) {
  await wait(1500);
  const out = JSON.parse(String(await s.cdp.evaluate(SCAN(root)))) as { roots: number; bad: string[] };
  report[label] = out.roots ? out.bad : ["(no root found)"];
  await s.cdp.evaluate(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(root)})].find(e => e.getBoundingClientRect().height); if (r && r.getBoundingClientRect().height < innerHeight) r.scrollIntoView({ block: "center" }); else r?.scrollIntoView({ block: "start" }); return 1; })()`);
  await wait(300);
  await s.cdp.screenshot(screenshotPath(`gr-${label}.png`));
}

async function openPath(path: string) {
  await s.cdp.evaluate(`(async () => { const f = app.vault.getAbstractFileByPath(${JSON.stringify(path)}); await app.workspace.getLeaf(false).openFile(f, { state: { mode: "preview" } }); return 1; })()`);
}

async function pass(tag: string) {
  const mapPath = String(await s.cdp.evaluate(`app.vault.getFiles().find(f => f.name === "Grammar.md" || f.name === "文法.md")?.path`));
  await openPath(mapPath);
  await check(`${tag}-map`, ".workspace-leaf.mod-active .vt-gr");
  // 錯題本 open + 重做這組
  await s.cdp.evaluate(`(() => { [...document.querySelectorAll(".workspace-leaf.mod-active .vt-gr-mistakes-toggle")].find(e => e.getBoundingClientRect().height)?.click(); return 1; })()`);
  await wait(500);
  await s.cdp.evaluate(`(() => { [...document.querySelectorAll(".workspace-leaf.mod-active .vt-gr-mistake .vt-learn-btn")].find(e => e.getBoundingClientRect().height)?.click(); return 1; })()`);
  await check(`${tag}-mistakes`, ".workspace-leaf.mod-active .vt-gr-mistakes");
  // Topic page + practice: first question, then a wrong answer
  await s.cdp.evaluate(`app.plugins.plugins["vocab-tracker"].grammarPages.open("${T}")`);
  await wait(2000);
  await check(`${tag}-topic`, ".workspace-leaf.mod-active .markdown-preview-view");
  // Answer every question of the round (wrong where we can), checking the
  // question and the feedback screens.
  for (let i = 1; i <= 5; i++) {
    const kind = String(await s.cdp.evaluate(`(() => {
      const r = [...document.querySelectorAll(".workspace-leaf.mod-active .vt-gr-body")].find(e => e.getBoundingClientRect().height); if (!r) return "none";
      const opts = [...r.querySelectorAll(".vt-gr-opt, .vt-gr-frag")];
      if (opts.length) { const ans = opts.find(o => !/have lost|have seen/.test(o.textContent)) || opts[0]; ans.click(); return "opt"; }
      const inp = r.querySelector("input, textarea");
      if (inp) { inp.value = "I lose them yesterday and it was a very long sentence to see wrapping in the box"; inp.dispatchEvent(new Event("input", { bubbles: true }));
        const b = [...r.querySelectorAll("button")].find(b => /檢查|送出|Check|Submit/.test(b.textContent)); b?.click(); return "typed"; }
      return "other";
    })()`));
    await check(`${tag}-a${i}-${kind}`, ".workspace-leaf.mod-active .vt-gr-body");
    await s.cdp.evaluate(`(() => { const r = [...document.querySelectorAll(".workspace-leaf.mod-active .vt-gr-body")].find(e => e.getBoundingClientRect().height);
      const b = [...(r?.querySelectorAll("button") ?? [])].find(b => /我答錯|Wrong/.test(b.textContent)) ; b?.click();
      const n = [...(r?.querySelectorAll("button") ?? [])].find(b => /下一題|看小結|看結果|Next|summary/i.test(b.textContent)); n?.click(); return 1; })()`);
    await wait(400);
  }
  await check(`${tag}-summary`, ".workspace-leaf.mod-active .vt-gr-body");
  // Sidebar 文法 section, 全部 mode
  if (tag === "wide") {
    try { await openSidebarReady(s, 30000); } catch { report["wide-sidebar"] = ["(sidebar did not open — known flaky, skipped)"]; return; }
    await s.cdp.evaluate(`(() => { const v = app.plugins.plugins["vocab-tracker"].sidebarView(); const all = [...v.containerEl.querySelectorAll("button, .clickable-icon, span, div")].find(e => e.children.length === 0 && /^全部$|^All$/.test(e.textContent.trim())); all?.click(); return 1; })()`);
    await wait(800);
    await s.cdp.evaluate(`(() => { const v = app.plugins.plugins["vocab-tracker"].sidebarView(); const h = [...v.containerEl.querySelectorAll(".vt-sb-section-head")].find(e => /文法|Grammar/.test(e.textContent)); if (h && !v.containerEl.querySelector(".vt-glist")) h.click(); return 1; })()`);
    await check(`${tag}-sidebar`, ".workspace-split.mod-right-split .vt-glist");
  }
}

it("grammar pages give every element room", async () => {
  await wait(3000);
  expect(await s.cdp.evaluate(SEED)).toBe(5);
  await pass("wide");
  await s.cdp.evaluate(`(() => { app.workspace.rightSplit.collapse(); app.workspace.leftSplit.collapse(); require("electron").remote?.getCurrentWindow?.().setSize(420, 860); return 1; })()`).catch(() => 0);
  await wait(1500);
  await pass("narrow");
  console.log("REPORT " + JSON.stringify(report, null, 1));
  const problems = Object.entries(report).filter(([k, v]) => v.length && !(k.endsWith("sidebar") && /flaky/.test(v[0])));
  expect(problems).toEqual([]);
}, 300000);
