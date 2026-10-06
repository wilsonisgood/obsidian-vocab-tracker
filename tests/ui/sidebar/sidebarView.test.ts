import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../../perf/support/obsidian"));

import type { VocabEntry } from "../../../src/core/model/entry";
import type { VocabSidebarView } from "../../../src/ui/sidebar/VocabSidebarView";
import { discussionRows } from "../../../src/ui/sidebar/discussionRows";
import { verbUsageRows } from "../../../src/ui/sidebar/grammarRows";
import { SECTIONS_STORAGE_KEY } from "../../../src/ui/sidebar/sections";
import { t } from "../../../src/core/i18n";
import { entryRecency, groupOf } from "../../../src/ui/word/wordOrder";
import { buildStressFixture } from "../../fixtures/stress";
import type { FakeElement } from "../../perf/support/dom";
import { bootPlugin, closeSidebar, openSidebar, settle, type Booted } from "../../perf/support/harness";
import { flushMicrotasks } from "../../perf/support/report";

// The sidebar on the real plugin over the fake DOM (the perf harness):
// 1005 回饋 1 (order), 2 (sections, AI 討論), 3 (bringing a word into
// view), 13 (groups of words from no note), 14 (dates on the card).

const fx = buildStressFixture();
let b: Booted;
let view: VocabSidebarView | null = null;

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
    expect(ids.length).toBe(entries().filter((e) => e.source?.path === fx.article.path).length);
    expect(isSortedByRecency(ids)).toBe(true);
  });

  it("All: groups by their latest change, words inside by recency", async () => {
    const v = await open("all");
    const headings = root(v).querySelectorAll(".vt-group-heading");
    const latest = headings.map((h) => {
      const key = h.getAttribute("data-group-key") as string;
      return Math.max(...entries().filter((e) => groupOf(e).key === key).map(entryRecency));
    });
    expect(latest.length).toBeGreaterThan(1);
    expect(latest.every((t, i) => i === 0 || latest[i - 1] >= t)).toBe(true);
    // Rows of the first group (they follow its heading).
    const first = Number(headings[0].querySelector(".vt-group-count")!.textContent);
    const ids = rowIds(root(v)).slice(0, first);
    expect(ids.every((id) => groupOf(byId(id)).key === headings[0].getAttribute("data-group-key"))).toBe(true);
    expect(isSortedByRecency(ids)).toBe(true);
  });

  it("an edit moves the word to the top", async () => {
    const v = await open("note");
    const last = rowIds(root(v)).at(-1)!;
    await b.plugin.store.touch(byId(last));
    v.render();
    expect(rowIds(root(v))[0]).toBe(last);
  });
});

describe("groups of words from no note (1005 回饋 13)", () => {
  it("family words get a 字族樹 group with the family's name; clicking it opens 字族樹.md", async () => {
    const fam = fx.learnShard().families[0];
    const moved = entries().filter((e) => e.source?.path !== fx.article.path).slice(0, 2);
    const saved = moved.map((e) => ({ source: e.source, origin: e.origin }));
    for (const e of moved) {
      e.source = null;
      e.origin = `family:${fam.id}`;
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
      // They left the 「沒有來源筆記」 group.
      const none = entries().filter((e) => groupOf(e).key === "none");
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
    const mine = entries().find((e) => e.source?.path === fx.article.path)!;
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
    const mine = entries().find((e) => e.source?.path === fx.article.path)!;
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
    const expected = discussionRows(b.plugin.threads, entries());
    expect(expected.length).toBeGreaterThan(20);
    const head = root(v).querySelector('.vt-sb-section[data-section="ai"] .vt-sb-section-title')!;
    expect(head.textContent).toBe(t("sidebar.section.ai", { n: expected.length }));
    const rows = root(v).querySelectorAll(".vt-dlist-row");
    expect(rows.map((r) => r.getAttribute("data-thread-id"))).toEqual(expected.slice(0, 20).map((r) => r.threadId));
    // Every row is a word discussion now — paragraph discussions moved to
    // their own 「段落討論」 section.
    expect(rows.every((r) => r.classList.contains("is-word"))).toBe(true);

    // 顯示全部
    root(v).querySelector(".vt-dlist-more")!.click();
    expect(root(v).querySelectorAll(".vt-dlist-row")).toHaveLength(expected.length);

    // A word discussion → its card on the AI tab.
    const word = expected[0];
    root(v).querySelector(`.vt-dlist-row[data-thread-id="${word.threadId}"]`)!.click();
    await flushMicrotasks();
    expect(v.wordUi.tabs.get(word.entryId)).toBe("ai");
    expect(root(v).querySelector(`.vt-row[data-entry-id="${word.entryId}"]`)!.classList.contains("is-expanded")).toBe(true);
  });

  it("a folded AI 討論 still shows its count", async () => {
    b.app.saveLocalStorage(SECTIONS_STORAGE_KEY, ["ai"]);
    const v = await open("note");
    expect(root(v).querySelectorAll(".vt-dlist-row")).toHaveLength(0);
    const n = discussionRows(b.plugin.threads, entries()).length;
    expect(root(v).querySelector('.vt-sb-section[data-section="ai"] .vt-sb-section-title')!.textContent).toBe(
      t("sidebar.section.ai", { n })
    );
  });
});

describe("段落討論 (Wave 6 W: its own section, independent of the 單字 tab)", () => {
  it("lists the note in front's paragraph discussions, on either word tab", async () => {
    for (const filter of ["note", "all"] as const) {
      const v = await open(filter);
      const expectedCount = b.plugin.threads.paragraphThreads(fx.article.path).length;
      expect(expectedCount).toBeGreaterThan(0);
      const head = root(v).querySelector('.vt-sb-section[data-section="paragraphs"] .vt-sb-section-title')!;
      expect(head.textContent).toBe(t("paragraph.list.title", { n: expectedCount }));
      expect(root(v).querySelectorAll(".vt-plist-row")).toHaveLength(expectedCount);
      closeSidebar(b, v);
      view = null;
    }
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
});

describe("文法 (Wave 6 W: 動詞用法 subsection)", () => {
  it("lists recently generated/regenerated/saved verb usage, capped, with a 查看全部 link", async () => {
    const v = await open("note");
    const expected = verbUsageRows(b.plugin.verbs.verbs(), (id) => b.plugin.learn.verbFavorite(id));
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

  it("a folded 文法 still shows its count", async () => {
    b.app.saveLocalStorage(SECTIONS_STORAGE_KEY, ["grammar"]);
    const v = await open("note");
    expect(root(v).querySelectorAll(".vt-glist-row")).toHaveLength(0);
    const n = verbUsageRows(b.plugin.verbs.verbs(), (id) => b.plugin.learn.verbFavorite(id)).length;
    expect(root(v).querySelector('.vt-sb-section[data-section="grammar"] .vt-sb-section-title')!.textContent).toBe(
      t("sidebar.section.grammar", { n })
    );
  });
});

describe("dates on the card (1005 回饋 14)", () => {
  it("an expanded card shows 加入 and 更新", async () => {
    const v = await open("note");
    const id = rowIds(root(v))[0];
    v.expandState.set(id, "half");
    v.render();
    const line = root(v).querySelector(`.vt-row[data-entry-id="${id}"] .vt-row-dates`);
    expect(line).not.toBeNull();
    expect(line!.textContent).toContain(byId(id).added.slice(0, 10));
    v.expandState.set(id, "full");
    v.render();
    expect(root(v).querySelector(`.vt-row[data-entry-id="${id}"] .vt-row-updated`)).not.toBeNull();
  });
});
