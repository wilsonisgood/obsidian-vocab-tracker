import { setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import { Rating } from "../../core/model/srs";
import { dueLabel } from "../../core/text/dueLabel";
import { t } from "../../core/i18n";
import { wordThreadId } from "../../core/model/thread";
import { renderWordAiTab } from "./AiTab";
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
}

type EditableField = "synonyms" | "definition" | "definitionZh" | "antonyms" | "example" | "grammar" | "level";

// Grows a textarea to fit its content instead of showing a scrollbar/resize
// handle — called once on render and again on every keystroke.
function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

// ── Shared row renderer: sidebar list + dashboard both use this ──
//
// Three progressive-disclosure states:
//   collapsed — one line: delete · word+level · expand toggle · speak
//   half      — + phonetic/POS, synonyms, definition, 中文翻译;
//               footer: more toggle · fetch · reviewed · speak
//   full      — + antonyms (if any), example, grammar, source,
//               added/reviewed, level
export function renderVocabRow(
  plugin: VocabTrackerPlugin,
  container: HTMLElement,
  entry: VocabEntry,
  state: ExpandState,
  setState: (s: ExpandState) => void,
  refresh: () => void,
  opts: RowOptions = {}
) {
  const row = container.createEl("div", { cls: "vocab-tracker-row" });
  row.setAttr("data-entry-id", entry.id);
  const due = plugin.srs.nextDue(entry);
  row.toggleClass("is-expanded", state !== "collapsed");

  // ── Header: always visible ───────────────────────────────────
  const head = row.createEl("div", { cls: "vocab-tracker-row-header" });

  const del = head.createEl("span", { cls: "vocab-tracker-row-delete" });
  setIcon(del, "x");
  del.title = t("row.delete");
  del.onclick = async (e) => {
    e.stopPropagation();
    await plugin.deleteEntry(entry);
    refresh();
  };

  const wordWrap = head.createEl("span", { cls: "vocab-tracker-row-wordwrap" });
  wordWrap.createEl("span", { text: entry.word, cls: "vocab-tracker-row-word" });
  for (const tag of entry.level.split(",").map((t) => t.trim()).filter(Boolean)) {
    wordWrap.createEl("span", { text: tag, cls: "vocab-tracker-row-badge" });
  }
  opts.decorateWord?.(wordWrap, entry);

  head.createEl("span", { cls: "vocab-tracker-row-spacer" });

  // Never-reviewed words get no chip: on an existing vault that's every
  // word, and a column of "new" labels says nothing.
  if (opts.showDue && due) {
    const label = dueLabel(due, new Date());
    const chip = head.createEl("span", { cls: "vt-row-due" });
    chip.toggleClass("is-today", label.kind === "today");
    setIcon(chip.createSpan({ cls: "vt-row-due-icon" }), "calendar");
    chip.createSpan({ text: label.kind === "today" ? t("row.due.today") : label.text });
    chip.title = t("row.nextReview", { date: due.toLocaleString() });
  }

  const arrow = head.createEl("span", { cls: "vocab-tracker-row-arrow" });
  setIcon(arrow, state === "collapsed" ? "chevron-up" : "chevron-down");
  arrow.title = state === "collapsed" ? t("row.expand") : t("row.collapse");

  head.onclick = () => {
    setState(state === "collapsed" ? "half" : "collapsed");
    refresh();
  };

  if (state === "collapsed") {
    const speak = head.createEl("span", {
      cls: ["vocab-tracker-speak-icon", "vocab-tracker-row-speak"],
    });
    setIcon(speak, "volume-2");
    speak.title = t("row.pronounce");
    speak.onclick = (e) => {
      e.stopPropagation();
      plugin.speakWord(entry);
    };
    return;
  }

  // ── Body: half + full ────────────────────────────────────────
  const body = row.createEl("div", { cls: "vocab-tracker-row-body" });

  const subText = body.createEl("div", { cls: "vocab-tracker-form-subtext" });
  subText.textContent =
    [entry.phonetic, entry.partOfSpeech].filter(Boolean).join("  ·  ") || entry.word;

  if (opts.ui) {
    const tab = renderTabs(plugin, body, entry, opts.ui, refresh);
    if (tab === "ai") {
      renderWordAiTab(plugin, body, entry, opts.ui);
      renderWordPageButton(body, entry, opts);
      return;
    }
  }

  const commitField = async (key: EditableField, value: string) => {
    entry[key] = value;
    await plugin.store.touch(entry);
    refresh();
  };

  const mkField = (
    label: string,
    key: EditableField,
    opts: { multiline?: boolean } = {}
  ) => {
    const value = entry[key] ?? "";
    // No field-name labels — the placeholder alone says what belongs here,
    // and a filled field reads as plain text once the border drops away.
    const wrap = body.createEl("div", { cls: "vocab-tracker-field" });
    if (value) wrap.addClass("is-filled");
    const cls = ["vocab-tracker-input", "vocab-tracker-field-box"];
    if (opts.multiline) cls.push("vocab-tracker-textarea");

    if (opts.multiline) {
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

  // Synonyms shares the exact same auto-growing textarea treatment as
  // Definition/中文翻译, so a long list wraps flush-left instead of
  // truncating in a single-line input.
  mkField(t("row.field.synonyms"), "synonyms", { multiline: true });
  mkField(t("row.field.definition"), "definition", { multiline: true });
  mkField(t("row.field.definitionZh"), "definitionZh", { multiline: true });

  if (state === "full") {
    // Antonyms is hidden entirely when empty rather than showing an
    // empty prompt box — unlike the other fields, it's not something
    // most words have.
    if (entry.antonyms) mkField(t("row.field.antonyms"), "antonyms");

    mkField(t("row.field.example"), "example", { multiline: true });
    // Multiline: pinned AI answers (釘選到文法提示) land here.
    mkField(t("row.field.grammar"), "grammar", { multiline: true });

    if (entry.source && entry.source.path) {
      const src = body.createEl("div", { cls: "vocab-tracker-source-link" });
      const name = entry.source.path.split("/").pop();
      src.textContent = `📍 ${name} : line ${entry.source.line + 1}`;
      src.title = t("row.jumpToSource");
      src.onclick = (e) => {
        e.stopPropagation();
        plugin.jumpToSource(entry);
      };
    }

    body.createEl("div", { text: t("row.meta.added", { date: entry.added }), cls: "vocab-tracker-meta" });
    body.createEl("div", {
      text: t("row.meta.reviewed", { date: entry.lastReviewed, count: entry.reviews }),
      cls: "vocab-tracker-meta",
    });
    if (due) {
      body.createEl("div", {
        text: t("row.nextReview", { date: due.toLocaleString() }),
        cls: "vocab-tracker-meta",
      });
    }

    // Level — last, right below the Added/Reviewed lines. Comma-separated
    // free-form tags (e.g. "多益中級, 托福高級"), same field style as everything else.
    mkField(t("row.field.level"), "level", { multiline: true });
  }

  // ── Footer: more-info toggle · fetch · reviewed · speak ──────
  const footer = body.createEl("div", { cls: "vocab-tracker-row-footer" });

  const moreBtn = footer.createEl("span", { cls: "vocab-tracker-footer-icon" });
  setIcon(moreBtn, state === "full" ? "chevron-down" : "info");
  moreBtn.title = state === "full" ? t("row.showLess") : t("row.showMore");
  moreBtn.onclick = (e) => {
    e.stopPropagation();
    setState(state === "full" ? "half" : "full");
    refresh();
  };

  const actions = footer.createEl("span", { cls: "vocab-tracker-row-footer-actions" });

  const fetchBtn = actions.createEl("span", { cls: "vocab-tracker-footer-icon" });
  setIcon(fetchBtn, "refresh-cw");
  fetchBtn.title = t("row.fetch");
  fetchBtn.onclick = async (e) => {
    e.stopPropagation();
    fetchBtn.textContent = "…";
    await plugin.enrichEntry(entry, { verbose: true });
    refresh();
  };

  const reviewBtn = actions.createEl("span", { cls: "vocab-tracker-footer-icon" });
  setIcon(reviewBtn, "check");
  reviewBtn.title = t("row.markReviewed");
  // "I know this one" from the list = a Good rating (規劃書 06 §7.1), so it
  // reschedules the card instead of just bumping the legacy counters
  // (SrsService.rate still updates lastReviewed/reviews too).
  reviewBtn.onclick = async (e) => {
    e.stopPropagation();
    await plugin.srs.rate(entry, Rating.Good, "manual");
    refresh();
  };

  const speak = actions.createEl("span", { cls: "vocab-tracker-speak-icon" });
  setIcon(speak, "volume-2");
  speak.title = t("row.pronounce");
  speak.onclick = (e) => {
    e.stopPropagation();
    plugin.speakWord(entry);
  };

  renderWordPageButton(body, entry, opts);
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
// loads lazily, so the count fills in once it's read.
function renderTabs(
  plugin: VocabTrackerPlugin,
  body: HTMLElement,
  entry: VocabEntry,
  ui: WordUi,
  refresh: () => void
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
      refresh();
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
  ui.component.register(
    plugin.threads.events.on("thread:upsert", (th) => {
      if (th.id === threadId) update();
    })
  );
  ui.component.register(plugin.threads.events.on("threads:reloaded", update));
  void plugin.threads.ensureLoaded().then(update);
  return current;
}
