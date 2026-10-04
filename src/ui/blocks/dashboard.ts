import { MarkdownRenderChild, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { ExpandState } from "../word/WordRow";
import { renderGroupedVocabList } from "../word/GroupedWordList";
import { t } from "../../core/i18n";

// ── vocab-dashboard renderer ───────────────────────────────────
export function renderDashboard(
  plugin: VocabTrackerPlugin,
  _source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
) {
  const entries = plugin.store.entries;
  el.addClass("vocab-tracker-dashboard");

  if (entries.length === 0) {
    el.createEl("p", {
      text: t("dashboard.empty"),
      cls: "vocab-tracker-empty-state",
    });
    return;
  }

  // Stats bar
  const stats = el.createEl("div", { cls: "vocab-tracker-stats" });
  stats.createEl("span", {
    text:
      entries.length === 1
        ? t("dashboard.stat.word", { count: entries.length })
        : t("dashboard.stat.words", { count: entries.length }),
    cls: "vocab-tracker-stat-pill",
  });
  const tagCounts = new Map<string, number>();
  for (const e of entries) {
    for (const tag of e.level.split(",").map((t) => t.trim()).filter(Boolean)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  for (const [tag, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    stats.createEl("span", {
      text: `${tag}: ${n}`,
      cls: ["vocab-tracker-stat-pill", "is-accent"],
    });
  }

  // "開始複習 · 今日 n 張" (設計稿 L1) → opens the flashcards note.
  renderReviewButton(plugin, el, ctx);

  // Search
  const search = el.createEl("input", { cls: ["vocab-tracker-search-input", "vocab-tracker-field-box"] });
  search.placeholder = t("dashboard.search");

  const listWrap = el.createEl("div", { cls: "vocab-tracker-list" });
  const expandState: Map<string, ExpandState> = new Map();
  const collapsedGroups: Set<string> = new Set();

  // Grouped by source note title — lets a note that only holds a
  // vocab-dashboard block double as a per-note word list. Each group
  // heading is itself collapsible and shows its word count.
  const draw = (q: string) => {
    listWrap.empty();
    const rows = entries.filter((e) =>
      e.word.toLowerCase().includes(q.toLowerCase())
    );
    renderGroupedVocabList(plugin, listWrap, rows, collapsedGroups, expandState, () => draw(search.value), {
      showDue: true,
    });
  };

  draw("");
  search.oninput = () => draw(search.value);
}

// Only the due count is live (store events + once review logs load, since
// they feed the new-card cap); the word list itself keeps redrawing via its
// own refresh callbacks, so a background store change never wipes out a
// field the user is in the middle of editing.
function renderReviewButton(
  plugin: VocabTrackerPlugin,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
) {
  const btn = el.createEl("button", { cls: "vt-dash-review" });
  setIcon(btn.createSpan({ cls: "vt-dash-review-icon" }), "layers");
  const label = btn.createSpan();
  btn.onclick = () => void plugin.openFlashcards();

  const update = () => {
    const n = plugin.srs.queue().length;
    label.setText(n > 0 ? t("dashboard.startReview", { count: n }) : t("dashboard.startReview.none"));
    btn.toggleClass("mod-cta", n > 0);
  };
  update();

  const child = new MarkdownRenderChild(el);
  let alive = true;
  child.register(() => (alive = false));
  child.register(plugin.store.events.on("data:changed", update));
  ctx.addChild(child);
  void plugin.srs.ensureLoaded().then(() => {
    if (alive) update();
  });
}
