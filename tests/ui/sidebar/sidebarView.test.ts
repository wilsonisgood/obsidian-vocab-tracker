import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../../perf/support/obsidian"));

import { TFile } from "obsidian";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { VocabSidebarView } from "../../../src/ui/sidebar/VocabSidebarView";
import { discussionRows } from "../../../src/ui/sidebar/discussionRows";
import { verbUsageRows } from "../../../src/ui/sidebar/grammarRows";
import { computeNoteScope } from "../../../src/ui/sidebar/noteScope";
import { SECTIONS_STORAGE_KEY } from "../../../src/ui/sidebar/sections";
import { isListed, type IsListedContext } from "../../../src/core/model/like";
import { resolveWordlistSettings, tagEnabled } from "../../../src/core/model/wordlists";
import { t } from "../../../src/core/i18n";
import { entryRecency, groupOf } from "../../../src/ui/word/wordOrder";
import { buildStressFixture } from "../../fixtures/stress";
import type { FakeElement } from "../../perf/support/dom";
import { bootPlugin, closeSidebar, openSidebar, settle, type Booted } from "../../perf/support/harness";
import { flushMicrotasks } from "../../perf/support/report";

// The sidebar on the real plugin over the fake DOM (the perf harness):
// 1005 回饋 1 (order), 2 (sections, AI 討論), 3 (bringing a word into
// view), 13 (groups of words from no note), 14 (dates on the card); Wave 7
// Z: #5-#9 (本篁／全部 shared filter, isListed, 本篁 scope), #10 (row edits
// don't reorder / redraw the whole sidebar).
//
// Fixture words' `liked` is always undefined (regulation 06's fixture
// predates Wave 7 Y's backfill), so isListed() here only ever passes
// through an enabled exam tag — these helpers mirror
// VocabSidebarView.scopedEntries()/noteScopeFor() exactly, rather than
// hardcoding "every word from this note shows", which #7 makes untrue.

const fx = buildStressFixture();
let b: Booted;
let view: VocabSidebarView | null = null;

function isListedCtx(): IsListedContext {
  const knownTags = b.plugin.wordlists.index.tags;
  return {
    knownTags,
    isTagOn: (tag) => tagEnabled(resolveWordlistSettings(b.plugin.store.settings.wordlists), tag),
  };
}

function listedEntries(): VocabEntry[] {
  const ctx = isListedCtx();
  return b.plugin.store.entries.filter((e) => isListed(e, ctx));
}

// Mirrors VocabSidebarView.noteScopeFor()/loadNoteScope(), once the scan
// has actually finished (tests await settle() first).
async function noteScopeIds(path: string): Promise<Set<string>> {
  const file = b.app.vault.getAbstractFileByPath(path) as unknown as InstanceType<typeof TFile>;
  const hits = b.plugin.wordlists.cachedScan(path, file.stat.mtime)?.hits ?? [];
  const text = await b.plugin.notes.read(path);
  const inflections = resolveWordlistSettings(b.plugin.store.settings.wordlists).inflections;
  return computeNoteScope(b.plugin.store.entries, hits, text, inflections);
}

async function thisNoteEntries(path: string): Promise<VocabEntry[]> {
  const scope = await noteScopeIds(path);
  return listedEntries().filter((e) => scope.has(e.id));
}

beforeAll(async () => {
  b = await bootPlugin(fx);
});
afterAll(async () => {
  await b?.unload();
});
afterEach(() => {
  if (view) closeSidebar(b, view);
  view = null;
  b.app.saveLocalStorage(SECTIONS_STORAGE_KEY, null);
});

async function open(filter: "note" | "all"): Promise<VocabSidebarView> {
  view = await openSidebar(b, filter);
  await flushMicrotasks();
  await settle();
  return view;
}

function root(v: VocabSidebarView): FakeElement {
  return v.containerEl.children[1] as unknown as FakeElement;
}

function rowIds(el: FakeElement): string[] {
  return el.querySelectorAll(".vt-row").map((r) => r.getAttribute("data-entry-id") as string);
}

const entries = (): VocabEntry[] => b.plugin.store.entries;
const byId = (id: string) => entries().find((e) => e.id === id)!;
const isSortedByRecency = (ids: string[]) =>
  ids.every((id, i) => i === 0 || entryRecency(byId(ids[i - 1])) >= entryRecency(byId(id)));

describe("order (1005 回饋 1)", () => {
  it("This note: most recently changed first", async () => {
    const v = await open("note");
    const ids = rowIds(root(v));
    const expected = await thisNoteEntries(fx.article.path);
    expect(ids.length).toBe(expected.length);
    expect(isSortedByRecency(ids)).toBe(true);
  });

  it("All: groups by their latest change, words inside by recency", async () => {
    const v = await open("all");
    const listed = listedEntries();
    const headings = root(v).querySelectorAll(".vt-group-heading");
    const latest = headings.map((h) => {
      const key = h.getAttribute("data-group-key") as string;
      return Math.max(...listed.filter((e) => groupOf(e).key === key).map(entryRecency));
    });
    expect(latest.length).toBeGreaterThan(1);
    expect(latest.every((t, i) => i === 0 || latest[i - 1] >= t)).toBe(true);
    // Rows of the first group (they follow its heading).
    const first = Number(headings[0].querySelector(".vt-group-count")!.textContent);
    const ids = rowIds(root(v)).slice(0, first);
    expect(ids.every((id) => groupOf(byId(id)).key === headings[0].getAttribute("data-group-key"))).toBe(true);
    expect(isSortedByRecency(ids)).toBe(true);
  });

  it("an edit does not reorder the list or trigger a full redraw (1006report.md #10)", async () => {
    const v = await open("note");
    const before = rowIds(root(v));
    const last = before.at(-1)!;
    await b.plugin.store.touch(byId(last));
    // No render()/draw() call here on purpose: a row's own edit must not
    // reorder the list by itself — only the next normal redraw (note
    // switch, 本篁／全部, a chip) re-sorts.
    expect(rowIds(root(v))).toEqual(before);
  });
});

describe("groups of words from no note (1005 回饋 13)", () => {
  it("family words get a 字族樹 group with the family's name; clicking it opens 字族樹.md", async () => {
    const fam = fx.learnShard().families[0];
    const moved = entries().filter((e) => e.source?.path !== fx.article.path).slice(0, 2);
    const saved = moved.map((e) => ({ source: e.source, origin: e.origin, liked: e.liked }));
    for (const e of moved) {
      e.source = null;
      e.origin = `family:${fam.id}`;
      // isListed() needs *something* true for these two (規格 #7) — liked
      // stands in for "the user added it", same as adding from 字族樹
      // for real would (規格 #23).
      e.liked = true;
    }
    const openEntry = vi.spyOn(b.plugin, "openEntryFile").mockResolvedValue(undefined);
    try {
      const v = await open("all");
      const heading = root(v).querySelector(`.vt-group-heading[data-group-key="family:${fam.id}"]`)!;
      expect(heading === null).toBe(false);
      expect(heading.querySelector(".vt-group-count")!.textContent).toBe("2");
      // learn.json loads lazily; the title fills in place.
      await b.plugin.learn.ensureLoaded();
      await flushMicrotasks();
      const title = heading.querySelector(".vt-group-title")!;
      expect(title.textContent).toBe(t("sidebar.group.family", { name: fam.label }));
      title.click();
      expect(openEntry).toHaveBeenCalledWith("families");
      // The click on the name didn't fold the group.
      expect(v.collapsedGroups.has(`family:${fam.id}`)).toBe(false);
      // They left the 「沒有來源筆記」 group (among the listed words).
      const none = listedEntries().filter((e) => groupOf(e).key === "none");
      const noneHeading = root(v).querySelector('.vt-group-heading[data-group-key="none"]');
      expect(noneHeading === null ? 0 : Number(noneHeading.querySelector(".vt-group-count")!.textContent)).toBe(none.length);
    } finally {
      openEntry.mockRestore();
      moved.forEach((e, i) => Object.assign(e, saved[i]));
    }
  });
});

describe("bringing a word into view (1005 回饋 3)", () => {
  it("a word from another note: This note → All, its group opened, card expanded and highlighted", async () => {
    const v = await open("note");
    const other = entries().find((e) => e.source && e.source.path !== fx.article.path)!;
    v.collapsedGroups.add(groupOf(other).key);
    v.setWord(other.word.toUpperCase());
    expect(v.filterMode).toBe("all");
    expect(v.collapsedGroups.has(groupOf(other).key)).toBe(false);
    const row = root(v).querySelector(`.vt-row[data-entry-id="${other.id}"]`)!;
    expect(row.classList.contains("is-expanded")).toBe(true);
    expect(row.classList.contains("vt-row-flash")).toBe(true);
  });

  it("a word from the note in front stays on This note", async () => {
    const v = await open("note");
    const mine = (await thisNoteEntries(fx.article.path))[0];
    expect(v.locateWord(mine.word)).toBe(true);
    expect(v.filterMode).toBe("note");
    expect(root(v).querySelector(`.vt-row[data-entry-id="${mine.id}"]`)!.classList.contains("vt-row-flash")).toBe(true);
  });

  it("locateWord ignores untracked words (no 加入 banner)", async () => {
    const v = await open("note");
    expect(v.locateWord("zzzz-not-a-word")).toBe(false);
    expect(v.pendingWord).toBe("");
    v.setWord("zzzz-not-a-word");
    expect(v.pendingWord).toBe("zzzz-not-a-word");
  });

  it("opens a folded 單字 section", async () => {
    const v = await open("note");
    v.sections.set("words", true);
    v.render();
    expect(root(v).querySelectorAll(".vt-row")).toHaveLength(0);
    const mine = (await thisNoteEntries(fx.article.path))[0];
    v.setWord(mine.word);
    expect(v.sections.isCollapsed("words")).toBe(false);
    expect(root(v).querySelector(`.vt-row[data-entry-id="${mine.id}"]`)).not.toBeNull();
  });
});

describe("sections (1005 回饋 2)", () => {
  it("folding a section is remembered on this device", async () => {
    const v = await open("note");
    const head = root(v).querySelector('.vt-sb-section[data-section="words"] .vt-sb-section-head')!;
    head.click();
    expect(root(v).querySelectorAll(".vt-row")).toHaveLength(0);
    expect(b.app.loadLocalStorage(SECTIONS_STORAGE_KEY)).toEqual(["words"]);
    closeSidebar(b, v);
    const again = await open("note");
    expect(again.sections.isCollapsed("words")).toBe(true);
    expect(root(again).querySelector('.vt-sb-section[data-section="words"]')!.classList.contains("is-collapsed")).toBe(true);
    // Settings (synced) aren't touched.
    expect(JSON.stringify(b.plugin.store.settings)).not.toContain("vt-sidebar-sections");
  });

  it("AI 討論 lists every word discussion, newest first, and opens them (Wave 6 W: words only)", async () => {
    const v = await open("note");
    const expected = discussionRows(b.plugin.threads, await thisNoteEntries(fx.article.path));
    expect(expected.length).toBeGreaterThan(0);
    const head = root(v).querySelector('.vt-sb-section[data-section="ai"] .vt-sb-section-title')!;
    expect(head.textContent).toBe(t("sidebar.section.ai", { n: expected.length }));
    const rows = root(v).querySelectorAll(".vt-dlist-row");
    expect(rows.map((r) => r.getAttribute("data-thread-id"))).toEqual(expected.slice(0, 20).map((r) => r.threadId));
    // Every row is a word discussion now — paragraph discussions moved to
    // their own 「段落討論」 section.
    expect(rows.every((r) => r.classList.contains("is-word"))).toBe(true);

    // A word discussion → its card on the AI tab.
    const word = expected[0];
    root(v).querySelector(`.vt-dlist-row[data-thread-id="${word.threadId}"]`)!.click();
    await flushMicrotasks();
    expect(v.wordUi.tabs.get(word.entryId)).toBe("ai");
    expect(root(v).querySelector(`.vt-row[data-entry-id="${word.entryId}"]`)!.classList.contains("is-expanded")).toBe(true);
  });

  it("AI 討論 in 全部 covers every note, still filtered by isListed (#7, #8)", async () => {
    const v = await open("all");
    const expected = discussionRows(b.plugin.threads, listedEntries());
    expect(expected.length).toBeGreaterThan(0);
    const head = root(v).querySelector('.vt-sb-section[data-section="ai"] .vt-sb-section-title')!;
    expect(head.textContent).toBe(t("sidebar.section.ai", { n: expected.length }));
  });

  it("a folded AI 討論 still shows its count", async () => {
    b.app.saveLocalStorage(SECTIONS_STORAGE_KEY, ["ai"]);
    const v = await open("note");
    expect(root(v).querySelectorAll(".vt-dlist-row")).toHaveLength(0);
    const n = discussionRows(b.plugin.threads, await thisNoteEntries(fx.article.path)).length;
    expect(root(v).querySelector('.vt-sb-section[data-section="ai"] .vt-sb-section-title')!.textContent).toBe(
      t("sidebar.section.ai", { n })
    );
  });

  it("deleting a word discussion hides it immediately and can be undone (#21)", async () => {
    const v = await open("note");
    const expected = discussionRows(b.plugin.threads, await thisNoteEntries(fx.article.path));
    const row = root(v).querySelector(`.vt-dlist-row[data-thread-id="${expected[0].threadId}"]`)!;
    row.querySelector(".vt-dlist-delete")!.click();
    expect(row.classList.contains("vt-dlist-row-removed")).toBe(true);
    expect(b.plugin.threads.get(expected[0].threadId)?.deletedAt).toBeUndefined();
  });
});

describe("段落討論 (Wave 6 W: its own section, independent of the 單字 tab)", () => {
  it("本篇: the note in front's paragraph discussions only", async () => {
    const v = await open("note");
    const expectedCount = b.plugin.threads.paragraphThreads(fx.article.path).length;
    expect(expectedCount).toBeGreaterThan(0);
    const head = root(v).querySelector('.vt-sb-section[data-section="paragraphs"] .vt-sb-section-title')!;
    expect(head.textContent).toBe(t("paragraph.list.title", { n: expectedCount }));
    expect(root(v).querySelectorAll(".vt-plist-row")).toHaveLength(expectedCount);
  });

  it("全部: every note's paragraph discussions, grouped by note, not filtered by isListed (#8)", async () => {
    const v = await open("all");
    const existing = b.plugin.threads
      .paragraphThreads()
      .filter((th) => th.anchor.kind === "paragraph" && b.app.vault.getAbstractFileByPath(th.anchor.path));
    expect(existing.length).toBeGreaterThan(b.plugin.threads.paragraphThreads(fx.article.path).length);
    const head = root(v).querySelector('.vt-sb-section[data-section="paragraphs"] .vt-sb-section-title')!;
    expect(head.textContent).toBe(t("paragraph.list.title", { n: existing.length }));
    expect(root(v).querySelectorAll(".vt-plist-row")).toHaveLength(existing.length);
    expect(root(v).querySelectorAll(".vt-plist-group-head").length).toBeGreaterThan(1);
  });

  it("clicking a row opens its pane", async () => {
    const v = await open("note");
    const ids = new Set(b.plugin.threads.paragraphThreads(fx.article.path).map((th) => th.id));
    root(v).querySelector(".vt-plist-row")!.click();
    expect(v.router.current.name).toBe("paragraph");
    expect(ids.has((v.router.current as { threadId: string }).threadId)).toBe(true);
  });

  it("a folded 段落討論 still shows its count", async () => {
    b.app.saveLocalStorage(SECTIONS_STORAGE_KEY, ["paragraphs"]);
    const v = await open("note");
    expect(root(v).querySelectorAll(".vt-plist-row")).toHaveLength(0);
    const n = b.plugin.threads.paragraphThreads(fx.article.path).length;
    expect(root(v).querySelector('.vt-sb-section[data-section="paragraphs"] .vt-sb-section-title')!.textContent).toBe(
      t("paragraph.list.title", { n })
    );
  });

  it("with no note in front, shows an empty state and a 0 count", async () => {
    const before = b.app.workspace.activeFile;
    b.app.workspace.activeFile = null;
    try {
      const v = await open("note");
      expect(root(v).querySelectorAll(".vt-plist-row")).toHaveLength(0);
      expect(root(v).querySelector(".vt-sidebar-hint")!.textContent).toBe(t("sidebar.paragraphs.noNote"));
      expect(root(v).querySelector('.vt-sb-section[data-section="paragraphs"] .vt-sb-section-title')!.textContent).toBe(
        t("paragraph.list.title", { n: 0 })
      );
    } finally {
      b.app.workspace.activeFile = before;
    }
  });

  it("deleting a discussion hides it immediately and can be undone (#21)", async () => {
    const v = await open("note");
    const row = root(v).querySelector(`.vt-plist-row`)!;
    const threadId = row.getAttribute("data-thread-id")!;
    row.querySelector(".vt-plist-delete")!.click();
    expect(row.classList.contains("vt-plist-row-removed")).toBe(true);
    expect(b.plugin.threads.get(threadId)?.deletedAt).toBeUndefined();
  });
});

// 動詞用法也套 isListed／本篇 scope 的篩選了 (1006report.md #6-#8): 全部
// 模式下跟單字一樣只看 isListed 的字（不限筆記）。
function scopedVerbUsageRows(allowedIds: Set<string>) {
  return verbUsageRows(b.plugin.verbs.verbs().filter((e) => allowedIds.has(e.id)), (id) => b.plugin.learn.verbFavorite(id));
}

describe("文法 (Wave 6 W: 動詞用法 subsection)", () => {
  it("全部: lists recently generated/regenerated/saved verb usage, capped, with a 查看全部 link, filtered by isListed", async () => {
    const v = await open("all");
    const expected = scopedVerbUsageRows(new Set(listedEntries().map((e) => e.id)));
    expect(expected.length).toBeGreaterThan(10);
    const head = root(v).querySelector('.vt-sb-section[data-section="grammar"] .vt-sb-section-title')!;
    expect(head.textContent).toBe(t("sidebar.section.grammar", { n: expected.length }));
    const rows = root(v).querySelectorAll(".vt-glist-row");
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.getAttribute("data-entry-id"))).toEqual(expected.slice(0, 10).map((r) => r.entryId));
    expect(root(v).querySelector(".vt-glist-more")).not.toBeNull();

    const openWordPage = vi.spyOn(b.plugin, "openWordPage").mockResolvedValue(undefined);
    try {
      rows[0].click();
      expect(openWordPage).toHaveBeenCalledWith(expected[0].entryId);
    } finally {
      openWordPage.mockRestore();
    }

    const openEntry = vi.spyOn(b.plugin, "openEntryFile").mockResolvedValue(undefined);
    try {
      root(v).querySelector(".vt-glist-more")!.click();
      expect(openEntry).toHaveBeenCalledWith("verbs");
    } finally {
      openEntry.mockRestore();
    }
  });

  it("本篇: only verbs isListed and in this note's scope (#6-#8)", async () => {
    const v = await open("note");
    const allowed = new Set((await thisNoteEntries(fx.article.path)).map((e) => e.id));
    const expected = scopedVerbUsageRows(allowed);
    const head = root(v).querySelector('.vt-sb-section[data-section="grammar"] .vt-sb-section-title')!;
    expect(head.textContent).toBe(t("sidebar.section.grammar", { n: expected.length }));
    expect(root(v).querySelectorAll(".vt-glist-row")).toHaveLength(Math.min(10, expected.length));
  });

  it("a folded 文法 still shows its count", async () => {
    b.app.saveLocalStorage(SECTIONS_STORAGE_KEY, ["grammar"]);
    const v = await open("all");
    expect(root(v).querySelectorAll(".vt-glist-row")).toHaveLength(0);
    const n = scopedVerbUsageRows(new Set(listedEntries().map((e) => e.id))).length;
    expect(root(v).querySelector('.vt-sb-section[data-section="grammar"] .vt-sb-section-title')!.textContent).toBe(
      t("sidebar.section.grammar", { n })
    );
  });
});

describe("row meta (1006report.md 定案規格 #18)", () => {
  it("half and full both show only 複習時間 — 加入/更新/下次複習 moved to the word page", async () => {
    const v = await open("note");
    const id = rowIds(root(v))[0];
    const entry = byId(id);

    v.expandState.set(id, "half");
    v.render();
    const rowHalf = root(v).querySelector(`.vt-row[data-entry-id="${id}"]`)!;
    expect(rowHalf.querySelector(".vt-row-dates")).toBeNull();
    expect(rowHalf.querySelector(".vt-row-updated")).toBeNull();
    expect(rowHalf.textContent).toContain(t("row.meta.reviewed", { date: entry.lastReviewed, count: entry.reviews }));

    v.expandState.set(id, "full");
    v.render();
    const rowFull = root(v).querySelector(`.vt-row[data-entry-id="${id}"]`)!;
    expect(rowFull.querySelector(".vt-row-dates")).toBeNull();
    expect(rowFull.querySelector(".vt-row-updated")).toBeNull();
    expect(rowFull.textContent).toContain(t("row.meta.reviewed", { date: entry.lastReviewed, count: entry.reviews }));
  });
});
