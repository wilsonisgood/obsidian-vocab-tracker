import type { MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { ExpandState } from "../word/WordRow";
import { renderGroupedVocabList } from "../word/GroupedWordList";
import { t } from "../../core/i18n";

// ── vocab-dashboard renderer ───────────────────────────────────
export function renderDashboard(
  plugin: VocabTrackerPlugin,
  _source: string,
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext
) {
  const { entries } = plugin.vocabData;
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
    renderGroupedVocabList(plugin, listWrap, rows, collapsedGroups, expandState, () => draw(search.value));
  };

  draw("");
  search.oninput = () => draw(search.value);
}
