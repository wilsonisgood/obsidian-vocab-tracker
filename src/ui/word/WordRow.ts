import { setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import { Rating } from "../../core/model/srs";
import { dueLabel } from "../../core/text/dueLabel";
import { t } from "../../core/i18n";
import { wordThreadId } from "../../core/model/thread";
import { renderWordAiTab } from "./AiTab";
import type { WordTab, WordUi } from "./wordUi";
import { lt } from "./pendingStrings";
import { displayDate, displayStamp, entryDates } from "./wordOrder";

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
  // word, and delete moves to the footer behind a second tap, away from
  // where a thumb lands.
  variant?: "row" | "sheet";
  // After the entry was deleted from this card.
  onDeleted?(entry: VocabEntry): void;
  // After 📍 opened the note at the word (the iPhone sheet closes).
  onJump?(entry: VocabEntry): void;
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
  const sheet = opts.variant === "sheet";
  // The sheet card is never collapsed.
  if (sheet && state === "collapsed") state = "half";
  const row = container.createEl("div", { cls: "vt-row" });
  row.setAttr("data-entry-id", entry.id);
  row.toggleClass("vt-sheet-card", sheet);
  const due = plugin.srs.nextDue(entry);
  row.toggleClass("is-expanded", state !== "collapsed");

  const remove = async () => {
    await plugin.deleteEntry(entry);
    opts.onDeleted?.(entry);
    refresh();
  };

  // ── Header: always visible ───────────────────────────────────
  const head = row.createEl("div", { cls: "vt-row-header" });

  if (!sheet) {
    const del = head.createEl("span", { cls: "vt-row-delete" });
    setIcon(del, "x");
    del.setAttr("aria-label", t("row.delete"));
    del.onclick = async (e) => {
      e.stopPropagation();
      await remove();
    };
  }

  const wordWrap = head.createEl("span", { cls: "vt-row-wordwrap" });
  wordWrap.createEl("span", { text: entry.word, cls: "vt-row-word" });
  for (const tag of entry.level.split(",").map((t) => t.trim()).filter(Boolean)) {
    wordWrap.createEl("span", { text: tag, cls: "vt-row-badge" });
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
    speak.onclick = (e) => {
      e.stopPropagation();
      plugin.speakWord(entry);
    };
  };

  if (sheet) {
    headSpeak();
  } else {
    const arrow = head.createEl("span", { cls: "vt-row-arrow" });
    setIcon(arrow, state === "collapsed" ? "chevron-up" : "chevron-down");
    arrow.setAttr("aria-label", state === "collapsed" ? t("row.expand") : t("row.collapse"));

    head.onclick = () => {
      setState(state === "collapsed" ? "half" : "collapsed");
      refresh();
    };
  }

  if (state === "collapsed") {
    headSpeak();
    return;
  }

  // ── Body: half + full ────────────────────────────────────────
  const body = row.createEl("div", { cls: "vt-row-body" });

  const subText = body.createEl("div", { cls: "vt-row-subtext" });
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
    const wrap = body.createEl("div", { cls: "vt-field" });
    if (value) wrap.addClass("is-filled");
    const cls = ["vt-input", "vt-field-box"];
    if (opts.multiline) cls.push("vt-textarea");

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

    // 加入 / 更新 (1005 回饋 14): same "YYYY-MM-DD HH:mm:ss" as before.
    const dates = entryDates(entry);
    body.createEl("div", { text: t("row.meta.added", { date: displayStamp(dates.added) }), cls: "vt-meta" });
    if (dates.updated) {
      body.createEl("div", { text: lt("row.meta.updated", { date: displayStamp(dates.updated) }), cls: ["vt-meta", "vt-row-updated"] });
    }
    body.createEl("div", {
      text: t("row.meta.reviewed", { date: entry.lastReviewed, count: entry.reviews }),
      cls: "vt-meta",
    });
    if (due) {
      body.createEl("div", {
        text: t("row.nextReview", { date: due.toLocaleString() }),
        cls: "vt-meta",
      });
    }

    // Level — last, right below the Added/Reviewed lines. Comma-separated
    // free-form tags (e.g. "多益中級, 托福高級"), same field style as everything else.
    mkField(t("row.field.level"), "level", { multiline: true });
  }

  // Half: one short dates line (full shows them in detail above).
  if (state === "half") renderDatesLine(body, entry);

  // ── Footer: more-info toggle · fetch · reviewed · speak ──────
  const footer = body.createEl("div", { cls: "vt-row-footer" });

  const footerBtn = (parent: HTMLElement, icon: string, label: string) => {
    const btn = parent.createEl("span", { cls: "vt-row-footer-icon" });
    setIcon(btn, icon);
    btn.setAttr("aria-label", label);
    btn.setAttr("role", "button");
    return btn;
  };

  const moreBtn = footerBtn(footer, state === "full" ? "chevron-down" : "info", state === "full" ? t("row.showLess") : t("row.showMore"));
  moreBtn.onclick = (e) => {
    e.stopPropagation();
    setState(state === "full" ? "half" : "full");
    refresh();
  };

  const actions = footer.createEl("span", { cls: "vt-row-footer-actions" });

  const fetchBtn = footerBtn(actions, "refresh-cw", t("row.fetch"));
  fetchBtn.onclick = async (e) => {
    e.stopPropagation();
    fetchBtn.textContent = "…";
    await plugin.enrichEntry(entry, { verbose: true });
    refresh();
  };

  const reviewBtn = footerBtn(actions, "check", t("row.markReviewed"));
  // "I know this one" from the list = a Good rating (規劃書 06 §7.1), so it
  // reschedules the card instead of just bumping the legacy counters
  // (SrsService.rate still updates lastReviewed/reviews too).
  reviewBtn.onclick = async (e) => {
    e.stopPropagation();
    await plugin.srs.rate(entry, Rating.Good, "manual");
    refresh();
  };

  if (sheet) {
    // 🔊 is in the header already; delete asks for a second tap.
    const del = footerBtn(actions, "trash-2", t("row.delete"));
    del.addClass("vt-sheet-delete");
    let armed = false;
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!armed) {
        armed = true;
        del.addClass("mod-warning");
        del.setAttr("aria-label", t("mobile.row.confirmDelete"));
        window.setTimeout(() => {
          armed = false;
          del.removeClass("mod-warning");
          del.setAttr("aria-label", t("row.delete"));
        }, 3000);
        return;
      }
      await remove();
    };
  } else {
    const speak = actions.createEl("span", { cls: "vt-speak-icon" });
    setIcon(speak, "volume-2");
    speak.setAttr("aria-label", t("row.pronounce"));
    speak.setAttr("role", "button");
    speak.onclick = (e) => {
      e.stopPropagation();
      plugin.speakWord(entry);
    };
  }

  renderWordPageButton(body, entry, opts);
}

// 「加入 2026-07-25 · 更新 2026-10-05」 (1005 回饋 14).
function renderDatesLine(body: HTMLElement, entry: VocabEntry): void {
  const { added, updated } = entryDates(entry);
  if (!added && !updated) return;
  const text = updated
    ? lt("row.meta.dates", { added: displayDate(added) || "—", updated: displayDate(updated) })
    : lt("row.meta.addedOnly", { added: displayDate(added) });
  const el = body.createEl("div", { text, cls: ["vt-meta", "vt-row-dates"] });
  el.setAttr(
    "aria-label",
    [t("row.meta.added", { date: displayStamp(added) }), updated ? lt("row.meta.updated", { date: displayStamp(updated) }) : ""]
      .filter(Boolean)
      .join("\n")
  );
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
