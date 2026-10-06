import { MarkdownRenderChild, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { ExpandState } from "../word/WordRow";
import { renderGroupedVocabList } from "../word/GroupedWordList";
import { t } from "../../core/i18n";
import { WordUi } from "../word/wordUi";
import { isListed, type IsListedContext } from "../../core/model/like";
import { resolveWordlistSettings, tagEnabled } from "../../core/model/wordlists";

// ── vocab-dashboard renderer ───────────────────────────────────
//
// 1006report.md #26: the same 單字追蹤 filter as the sidebar — isListed
// (亮著的考試標籤，或 like 過的字) — plus a 「只看 Like」 switch that
// narrows it further to liked === true. The stats bar (word count, per-tag
// counts) follows the filtered set, not the raw search box query (同現狀：
// search 只是再篩一層顯示，不影響統計).
export function renderDashboard(
  plugin: VocabTrackerPlugin,
  _source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
) {
  const allEntries = plugin.store.entries;
  el.addClass("vt-dash");

  if (allEntries.length === 0) {
    el.createEl("p", {
      text: t("dashboard.empty"),
      cls: "vt-dash-empty",
    });
    return;
  }

  const owner = new MarkdownRenderChild(el);
  ctx.addChild(owner);
  const wordUi = new WordUi(owner);
  const expandState: Map<string, ExpandState> = new Map();
  const collapsedGroups: Set<string> = new Set();

  let onlyLiked = false;
  let query = "";

  const isListedCtx = (): IsListedContext => {
    const knownTags = plugin.wordlists.index.tags;
    return {
      knownTags,
      isTagOn: (tag) => tagEnabled(resolveWordlistSettings(plugin.store.settings.wordlists), tag),
    };
  };

  // #26 的篩選依據：跟側欄一樣的 isListed，再疊上「只看 Like」。
  const filteredEntries = (): VocabEntry[] => {
    const ctx2 = isListedCtx();
    let list = allEntries.filter((e) => isListed(e, ctx2));
    if (onlyLiked) list = list.filter((e) => e.liked === true);
    return list;
  };

  // "開始複習 · 今日 n 張" (設計稿 L1) — its own live-updating button, drawn
  // once (not inside drawStats/drawList, which redraw on every toggle).
  const reviewSlot = el.createDiv();
  renderReviewButton(plugin, reviewSlot, ctx);

  const statsEl = el.createDiv();
  const search = el.createEl("input", { cls: ["vt-dash-search", "vt-field-box"] });
  search.placeholder = t("dashboard.search");
  const listWrap = el.createEl("div", { cls: "vt-word-list" });

  const drawStats = () => {
    statsEl.empty();
    const entries = filteredEntries();
    const stats = statsEl.createEl("div", { cls: "vt-dash-stats" });
    stats.createEl("span", {
      text:
        entries.length === 1
          ? t("dashboard.stat.word", { count: entries.length })
          : t("dashboard.stat.words", { count: entries.length }),
      cls: "vt-stat-pill",
    });
    const tagCounts = new Map<string, number>();
    for (const e of entries) {
      for (const tag of e.level.split(",").map((s) => s.trim()).filter(Boolean)) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    for (const [tag, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
      stats.createEl("span", {
        text: `${tag}: ${n}`,
        cls: ["vt-stat-pill", "is-accent"],
      });
    }

    const likeToggle = stats.createEl("span", {
      text: t("like.filter.onlyLiked"),
      cls: ["vt-stat-pill", "vt-dash-like-toggle"],
    });
    likeToggle.toggleClass("is-accent", onlyLiked);
    likeToggle.style.cursor = "pointer";
    likeToggle.setAttr("role", "button");
    likeToggle.setAttr("aria-pressed", String(onlyLiked));
    likeToggle.onclick = () => {
      onlyLiked = !onlyLiked;
      drawStats();
      drawList();
    };
  };

  // Grouped by source note title — lets a note that only holds a
  // vocab-dashboard block double as a per-note word list. Each group
  // heading is itself collapsible and shows its word count.
  const drawList = () => {
    wordUi.beginRender();
    listWrap.empty();
    const rows = filteredEntries().filter((e) => e.word.toLowerCase().includes(query.toLowerCase()));
    renderGroupedVocabList(plugin, listWrap, rows, collapsedGroups, expandState, () => drawList(), {
      showDue: true,
      ui: wordUi,
    });
  };

  drawStats();
  drawList();
  search.oninput = () => {
    query = search.value;
    drawList();
  };
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
