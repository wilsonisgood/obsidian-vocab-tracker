import { Component, MarkdownRenderer, setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import { dueLabel } from "../../core/text/dueLabel";
import { t } from "../../core/i18n";
import { wordThreadId } from "../../core/model/thread";
import { bindPronounceButton } from "../kit/pronounce";
import { renderWordAiTab } from "./AiTab";
import { unlikeEntry } from "./likeAction";
import { abbreviatePartOfSpeech } from "./partOfSpeech";
import { autoGrowTextarea, commitEntryField, levelTags, normalizeExpand, type EditableField } from "./rowModel";
import type { WordTab, WordUi } from "./wordUi";

// Progressive-disclosure state for a single row: collapsed (one line),
// half (synonyms-and-up visible), full (everything visible).
export type ExpandState = "collapsed" | "half" | "full";

export interface RowOptions {
  // Next-review date chip in the header (dashboard, 設計稿 L1). Off in the
  // narrow sidebar, where the header is already crowded.
  showDue?: boolean;
  // Enables the 「資料 · ✦ AI」 tabs on expanded rows (規劃書 06 §9.4, M4).
  ui?: WordUi;
  // Adds to the word's line (the sidebar's ✦ n discussion chip, design D1).
  decorateWord?(wordWrap: HTMLElement, entry: VocabEntry): void;
  // The 「單字頁」 button at the bottom of an expanded card (design D2–D4),
  // on both tabs.
  openWordPage?(entry: VocabEntry): void;
  // "sheet": the card alone in the iPhone bottom sheet (design M1) — always
  // open (no collapse arrow, the header isn't a toggle), 🔊 next to the
  // word, and like moves to the footer behind a second tap, away from
  // where a thumb lands.
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
}

// ── Shared row renderer: sidebar list + dashboard both use this ──
//
// Progressive-disclosure state, now variant-dependent (1006-2 #10/#14):
//   collapsed — one line: like · word+pos · expand toggle · speak
//   half      — 展開, the only expanded state a non-sheet row can reach:
//               definition, definitionZh (editable), level (read-only
//               chips); footer: 單字頁 · 字典重抓 icons (#12/#13). Synonyms,
//               antonyms, example, grammar, source and 複習時間 moved to
//               the word page (wordHeader.ts).
//   full      — sheet (iPhone drawer) only, unchanged from before: + the
//               fields above plus antonyms (if any), example, grammar
//               (render ↔ edit), source, reviewed, level as an editable
//               field; footer keeps its old more/fetch/like row.
//
// 規格 #10: everything this function's own clicks trigger (tab switch,
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
  const sheet = opts.variant === "sheet";
  let state: ExpandState = initialState;
  // Whether the 文法提示 field is showing its edit textarea right now
  // (規格 #22) — row-local UI state, kept across this row's own
  // self-redraws (tab switches, other field edits, …) the same way `state`
  // is, reset only when this row is mounted fresh.
  let grammarEditing = false;
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
    if (sheet && state === "collapsed") state = "half";
    // 規格 #10: a non-sheet row can't reach "full" any more (顯示更多/底部
    // 收合 are gone) — coerce a stale persisted "full" down to "half".
    state = normalizeExpand(state, sheet);
    const rowEl = document.createElement("div");
    rowEl.addClass("vt-row");
    rowEl.setAttr("data-entry-id", entry.id);
    rowEl.toggleClass("vt-sheet-card", sheet);
    const due = plugin.srs.nextDue(entry);
    rowEl.toggleClass("is-expanded", state !== "collapsed");

    // ── Header: always visible ───────────────────────────────────
    const head = rowEl.createEl("div", { cls: "vt-row-header" });

    if (!sheet) {
      const likeBtn = head.createEl("span", { cls: "vt-row-like" });
      likeBtn.toggleClass("is-liked", !!entry.liked);
      likeBtn.setText(entry.liked ? "♥" : "♡");
      likeBtn.setAttr("aria-label", t(entry.liked ? "like.unlike" : "like.like"));
      likeBtn.setAttr("role", "button");
      likeBtn.onclick = like;
    }

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
    opts.decorateWord?.(wordWrap, entry);

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

    if (!sheet) {
      const arrow = head.createEl("span", { cls: "vt-row-arrow" });
      setIcon(arrow, state === "collapsed" ? "chevron-up" : "chevron-down");
      arrow.setAttr("aria-label", state === "collapsed" ? t("row.expand") : t("row.collapse"));

      head.onclick = () => redraw(state === "collapsed" ? "half" : "collapsed");
    }

    // 規格 #11: 喇叭留在標題列右上角 — 收合或展開都一樣，不搬到底部 footer。
    headSpeak();

    if (state === "collapsed") {
      return rowEl;
    }

    // ── Body: half + full ────────────────────────────────────────
    const body = rowEl.createEl("div", { cls: "vt-row-body" });

    // This row's own child scope for anything that registers a listener
    // or owns a ChatPanel (tab-bar thread count, AI tab, 文法提示's
    // markdown render) — torn down and replaced on every self-redraw of
    // this row, not just a full host redraw (WordUi.rowScope, 規格 #10).
    const scope = opts.ui ? opts.ui.rowScope(entry.id) : new Component();

    let tab: WordTab = "data";
    if (opts.ui) tab = renderTabs(plugin, body, entry, opts.ui, scope, () => redraw());

    if (tab === "ai") {
      renderWordAiTab(plugin, body, entry, opts.ui as WordUi, scope);
      if (sheet) {
        renderWordPageButton(body, entry, opts);
        addCollapseButton(body);
      } else {
        // 規格 #13: 資料、AI 兩個頁籤都只剩「字典重抓」「單字頁」兩個 icon。
        renderMinimalFooter(body, plugin, entry, opts, () => redraw());
      }
      return rowEl;
    }

    // ── Data tab ───────────────────────────────────────────────────

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

    if (sheet) {
      // 音標 first line (規格 #17) — 詞性 already sits in the header above,
      // and the AI tab doesn't show this line at all. Unchanged: #14 keeps
      // the iPhone sheet's card as it was.
      if (entry.phonetic) {
        body.createEl("div", { text: entry.phonetic, cls: "vt-row-subtext" });
      }

      // Synonyms shares the exact same auto-growing textarea treatment as
      // Definition/中文定義, so a long list wraps flush-left instead of
      // truncating in a single-line input.
      mkField(t("row.field.synonyms"), "synonyms", { multiline: true });
      mkField(t("row.field.definition"), "definition", { multiline: true });
      mkField(t("row.field.definitionZh"), "definitionZh", { multiline: true });

      // 複習時間（n 次）— the only time info left on the sheet card in
      // either half or full (規格 #18); added/updated/next-review moved to
      // the word page.
      body.createEl("div", {
        text: t("row.meta.reviewed", { date: entry.lastReviewed, count: entry.reviews }),
        cls: "vt-meta",
      });

      if (state === "full") {
        // Antonyms is hidden entirely when empty rather than showing an
        // empty prompt box — unlike the other fields, it's not something
        // most words have.
        if (entry.antonyms) mkField(t("row.field.antonyms"), "antonyms");

        mkField(t("row.field.example"), "example", { multiline: true });

        // 文法提示 (規格 #22): renders as Markdown when there's content and
        // it isn't being edited right now; a click swaps it for the same
        // auto-growing textarea every other field uses, and losing focus (or
        // a commit) swaps it back. Empty stays the plain placeholder input.
        renderGrammarField(body, scope);

        if (entry.source && entry.source.path) {
          const src = body.createEl("div", { cls: "vt-row-source-link" });
          const name = entry.source.path.split("/").pop();
          src.textContent = `📍 ${name} : line ${entry.source.line + 1}`;
          src.setAttr("aria-label", t("row.jumpToSource"));
          src.onclick = async (e) => {
            e.stopPropagation();
            await plugin.jumpToSource(entry);
            opts.onJump?.(entry);
          };
        }

        // Level — last. Comma-separated free-form tags (e.g. "多益中級, 托福
        // 高級"), same field style as everything else.
        mkField(t("row.field.level"), "level", { multiline: true });
      }

      // ── Footer (unchanged — #14): more-info toggle · fetch · like ──
      const footer = body.createEl("div", { cls: "vt-row-footer" });

      const moreBtn = footerBtn(footer, state === "full" ? "chevron-down" : "info", state === "full" ? t("row.showLess") : t("row.showMore"));
      moreBtn.onclick = (e) => {
        e.stopPropagation();
        redraw(state === "full" ? "half" : "full");
      };

      const actions = footer.createEl("span", { cls: "vt-row-footer-actions" });

      const fetchBtn = footerBtn(actions, "refresh-cw", t("row.fetch"));
      fetchBtn.onclick = async (e) => {
        e.stopPropagation();
        fetchBtn.textContent = "…";
        await plugin.enrichEntry(entry, { verbose: true });
        redraw();
      };

      // 🔊 is in the header already; like moves here, away from where a
      // thumb lands on a touch-screen row (規格 #13).
      const likeBtn = footerBtn(actions, "heart", t(entry.liked ? "like.unlike" : "like.like"));
      likeBtn.addClass("vt-row-like");
      likeBtn.toggleClass("is-liked", !!entry.liked);
      likeBtn.onclick = like;

      renderWordPageButton(body, entry, opts);
      addCollapseButton(body);
    } else {
      // 規格 #12: 資料頁籤只留英文定義、中文定義（可編輯），下面是程度標籤
      // （唯讀 chip）。音標、同義字、反義字、例句、文法提示、出處、複習時間
      // 都拿掉，到單字頁看（src/ui/blocks/wordHeader.ts）。
      mkField(t("row.field.definition"), "definition", { multiline: true });
      mkField(t("row.field.definitionZh"), "definitionZh", { multiline: true });
      renderLevelChips(body, entry);

      // 規格 #13: 底部按鈕列只剩「字典重抓」「單字頁」，都只有 icon。
      renderMinimalFooter(body, plugin, entry, opts, () => redraw());
    }

    return rowEl;
  }

  // 規格 #19: a bottom collapse button on every expanded row (both tabs) —
  // collapses to one line and scrolls that line back into view. Sheet
  // cards never collapse (no arrow in the header either), so they don't
  // get this button.
  function addCollapseButton(parent: HTMLElement): void {
    if (sheet) return;
    const btn = parent.createEl("button", { cls: "vt-row-collapse-bottom" });
    setIcon(btn.createSpan({ cls: "vt-row-collapse-bottom-icon" }), "chevron-up");
    btn.createSpan({ text: t("row.collapse") });
    btn.setAttr("aria-label", t("row.collapse"));
    btn.onclick = (e) => {
      e.stopPropagation();
      redraw("collapsed", (newRow) => newRow.scrollIntoView({ block: "nearest" }));
    };
  }

  // 文法提示 (規格 #22): see the call site's comment above.
  function renderGrammarField(body: HTMLElement, scope: Component): void {
    const value = entry.grammar ?? "";
    const wrap = body.createEl("div", { cls: "vt-field" });
    if (value) wrap.addClass("is-filled");

    if (!value || grammarEditing) {
      const inp = wrap.createEl("textarea", { cls: ["vt-input", "vt-field-box", "vt-textarea", "vt-row-grammar-input"] });
      inp.rows = 1;
      inp.value = value;
      inp.placeholder = t("row.field.placeholder", { label: t("row.field.grammar").toLowerCase() });
      inp.onclick = (e) => e.stopPropagation();
      autoGrowTextarea(inp);
      inp.addEventListener("input", () => autoGrowTextarea(inp));
      // 失焦或 commit 後再變回渲染: blur is the one moment that covers
      // both — it fires whether or not the value changed, so there's no
      // separate "committed but still focused" state to track.
      inp.onblur = () => {
        grammarEditing = false;
        if (inp.value === value) {
          redraw();
          return;
        }
        void (async () => {
          await commitEntryField(plugin.store, entry, "grammar", inp.value);
          redraw();
        })();
      };
    } else {
      const render = wrap.createEl("div", { cls: ["vt-field-box", "vt-row-grammar-render"] });
      render.setAttr("role", "button");
      render.setAttr("aria-label", t("row.field.grammar"));
      render.onclick = (e) => {
        e.stopPropagation();
        grammarEditing = true;
        redraw(state, (newRow) => {
          newRow.querySelector<HTMLTextAreaElement>(".vt-row-grammar-input")?.focus();
        });
      };
      void MarkdownRenderer.render(plugin.app, value, render, entry.source?.path ?? "", scope);
    }
  }

  row = build();
  container.appendChild(row);
  return row;
}

// Icon-only footer button shared by the sheet's own footer (still its old
// moreBtn/fetch/like row — #14 leaves it alone) and `renderMinimalFooter`
// below (the new non-sheet footer, 規格 #13).
function footerBtn(parent: HTMLElement, icon: string, label: string): HTMLElement {
  const btn = parent.createEl("span", { cls: "vt-row-footer-icon" });
  setIcon(btn, icon);
  btn.setAttr("aria-label", label);
  btn.setAttr("role", "button");
  return btn;
}

// 規格 #13: a non-sheet expanded row's whole footer is now just two icons
// — 單字頁 where 顯示更多 used to sit (that button is gone, #10), and
// 字典重抓 on the right. Both the 資料 and AI tabs use this, so it isn't
// re-typed per tab.
function renderMinimalFooter(
  body: HTMLElement,
  plugin: VocabTrackerPlugin,
  entry: VocabEntry,
  opts: RowOptions,
  redraw: () => void
): void {
  const footer = body.createEl("div", { cls: "vt-row-footer" });

  if (opts.openWordPage) {
    const wordPageBtn = footerBtn(footer, "external-link", t("word.openPageTitle"));
    wordPageBtn.onclick = (e) => {
      e.stopPropagation();
      opts.openWordPage?.(entry);
    };
  }

  const actions = footer.createEl("span", { cls: "vt-row-footer-actions" });
  const fetchBtn = footerBtn(actions, "refresh-cw", t("row.fetch"));
  fetchBtn.onclick = async (e) => {
    e.stopPropagation();
    fetchBtn.textContent = "…";
    await plugin.enrichEntry(entry, { verbose: true });
    redraw();
  };
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

function renderWordPageButton(body: HTMLElement, entry: VocabEntry, opts: RowOptions): void {
  const open = opts.openWordPage;
  if (!open) return;
  const btn = body.createEl("button", { cls: "vt-word-page-btn" });
  setIcon(btn.createSpan({ cls: "vt-word-page-btn-icon" }), "external-link");
  btn.createSpan({ text: t("word.openPage") });
  btn.setAttr("aria-label", t("word.openPageTitle"));
  btn.onclick = (e) => {
    e.stopPropagation();
    open(entry);
  };
}

// 「資料 · ✦ AI n」 (design D2/D3). Returns the tab to draw. The badge
// counts questions in the word's thread and updates live; the thread shard
// loads lazily, so the count fills in once it's read. `scope` is this
// row's own child Component (規格 #10) — the thread-count listener lives
// there, not on the shared `ui.component`, so it's torn down on this
// row's own self-redraws instead of accumulating one per rebuild.
function renderTabs(
  plugin: VocabTrackerPlugin,
  body: HTMLElement,
  entry: VocabEntry,
  ui: WordUi,
  scope: Component,
  onChange: () => void
): WordTab {
  const current = ui.tabs.get(entry.id) ?? "data";
  const bar = body.createDiv({ cls: "vt-tabs" });
  const mkTab = (tab: WordTab, label: string, icon?: string) => {
    const el = bar.createEl("button", { cls: "vt-tab" });
    el.toggleClass("is-active", tab === current);
    if (icon) setIcon(el.createSpan({ cls: "vt-tab-icon" }), icon);
    el.createSpan({ text: label });
    el.onclick = (e) => {
      e.stopPropagation();
      if (tab === current) return;
      ui.tabs.set(entry.id, tab);
      onChange();
    };
    return el;
  };
  mkTab("data", t("word.tab.data"));
  const count = mkTab("ai", t("word.tab.ai"), "sparkles").createSpan({ cls: "vt-tab-count" });

  const update = () => {
    const n = plugin.threads.wordQuestionCount(entry.id);
    count.setText(n > 0 ? String(n) : "");
  };
  const threadId = wordThreadId(entry.id);
  scope.register(
    plugin.threads.events.on("thread:upsert", (th) => {
      if (th.id === threadId) update();
    })
  );
  scope.register(plugin.threads.events.on("threads:reloaded", update));
  void plugin.threads.ensureLoaded().then(update);
  return current;
}
