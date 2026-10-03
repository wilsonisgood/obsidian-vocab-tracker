import { setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import { nowStamp } from "../../core/nowStamp";
import { t } from "../../core/i18n";

// Progressive-disclosure state for a single row: collapsed (one line),
// half (synonyms-and-up visible), full (everything visible).
export type ExpandState = "collapsed" | "half" | "full";

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
  refresh: () => void
) {
  const row = container.createEl("div", { cls: "vocab-tracker-row" });
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

  head.createEl("span", { cls: "vocab-tracker-row-spacer" });

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

  const commitField = async (key: EditableField, value: string) => {
    entry[key] = value;
    await plugin.saveVocab();
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
    mkField(t("row.field.grammar"), "grammar");

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
  reviewBtn.onclick = async (e) => {
    e.stopPropagation();
    entry.lastReviewed = nowStamp();
    entry.reviews += 1;
    await plugin.saveVocab();
    refresh();
  };

  const speak = actions.createEl("span", { cls: "vocab-tracker-speak-icon" });
  setIcon(speak, "volume-2");
  speak.title = t("row.pronounce");
  speak.onclick = (e) => {
    e.stopPropagation();
    plugin.speakWord(entry);
  };
}
