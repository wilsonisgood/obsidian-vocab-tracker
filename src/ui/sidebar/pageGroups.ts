import { setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { resolveWordlistSettings } from "../../core/model/wordlists";
import type { PageContext, PageGroup, PageWord } from "../page/pageContext";
import type { ExpandState, RowOptions } from "../word/WordRow";
import { renderVocabRow } from "../word/WordRow";
import { tierPageWords, type PageRow } from "./pageGroupsModel";

// 第十波 S（1007-2 #8, #13）: draws the sidebar's 「本篇」 page-mode groups
// (字族樹／Word DNA) — VocabSidebarView.drawWords() calls this instead of
// the usual flat/grouped list when plugin.pageContext has a page for the
// active file. Pure DOM; the tiering itself lives in pageGroupsModel.ts.

export interface PageGroupsDeps {
  plugin: VocabTrackerPlugin;
  page: PageContext;
  // Which groups are folded (VocabSidebarView.pageCollapsed — its own set,
  // not shared with the All tab's collapsedGroups).
  pageCollapsed: Set<string>;
  expandState: Map<string, ExpandState>;
  // Suggested-row 「＋」 in flight, keyed by `${groupKey}::${word}` — kept
  // on the view so a redraw mid-request still shows the spinner.
  busy: Set<string>;
  // The sidebar's shared row options (ui, decorateWord, openWordPage,
  // locate) — this module only adds the page-specific bits per row.
  rowOpts: RowOptions;
  onToggleGroup(): void;
  // Same contract as GroupedWordList's refresh: an entryId that might have
  // left the list (unliked down to nothing left), or none for "just redraw".
  onRowRemoved(entryId?: string): void;
  onBusyChange(): void;
}

export function renderPageGroups(container: HTMLElement, deps: PageGroupsDeps): void {
  const { plugin, page } = deps;
  const settings = resolveWordlistSettings(plugin.store.settings.wordlists);
  const tagsOf = (word: string): readonly string[] => plugin.wordlists.index.lookup(word, settings.inflections);

  for (const group of page.groups) {
    const rows = tierPageWords(group.words, (id) => plugin.store.entries.find((e) => e.id === id), tagsOf);
    const isCollapsed = deps.pageCollapsed.has(group.key);

    const heading = container.createEl("div", { cls: "vt-group-heading" });
    heading.setAttr("data-group-key", group.key);
    const arrow = heading.createEl("span", { cls: "vt-group-arrow" });
    setIcon(arrow, isCollapsed ? "chevron-up" : "chevron-down");
    heading.createEl("span", { text: group.title, cls: "vt-group-title", attr: { "aria-label": group.title } });
    heading.createEl("span", { cls: "vt-group-spacer" });
    heading.createEl("span", { text: String(rows.length), cls: "vt-group-count" });
    heading.onclick = () => {
      if (isCollapsed) deps.pageCollapsed.delete(group.key);
      else deps.pageCollapsed.add(group.key);
      deps.onToggleGroup();
    };

    if (isCollapsed) continue;

    if (rows.length === 0) {
      container.createDiv({ cls: "vt-sidebar-hint", text: t("sidebar.page.emptyGroup") });
      continue;
    }

    for (const row of rows) {
      if (row.kind === "suggested") {
        renderSuggestRow(container, page, group, row, deps);
        continue;
      }
      const entry = row.entry!;
      const state = deps.expandState.get(entry.id) ?? "collapsed";
      renderVocabRow(
        plugin,
        container,
        entry,
        state,
        (s) => deps.expandState.set(entry.id, s),
        () => deps.onRowRemoved(entry.id),
        {
          ...deps.rowOpts,
          levelInHead: true,
          dimUnliked: row.kind === "unliked",
          morphemeLabels: row.morphemeLabels,
          // 規格 #14: a tap that expands this row (not one that collapses
          // it) also moves the page to this word.
          onActivate: () => page.selectWord(group.key, row.word),
        }
      );
    }
  }
}

function suggestKey(groupKey: string, word: PageWord): string {
  return `${groupKey}::${word.word.toLowerCase()}`;
}

// 規格 #8: 單字庫裡沒有的建議字 — 灰色簡易列（emoji、單字、中文、等級標
// 籤、字素標籤、＋）。點列本身不做事；＋ 加入並 like（page.addWord 已經
// 做了 like），busy 時轉圈、不能重複點。
function renderSuggestRow(container: HTMLElement, page: PageContext, group: PageGroup, row: PageRow, deps: PageGroupsDeps): void {
  const key = suggestKey(group.key, row.word);
  const busy = deps.busy.has(key);
  const el = container.createDiv({ cls: ["vt-row", "vt-page-suggest"] });
  if (row.word.emoji) el.createSpan({ text: row.word.emoji, cls: "vt-page-suggest-emoji" });
  el.createSpan({ text: row.word.word, cls: "vt-page-suggest-word" });
  if (row.word.zh) el.createSpan({ text: row.word.zh, cls: "vt-page-suggest-zh" });
  for (const tagText of row.levelTags) el.createSpan({ text: tagText, cls: "vt-row-level-chip" });
  for (const label of row.morphemeLabels) el.createSpan({ text: label, cls: "vt-row-morpheme-chip" });
  el.createEl("span", { cls: "vt-group-spacer" });

  const addBtn = el.createEl("span", { cls: "vt-page-suggest-add" });
  addBtn.toggleClass("is-busy", busy);
  setIcon(addBtn, "plus");
  addBtn.setAttr("role", "button");
  addBtn.setAttr("aria-label", t("sidebar.page.add", { word: row.word.word }));
  if (!busy) {
    addBtn.onclick = (e) => {
      e.stopPropagation();
      deps.busy.add(key);
      deps.onBusyChange();
      void page.addWord(group.key, row.word).finally(() => {
        deps.busy.delete(key);
        deps.onBusyChange();
      });
    };
  }
}
