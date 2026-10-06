import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../../perf/support/obsidian"));

import { installDom, type FakeElement } from "../../perf/support/dom";
import type { VocabEntry } from "../../../src/core/model/entry";
import { renderVocabRow, type RowOptions } from "../../../src/ui/word/WordRow";

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

describe("WordRow — sheet variant unchanged (1006-2 #14)", () => {
  it("still reaches full via 顯示更多 (moreBtn), showing the fields a row doesn't have any more", () => {
    const e = entry({ antonyms: "dull", example: "x", level: "多益中級" });
    const { container } = mount(e, "half", { variant: "sheet" });
    // moreBtn is the footer's first icon in the sheet's unchanged layout.
    container.querySelector(".vt-row-footer-icon")!.click();
    // redraw() replaces the row in place — re-query the container, not the
    // (now detached) `row` returned by mount().
    const rebuilt = container.querySelector(".vt-row")!;
    // synonyms/definition/definitionZh (3, always) + antonyms + example +
    // grammar (its wrap is a .vt-field even empty) + level = 7.
    expect(rebuilt.querySelectorAll(".vt-field").length).toBe(7);
  });

  it("the sheet footer still has like, not the row's icon-only pair", () => {
    const e = entry({ liked: false });
    const { row } = mount(e, "half", { variant: "sheet" });
    const footer = row.querySelector(".vt-row-footer")!;
    expect(footer.querySelector(".vt-row-like")).not.toBeNull();
  });
});
