import { Component, setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import { dueLabel } from "../../core/text/dueLabel";
import { t } from "../../core/i18n";
import { wordThreadId } from "../../core/model/thread";
import { bindPronounceButton } from "../kit/pronounce";
import { renderWordAiTab } from "./AiTab";
import { unlikeEntry } from "./likeAction";
import { abbreviatePartOfSpeech } from "./partOfSpeech";
import {
  autoGrowTextarea,
  commitEntryField,
  levelTags,
  normalizeExpand,
  rowLayout,
  viewToggleSpec,
  type EditableField,
} from "./rowModel";
import type { WordTab, WordUi } from "./wordUi";

// Progressive-disclosure state for a single row: collapsed (one line),
// half (synonyms-and-up visible), full (everything visible).
export type ExpandState = "collapsed" | "half" | "full";

export interface RowOptions {
  // Next-review date chip in the header (dashboard, 設計稿 L1). Off in the
  // narrow sidebar, where the header is already crowded.
  showDue?: boolean;
  // Enables the Info/AI view toggle on expanded rows (規劃書 06 §9.4, M4;
  // 規劃書 11 §1 — the old top-of-body tab bar moved into the footer).
  ui?: WordUi;
  // Adds to the word's line (the sidebar's ✦ n discussion chip, design D1).
  decorateWord?(wordWrap: HTMLElement, entry: VocabEntry): void;
  // The 「單字頁」 icon in the footer (design D2–D4), both screens.
  openWordPage?(entry: VocabEntry): void;
  // "sheet": the card alone in the iPhone bottom sheet (1009 #1 — now
  // shares every bit of content with the sidebar row; see rowLayout() in
  // rowModel.ts). Only affects the header: always open, no collapse
  // arrow, a tap on the header doesn't collapse it. ♥, fields, footer and
  // the Info/AI switch are identical to a normal row.
  variant?: "row" | "sheet";
  // After the entry was deleted from this card (unliking a word with no
  // exam tag left on it — 規格 #14 — goes through here too, same as the
  // old ✕ did).
  onDeleted?(entry: VocabEntry): void;
  // After 📍 opened the note at the word (the iPhone sheet closes).
  onJump?(entry: VocabEntry): void;
  // 規格 #7 (1006-2): clicking the word itself locates it in the note in
  // front instead of expanding/collapsing the row — R2's hook, wired by
  // the sidebar. When given, a click on `.vt-row-word` calls this and
  // stops there (no toggle); when absent (dashboard, the iPhone sheet),
  // the word has no click handler of its own and a click falls through to
  // the row's usual expand/collapse.
  locate?(entry: VocabEntry): void;
  // 1007-2 #8/#13（側欄「本篇」頁面模式）: the level/exam-tag chips show in
  // the header line too, even collapsed — the dashboard/normal sidebar
  // list leave this off (they're already shown in the half-expanded body).
  levelInHead?: boolean;
  // A page-mode row for a word that's in the library but not liked yet
  // (規格 #8) gets dimmed instead of looking like a fully-tracked word.
  dimUnliked?: boolean;
  // Small morpheme tags next to the word (規格 #13, e.g. 「trans-」) — which
  // morpheme(s) this row was listed under on the page.
  morphemeLabels?: string[];
  // 規格 #14: clicking a page-mode row's header to expand it (collapsed →
  // half) also moves the page (page.selectWord) — wired by pageGroups.ts,
  // never set elsewhere. Fires only on the collapsed→expanded click, not
  // on expand→collapse or any other redraw.
  onActivate?(entry: VocabEntry): void;
}

// ── Shared row renderer: sidebar list + dashboard + the iPhone sheet all
// use this, and (1009 #1/#3) all render exactly the same body now ──
//
// Progressive-disclosure state:
//   collapsed — one line: like · word+pos · expand toggle · speak (a
//               sheet card is never collapsed, rowLayout().alwaysOpen).
//   half      — 展開, the only reachable expanded state (1009 #1 removed
//               the sheet's own 顯示更多, the last way to reach "full"):
//               either screen —
//                 Info (data) — definition, definitionZh (editable),
//                 level (read-only chips).
//                 AI           — the AI tab's chat thread.
//               footer, both screens: a view toggle (sparkles 「AI n」 ↔
//               book-open 「Info」) on the left, 單字頁 · 字典重抓 icons on
//               the right (#12/#13, 1009 #1).
//   full      — unreachable; normalizeExpand() (rowModel.ts) coerces a
//               stale persisted "full" down to "half" on every build.
//
// 規格 #10: everything this function's own clicks trigger (view toggle,
// expand/collapse, field edits, like) redraws only this row's own DOM —
// swapped in at the same spot inside `container` via `redraw()` below —
// never the host's `refresh`. `refresh()` is reserved for a change that
// might remove this row from the list entirely: unliking a word down to
// deletion, or (once it has no tag left lit) out of the filtered view.
export function renderVocabRow(
  plugin: VocabTrackerPlugin,
  container: HTMLElement,
  entry: VocabEntry,
  initialState: ExpandState,
  setState: (s: ExpandState) => void,
  refresh: () => void,
  opts: RowOptions = {}
): HTMLElement {
  const layout = rowLayout(opts.variant);
  // Still handy for the one purely cosmetic difference left (the
  // vt-sheet-card class, mobile.css) — behaviour goes through `layout`.
  const sheet = layout.alwaysOpen;
  let state: ExpandState = initialState;
  let row!: HTMLElement;

  // Rebuilds this row and swaps it in at the same spot — the host's list
  // never hears about it. `afterMount`, if given, runs once the new row is
  // actually attached (so e.g. focusing a field or scrollIntoView works).
  const redraw = (nextState: ExpandState = state, afterMount?: (newRow: HTMLElement) => void): void => {
    state = nextState;
    setState(state);
    const next = build();
    row.replaceWith(next);
    row = next;
    afterMount?.(next);
  };

  const like = async (e: MouseEvent) => {
    e.stopPropagation();
    if (entry.liked) {
      const deleted = unlikeEntry(plugin, entry);
      if (deleted) opts.onDeleted?.(entry);
      refresh();
    } else {
      await plugin.store.setLiked(entry, true);
      redraw();
    }
  };

  function build(): HTMLElement {
    // The sheet card is never collapsed.
    if (layout.alwaysOpen && state === "collapsed") state = "half";
    // 1009 #1: nothing can reach "full" any more (the sheet's own 顯示更多
    // is gone too, on top of #10's 底部收合) — coerce a stale persisted
    // "full" down to "half", sheet or not.
    state = normalizeExpand(state);
    const rowEl = document.createElement("div");
    rowEl.addClass("vt-row");
    rowEl.setAttr("data-entry-id", entry.id);
    rowEl.toggleClass("vt-sheet-card", sheet);
    const due = plugin.srs.nextDue(entry);
    rowEl.toggleClass("is-expanded", state !== "collapsed");
    rowEl.toggleClass("vt-row-unliked", !!opts.dimUnliked && !entry.liked);

    // ── Header: always visible ───────────────────────────────────
    const head = rowEl.createEl("div", { cls: "vt-row-header" });

    // 1009 #3: ♥ sits left of the word in the header for both variants now
    // — the sheet used to push it behind a second tap in its own footer.
    const likeBtn = head.createEl("span", { cls: "vt-row-like" });
    likeBtn.toggleClass("is-liked", !!entry.liked);
    likeBtn.setText(entry.liked ? "♥" : "♡");
    likeBtn.setAttr("aria-label", t(entry.liked ? "like.unlike" : "like.like"));
    likeBtn.setAttr("role", "button");
    likeBtn.onclick = like;

    const wordWrap = head.createEl("span", { cls: "vt-row-wordwrap" });
    const wordEl = wordWrap.createEl("span", { text: entry.word, cls: "vt-row-word" });
    if (opts.locate) {
      wordEl.setAttr("role", "button");
      wordEl.onclick = (e) => {
        e.stopPropagation();
        opts.locate?.(entry);
      };
    }
    for (const pos of abbreviatePartOfSpeech(entry.partOfSpeech)) {
      wordWrap.createEl("span", { text: pos, cls: "vt-row-badge" });
    }
    for (const label of opts.morphemeLabels ?? []) {
      wordWrap.createEl("span", { text: label, cls: "vt-row-morpheme-chip" });
    }
    opts.decorateWord?.(wordWrap, entry);

    if (opts.levelInHead) {
      for (const tagText of levelTags(entry.level)) {
        head.createEl("span", { text: tagText, cls: "vt-row-level-chip" });
      }
    }

    head.createEl("span", { cls: "vt-row-spacer" });

    // Never-reviewed words get no chip: on an existing vault that's every
    // word, and a column of "new" labels says nothing.
    if (opts.showDue && due) {
      const label = dueLabel(due, new Date());
      const chip = head.createEl("span", { cls: "vt-row-due" });
      chip.toggleClass("is-today", label.kind === "today");
      setIcon(chip.createSpan({ cls: "vt-row-due-icon" }), "calendar");
      chip.createSpan({ text: label.kind === "today" ? t("row.due.today") : label.text });
      chip.setAttr("aria-label", t("row.nextReview", { date: due.toLocaleString() }));
    }

    const headSpeak = () => {
      const speak = head.createEl("span", {
        cls: ["vt-speak-icon", "vt-row-speak"],
      });
      setIcon(speak, "volume-2");
      speak.setAttr("aria-label", t("row.pronounce"));
      speak.setAttr("role", "button");
      bindPronounceButton(speak, entry, { stopPropagation: true });
    };

    if (layout.chevron) {
      const arrow = head.createEl("span", { cls: "vt-row-arrow" });
      setIcon(arrow, state === "collapsed" ? "chevron-up" : "chevron-down");
      arrow.setAttr("aria-label", state === "collapsed" ? t("row.expand") : t("row.collapse"));
    }

    if (layout.headerToggle) {
      head.onclick = () => {
        const wasCollapsed = state === "collapsed";
        redraw(wasCollapsed ? "half" : "collapsed");
        if (wasCollapsed) opts.onActivate?.(entry);
      };
    }

    // 規格 #11: 喇叭留在標題列右上角 — 收合或展開都一樣，不搬到底部 footer。
    headSpeak();

    if (state === "collapsed") {
      return rowEl;
    }

    // ── Body: half is the only reachable expanded state (1009 #1) ────
    const body = rowEl.createEl("div", { cls: "vt-row-body" });

    // This row's own child scope for anything that registers a listener
    // or owns a ChatPanel (the footer toggle's live AI count, the AI
    // tab's ChatPanel) — torn down and replaced on every self-redraw of
    // this row, not just a full host redraw (WordUi.rowScope, 規格 #10).
    const scope = opts.ui ? opts.ui.rowScope(entry.id) : new Component();

    // Which screen this card shows — Info or AI (1009 #1: the old
    // top-of-body tab bar is gone, the footer's view toggle replaces it).
    // Falls back to "data" with no `ui` at all (a dashboard row that
    // never offers the AI tab).
    const tab: WordTab = opts.ui ? opts.ui.tabs.get(entry.id) ?? "data" : "data";

    if (tab === "ai" && opts.ui) {
      renderWordAiTab(plugin, body, entry, opts.ui, scope);
      renderFooter(body, plugin, entry, opts, scope, tab, () => redraw());
      return rowEl;
    }

    // ── Info screen (規格 #12, 1009 #1) ──────────────────────────────

    // 規格 #15: editing any field counts as using the word — like it the
    // first time this happens, same as any other auto-like trigger.
    // (字典重抓 goes through enrichEntry()/touch() directly, never this.)
    const commitField = async (key: EditableField, value: string) => {
      await commitEntryField(plugin.store, entry, key, value);
      redraw();
    };

    const mkField = (
      label: string,
      key: EditableField,
      fieldOpts: { multiline?: boolean } = {}
    ) => {
      const value = entry[key] ?? "";
      // No field-name labels — the placeholder alone says what belongs here,
      // and a filled field reads as plain text once the border drops away.
      const wrap = body.createEl("div", { cls: "vt-field" });
      if (value) wrap.addClass("is-filled");
      const cls = ["vt-input", "vt-field-box"];
      if (fieldOpts.multiline) cls.push("vt-textarea");

      if (fieldOpts.multiline) {
        const inp = wrap.createEl("textarea", { cls });
        inp.rows = 1; // UA default is 2 rows — pin to 1 so auto-grow starts tight
        inp.value = value;
        inp.placeholder = t("row.field.placeholder", { label: label.toLowerCase() });
        inp.onclick = (e) => e.stopPropagation();
        autoGrowTextarea(inp);
        inp.addEventListener("input", () => autoGrowTextarea(inp));
        inp.onchange = () => commitField(key, inp.value);
      } else {
        const inp = wrap.createEl("input", { cls });
        inp.type = "text";
        inp.value = value;
        inp.placeholder = t("row.field.placeholder", { label: label.toLowerCase() });
        inp.onclick = (e) => e.stopPropagation();
        inp.onchange = () => commitField(key, inp.value);
      }
    };

    // 規格 #12/1009 #1: Info 畫面只留英文定義、中文定義（可編輯），下面是程度
    // 標籤（唯讀 chip）— 音標、同義字、反義字、例句、文法提示、出處、複習時間
    // 都到單字頁看（src/ui/blocks/wordHeader.ts）。Sheet 跟 row 完全同一份。
    mkField(t("row.field.definition"), "definition", { multiline: true });
    mkField(t("row.field.definitionZh"), "definitionZh", { multiline: true });
    renderLevelChips(body, entry);

    renderFooter(body, plugin, entry, opts, scope, tab, () => redraw());

    return rowEl;
  }

  row = build();
  container.appendChild(row);
  return row;
}

// Icon-only footer button shared by renderFooter's 單字頁/字典重抓 icons
// (規格 #13) — plain icon + aria-label, no visible text (mobile.css adds
// the visible label back for the iPhone sheet's touch-sized buttons).
function footerBtn(parent: HTMLElement, icon: string, label: string): HTMLElement {
  const btn = parent.createEl("span", { cls: "vt-row-footer-icon" });
  setIcon(btn, icon);
  btn.setAttr("aria-label", label);
  btn.setAttr("role", "button");
  return btn;
}

// 規格 #12: 程度在非 sheet 的列上變成唯讀 chip（單字頁上仍是可編輯欄位）。
function renderLevelChips(body: HTMLElement, entry: VocabEntry): void {
  const tags = levelTags(entry.level);
  if (!tags.length) return;
  const wrap = body.createEl("div", { cls: "vt-row-level-chips" });
  for (const tagText of tags) {
    wrap.createEl("span", { text: tagText, cls: "vt-row-level-chip" });
  }
}

// 規劃書 11 §1: the whole bottom row — the Info/AI view toggle on the
// left (new; replaces the old 資料 · ✦ AI tab bar that used to sit at the
// top of the body, 規格 #10/#13), 單字頁 · 字典重抓 icons on the right
// (unchanged, #13). Shared by both screens and both variants (row/sheet,
// 1009 #1/#3) — nothing here is sheet-only any more.
function renderFooter(
  body: HTMLElement,
  plugin: VocabTrackerPlugin,
  entry: VocabEntry,
  opts: RowOptions,
  scope: Component,
  tab: WordTab,
  redraw: () => void
): void {
  const footer = body.createEl("div", { cls: "vt-row-footer" });

  // A stable left/right pair (even when the left slot is empty, no `ui`
  // given) so flex's space-between always pins 單字頁/字典重抓 to the
  // right (row.css/sidebar.css) instead of drifting when there's no
  // toggle to balance against.
  const left = footer.createEl("span", { cls: "vt-row-footer-left" });
  if (opts.ui) renderViewToggle(left, plugin, entry, opts.ui, scope, tab, redraw);

  const actions = footer.createEl("span", { cls: "vt-row-footer-actions" });

  if (opts.openWordPage) {
    const wordPageBtn = footerBtn(actions, "external-link", t("word.openPageTitle"));
    wordPageBtn.onclick = (e) => {
      e.stopPropagation();
      opts.openWordPage?.(entry);
    };
  }

  const fetchBtn = footerBtn(actions, "refresh-cw", t("row.fetch"));
  fetchBtn.onclick = async (e) => {
    e.stopPropagation();
    fetchBtn.textContent = "…";
    await plugin.enrichEntry(entry, { verbose: true });
    redraw();
  };
}

// The Info/AI switch itself (規劃書 11 §1): sparkles + "AI" (with a live
// question-count badge) on the Info screen, book-open + "Info" on the AI
// screen. viewToggleSpec (rowModel.ts) is the pure icon/label/count
// logic; this wires it to the DOM plus the live thread-count listener —
// the same thread:upsert/threads:reloaded subscription the old tab bar's
// badge used, still kept on the row's own scope (規格 #10) so a
// self-redraw tears it down with everything else instead of piling up.
function renderViewToggle(
  parent: HTMLElement,
  plugin: VocabTrackerPlugin,
  entry: VocabEntry,
  ui: WordUi,
  scope: Component,
  current: WordTab,
  redraw: () => void
): void {
  const btn = parent.createEl("span", { cls: "vt-view-toggle" });
  btn.setAttr("role", "button");
  const iconEl = btn.createSpan({ cls: "vt-view-toggle-icon" });
  const labelEl = btn.createSpan({ cls: "vt-view-toggle-label" });
  const countEl = btn.createSpan({ cls: "vt-view-toggle-count" });

  const apply = (n: number) => {
    const spec = viewToggleSpec(current, n);
    setIcon(iconEl, spec.icon);
    labelEl.setText(t(spec.label));
    countEl.setText(spec.count !== null ? String(spec.count) : "");
    btn.setAttr("aria-label", t(spec.label));
  };

  const threadId = wordThreadId(entry.id);
  const refresh = () => apply(plugin.threads.wordQuestionCount(entry.id));
  refresh();
  scope.register(
    plugin.threads.events.on("thread:upsert", (th) => {
      if (th.id === threadId) refresh();
    })
  );
  scope.register(plugin.threads.events.on("threads:reloaded", refresh));
  void plugin.threads.ensureLoaded().then(refresh);

  btn.onclick = (e) => {
    e.stopPropagation();
    ui.tabs.set(entry.id, current === "ai" ? "data" : "ai");
    redraw();
  };
}
