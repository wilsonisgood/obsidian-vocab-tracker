import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../../perf/support/obsidian"));

import { Component } from "obsidian";
import { installDom, type FakeElement } from "../../perf/support/dom";
import type { VocabEntry } from "../../../src/core/model/entry";
import { renderVocabRow, type RowOptions } from "../../../src/ui/word/WordRow";
import { WordUi } from "../../../src/ui/word/wordUi";

// A direct, plugin-light render of WordRow (no sidebar/dashboard/plugin
// bootstrap) — just enough of VocabTrackerPlugin's surface for the row to
// draw: srs.nextDue, store.setLiked/touch, enrichEntry, jumpToSource.
// opts.ui is left out on purpose so the row never offers the AI tab
// (renderTabs/WordUi aren't this file's concern).

function entry(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: "e1",
    word: "glittery",
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    audio: undefined,
    partOfSpeech: "",
    grammar: "",
    source: null,
    added: "",
    lastReviewed: "",
    reviews: 0,
    liked: true,
    ...overrides,
  };
}

function fakePlugin() {
  return {
    srs: { nextDue: () => null },
    store: { setLiked: vi.fn(async () => undefined), touch: vi.fn(async () => undefined) },
    enrichEntry: vi.fn(async () => undefined),
    jumpToSource: vi.fn(async () => undefined),
    app: {},
  } as unknown as import("../../../main").default;
}

function mount(e: VocabEntry, state: "collapsed" | "half" | "full", opts: RowOptions = {}) {
  const plugin = fakePlugin();
  const doc = installDom();
  const container = doc.createElement("div") as unknown as FakeElement;
  let current = state;
  const row = renderVocabRow(
    plugin,
    container as unknown as HTMLElement,
    e,
    current,
    (s) => (current = s),
    () => undefined,
    opts
  ) as unknown as FakeElement;
  return { plugin, container, row, getState: () => current };
}

beforeEach(() => {
  installDom();
});

describe("WordRow — locate hook (1006-2 #7)", () => {
  it("with locate: clicking the word calls it and does not expand/collapse", () => {
    const e = entry();
    const locate = vi.fn();
    const { row, getState } = mount(e, "collapsed", { locate });
    const word = row.querySelector(".vt-row-word")!;
    word.click();
    expect(locate).toHaveBeenCalledWith(e);
    expect(getState()).toBe("collapsed");
  });

  it("without locate: clicking the word falls through to the row's own toggle", () => {
    const e = entry();
    const { row, getState } = mount(e, "collapsed", {});
    const word = row.querySelector(".vt-row-word")!;
    word.click();
    expect(getState()).toBe("half");
  });
});

describe("WordRow — non-sheet row, 1006-2 #10/#11/#12/#13", () => {
  it("#10: no 顯示更多/收合 — a row can only reach collapsed/half, never full", () => {
    const e = entry();
    const { row } = mount(e, "full", {});
    // "full" (e.g. a stale persisted expandState) renders exactly as half.
    expect(row.querySelector(".vt-row-collapse-bottom")).toBeNull();
    expect(row.querySelectorAll(".vt-row-footer-icon").length).toBe(1); // just fetch — no openWordPage given
  });

  it("#11: 喇叭 stays in the header, expanded or not — no footer speak icon any more", () => {
    const e = entry();
    const { row } = mount(e, "half", {});
    const header = row.querySelector(".vt-row-header")!;
    expect(header.querySelector(".vt-row-speak")).not.toBeNull();
    const footer = row.querySelector(".vt-row-footer")!;
    expect(footer.querySelector(".vt-speak-icon")).toBeNull();
  });

  it("#12: 資料頁籤只剩英文定義/中文定義（可編輯）+ 程度 chip（唯讀）— 其他欄位都不見了", () => {
    const e = entry({
      synonyms: "shiny",
      antonyms: "dull",
      example: "a glittery dress",
      grammar: "adj.",
      level: "多益中級, 托福高級",
      source: { path: "a.md", line: 3 },
    });
    const { row } = mount(e, "half", {});
    expect(row.querySelectorAll(".vt-field").length).toBe(2); // definition, definitionZh only
    expect(row.querySelector(".vt-row-subtext")).toBeNull(); // phonetic line
    expect(row.querySelector(".vt-meta")).toBeNull(); // 複習時間
    expect(row.querySelector(".vt-row-source-link")).toBeNull();
    expect(row.querySelector(".vt-row-grammar-render")).toBeNull();
    expect(row.querySelector(".vt-row-grammar-input")).toBeNull();
    const chips = row.querySelectorAll(".vt-row-level-chip").map((c) => c.textContent);
    expect(chips).toEqual(["多益中級", "托福高級"]);
  });

  it("#12: no level chips at all when the entry has none", () => {
    const e = entry({ level: "" });
    const { row } = mount(e, "half", {});
    expect(row.querySelector(".vt-row-level-chips")).toBeNull();
  });

  it("#13: the footer is exactly 字典重抓 + 單字頁, both icon-only, 單字頁 first (顯示更多's old spot)", () => {
    const e = entry();
    const openWordPage = vi.fn();
    const { row } = mount(e, "half", { openWordPage });
    const footer = row.querySelector(".vt-row-footer")!;
    const icons = footer.querySelectorAll(".vt-row-footer-icon");
    expect(icons.length).toBe(2);
    icons[0].click();
    expect(openWordPage).toHaveBeenCalledWith(e);
  });

  it("#13: without openWordPage, only the fetch icon shows", () => {
    const e = entry();
    const { row } = mount(e, "half", {});
    const footer = row.querySelector(".vt-row-footer")!;
    expect(footer.querySelectorAll(".vt-row-footer-icon").length).toBe(1);
  });
});

describe("WordRow — sheet variant now shares the row's body (1009 #1/#3)", () => {
  it("renders the exact same Info fields as a row — no sheet-only fields left", () => {
    const e = entry({ antonyms: "dull", example: "x", grammar: "adj.", level: "多益中級", synonyms: "x", phonetic: "/x/" });
    const rowBuild = mount(e, "half", {});
    const sheetBuild = mount(e, "half", { variant: "sheet" });
    // definition + definitionZh only, same as a plain row (#12) — not the
    // old sheet's synonyms/antonyms/example/grammar extras.
    expect(sheetBuild.row.querySelectorAll(".vt-field").length).toBe(2);
    expect(sheetBuild.row.querySelectorAll(".vt-field").length).toBe(rowBuild.row.querySelectorAll(".vt-field").length);
    expect(sheetBuild.row.querySelector(".vt-row-subtext")).toBeNull(); // phonetic line
    expect(sheetBuild.row.querySelector(".vt-meta")).toBeNull(); // 複習時間
  });

  it("no collapse arrow, and a header click doesn't collapse it (always open)", () => {
    const e = entry();
    const { row, getState } = mount(e, "half", { variant: "sheet" });
    expect(row.querySelector(".vt-row-arrow")).toBeNull();
    row.querySelector(".vt-row-header")!.click();
    expect(getState()).toBe("half");
  });

  it("a collapsed initial state renders expanded anyway (always open)", () => {
    const e = entry();
    const { row } = mount(e, "collapsed", { variant: "sheet" });
    expect(row.querySelector(".vt-row-body")).not.toBeNull();
    expect(row.hasClass("is-expanded")).toBe(true);
  });

  it("♥ is the footer's right-most slot (1010 #I2), not in the header", () => {
    const e = entry({ liked: false });
    const { row } = mount(e, "half", { variant: "sheet" });
    expect(row.querySelector(".vt-row-header .vt-row-like")).toBeNull();
    const footer = row.querySelector(".vt-row-footer")!;
    expect(footer.querySelector(".vt-row-like")).not.toBeNull();
  });
});

describe("WordRow — footer view toggle (規劃書 11 §1)", () => {
  function fakePluginWithThreads(count = 0) {
    const plugin = fakePlugin();
    (plugin as unknown as { threads: unknown }).threads = {
      wordQuestionCount: () => count,
      events: { on: () => () => undefined },
      ensureLoaded: async () => undefined,
    };
    return plugin;
  }

  function mountWithUi(e: VocabEntry, count = 0, extra: RowOptions = {}) {
    const plugin = fakePluginWithThreads(count);
    const doc = installDom();
    const container = doc.createElement("div") as unknown as FakeElement;
    const owner = new Component();
    const ui = new WordUi(owner);
    let current: "collapsed" | "half" | "full" = "half";
    const row = renderVocabRow(
      plugin,
      container as unknown as HTMLElement,
      e,
      current,
      (s) => (current = s),
      () => undefined,
      { ...extra, ui }
    ) as unknown as FakeElement;
    return { row, ui };
  }

  it("on the Info screen: sparkles + 「AI」, with the live question count", () => {
    const { row } = mountWithUi(entry(), 3);
    const toggle = row.querySelector(".vt-view-toggle")!;
    expect(toggle.querySelector(".vt-view-toggle-label")!.textContent).toBe("AI");
    expect(toggle.querySelector(".vt-view-toggle-count")!.textContent).toBe("3");
  });

  it("no questions yet: no count badge", () => {
    const { row } = mountWithUi(entry(), 0);
    const toggle = row.querySelector(".vt-view-toggle")!;
    expect(toggle.querySelector(".vt-view-toggle-count")!.textContent).toBe("");
  });

  it("without opts.ui, there is no toggle at all (just the icon pair)", () => {
    const e = entry();
    const { row } = mount(e, "half", {});
    expect(row.querySelector(".vt-view-toggle")).toBeNull();
  });
});

describe("WordRow — preview card (1009-2 #1, a word not in the library yet)", () => {
  function draft(overrides: Partial<VocabEntry> = {}): VocabEntry {
    return entry({ id: "preview:apron", liked: false, definition: "", definitionZh: "", ...overrides });
  }

  function mountPreview(
    e: VocabEntry,
    preview: RowOptions["preview"],
    extra: { addedEntries?: VocabEntry[] } = {}
  ) {
    const plugin = fakePlugin();
    const addedEntries = extra.addedEntries ?? [];
    (plugin as unknown as { addWordToVocab: unknown }).addWordToVocab = vi.fn(async (word: string) => {
      addedEntries.push(entry({ id: `real-${word}`, word, liked: true }));
      return true;
    });
    (plugin as unknown as { store: unknown }).store = {
      entries: addedEntries,
      setLiked: vi.fn(async () => undefined),
      touch: vi.fn(async () => undefined),
    };
    const doc = installDom();
    const container = doc.createElement("div") as unknown as FakeElement;
    let current: "collapsed" | "half" | "full" = "half";
    const refresh = vi.fn(() => undefined);
    const row = renderVocabRow(
      plugin,
      container as unknown as HTMLElement,
      e,
      current,
      (s) => (current = s),
      refresh,
      { preview }
    ) as unknown as FakeElement;
    return { plugin, row, refresh, addedEntries };
  }

  it("♥ adds the word for real (liked) and hands off to the host via refresh() — never a self-redraw", async () => {
    const e = draft();
    const { plugin, row, refresh, addedEntries } = mountPreview(e, { ctx: { sentence: "wears an apron" }, dict: null, status: "ready" });
    row.querySelector(".vt-row-like")!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(plugin.addWordToVocab).toHaveBeenCalledWith("glittery", { sentence: "wears an apron" }, { reveal: false });
    expect(addedEntries).toHaveLength(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Never the normal ♥ path (which would setLiked on the *draft*).
    expect(plugin.store.setLiked).not.toHaveBeenCalled();
  });

  it("folds the preview's own dictionary data into the newly added entry", async () => {
    const e = draft();
    const dict = { phonetic: "", audio: "", partOfSpeech: "", definition: "a protective garment", definitionZh: "", synonyms: [], antonyms: [] };
    const { addedEntries, row } = mountPreview(e, { ctx: {}, dict, status: "ready" });
    row.querySelector(".vt-row-like")!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(addedEntries[0].definition).toBe("a protective garment");
  });

  it("fields are read-only — no commit, no auto-like on 'edit'", () => {
    const e = draft({ definition: "already fetched" });
    const { row, plugin } = mountPreview(e, { ctx: {}, dict: null, status: "ready" });
    const fields = row.querySelectorAll(".vt-field .vt-input");
    expect(fields.length).toBe(2);
    for (const f of fields) expect((f as unknown as { disabled: boolean }).disabled).toBe(true);
    expect(plugin.store.setLiked).not.toHaveBeenCalled();
  });

  it("no 字典重抓/單字頁 icons — nothing in the footer writes the store", () => {
    const e = draft();
    const { row } = mountPreview(e, { ctx: {}, dict: null, status: "ready" });
    expect(row.querySelectorAll(".vt-row-footer-icon").length).toBe(0);
  });

  it("shows a loading hint while the dictionary fetch is in flight", () => {
    const e = draft();
    const { row } = mountPreview(e, { ctx: {}, dict: null, status: "loading" });
    const hint = row.querySelector(".vt-row-preview-hint")!;
    expect(hint.hasClass("is-error")).toBe(false);
    expect(hint.textContent).toContain("…");
  });

  it("shows an error hint on a failed fetch, but ♥ still works", () => {
    const e = draft();
    const { row } = mountPreview(e, { ctx: {}, dict: null, status: "error" });
    expect(row.querySelector(".vt-row-preview-hint")!.hasClass("is-error")).toBe(true);
    expect(row.querySelector(".vt-row-like")).not.toBeNull();
  });

  it("no hint once the fetch is ready", () => {
    const e = draft({ definition: "shiny" });
    const { row } = mountPreview(e, { ctx: {}, dict: null, status: "ready" });
    expect(row.querySelector(".vt-row-preview-hint")).toBeNull();
  });
});
