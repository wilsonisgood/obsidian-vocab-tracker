import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import { nowStamp } from "../../core/nowStamp";

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
//   collapsed — one line: ✕ delete · word+level · expand toggle · 🔊 speak
//   half      — + phonetic/POS, synonyms, definition, 中文翻译;
//               footer: more toggle · 🔄 fetch · ✓ reviewed · 🔊 speak
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

  const del = head.createEl("span", { text: "✕", cls: "vocab-tracker-row-delete" });
  del.title = "Delete";
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

  const arrow = head.createEl("span", {
    text: state === "collapsed" ? "⌃" : "⌵",
    cls: "vocab-tracker-row-arrow",
  });
  arrow.title = state === "collapsed" ? "Expand" : "Collapse";

  head.onclick = () => {
    setState(state === "collapsed" ? "half" : "collapsed");
    refresh();
  };

  if (state === "collapsed") {
    const speak = head.createEl("span", {
      text: "🔊",
      cls: ["vocab-tracker-speak-icon", "vocab-tracker-row-speak"],
    });
    speak.title = "Pronounce";
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
      inp.placeholder = `Add ${label.toLowerCase()}…`;
      inp.onclick = (e) => e.stopPropagation();
      autoGrowTextarea(inp);
      inp.addEventListener("input", () => autoGrowTextarea(inp));
      inp.onchange = () => commitField(key, inp.value);
    } else {
      const inp = wrap.createEl("input", { cls });
      inp.type = "text";
      inp.value = value;
      inp.placeholder = `Add ${label.toLowerCase()}…`;
      inp.onclick = (e) => e.stopPropagation();
      inp.onchange = () => commitField(key, inp.value);
    }
  };

  // Synonyms shares the exact same auto-growing textarea treatment as
  // Definition/中文翻译, so a long list wraps flush-left instead of
  // truncating in a single-line input.
  mkField("Synonyms", "synonyms", { multiline: true });
  mkField("Definition", "definition", { multiline: true });
  mkField("中文翻译", "definitionZh", { multiline: true });

  if (state === "full") {
    // Antonyms is hidden entirely when empty rather than showing an
    // empty prompt box — unlike the other fields, it's not something
    // most words have.
    if (entry.antonyms) mkField("Antonyms", "antonyms");

    mkField("Example sentence (from note)", "example", { multiline: true });
    mkField("Grammar tips", "grammar");

    if (entry.source && entry.source.path) {
      const src = body.createEl("div", { cls: "vocab-tracker-source-link" });
      const name = entry.source.path.split("/").pop();
      src.textContent = `📍 ${name} : line ${entry.source.line + 1}`;
      src.title = "Jump to where this word was captured";
      src.onclick = (e) => {
        e.stopPropagation();
        plugin.jumpToSource(entry);
      };
    }

    body.createEl("div", { text: `Added: ${entry.added}`, cls: "vocab-tracker-meta" });
    body.createEl("div", {
      text: `Reviewed: ${entry.lastReviewed} (${entry.reviews}×)`,
      cls: "vocab-tracker-meta",
    });

    // Level — last, right below the Added/Reviewed lines. Comma-separated
    // free-form tags (e.g. "多益中級, 托福高級"), same field style as everything else.
    mkField("Level", "level", { multiline: true });
  }

  // ── Footer: more-info toggle · fetch · reviewed · speak ──────
  const footer = body.createEl("div", { cls: "vocab-tracker-row-footer" });

  const moreBtn = footer.createEl("span", {
    text: state === "full" ? "⌵" : "ℹ️",
    cls: "vocab-tracker-footer-icon",
  });
  moreBtn.title = state === "full" ? "Show less" : "Show more";
  moreBtn.onclick = (e) => {
    e.stopPropagation();
    setState(state === "full" ? "half" : "full");
    refresh();
  };

  const actions = footer.createEl("span", { cls: "vocab-tracker-row-footer-actions" });

  const fetchBtn = actions.createEl("span", { text: "🔄", cls: "vocab-tracker-footer-icon" });
  fetchBtn.title = "Fetch dictionary data (definition, synonyms, phonetic)";
  fetchBtn.onclick = async (e) => {
    e.stopPropagation();
    fetchBtn.textContent = "…";
    await plugin.enrichEntry(entry, { verbose: true });
    refresh();
  };

  const reviewBtn = actions.createEl("span", { text: "✓", cls: "vocab-tracker-footer-icon" });
  reviewBtn.title = "Mark as reviewed";
  reviewBtn.onclick = async (e) => {
    e.stopPropagation();
    entry.lastReviewed = nowStamp();
    entry.reviews += 1;
    await plugin.saveVocab();
    refresh();
  };

  const speak = actions.createEl("span", { text: "🔊", cls: "vocab-tracker-speak-icon" });
  speak.title = "Pronounce";
  speak.onclick = (e) => {
    e.stopPropagation();
    plugin.speakWord(entry);
  };
}
