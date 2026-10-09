import { MarkdownRenderChild, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { ExpandState } from "../word/WordRow";
import { renderGroupedVocabList } from "../word/GroupedWordList";
import { t } from "../../core/i18n";
import { WordUi } from "../word/wordUi";
import { isListed, type IsListedContext } from "../../core/model/like";
import { likeChipOn, resolveWordlistSettings, tagEnabled } from "../../core/model/wordlists";
import { likeChipSpec, renderFilterChips, tagChipSpecs, tagCountInLibrary, likeCountInLibrary } from "../sidebar/examStrip";

// ── vocab-dashboard renderer ───────────────────────────────────
//
// 1006-2 #6 (取代 1006report.md #26 的「只看 Like」切換): the same isListed
// filter as the sidebar (亮著的考試標籤，或 Like chip 亮著且 liked 的字),
// shown and toggled through the same chip row component the sidebar uses
// (examStrip.ts) — one shared on/off state (#5), not a dashboard-local
// switch. The stats bar (word count, per-tag counts) follows the filtered
// set, not the raw search box query (同現狀：search 只是再篩一層顯示，不
// 影響統計).
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

  let query = "";

  const isListedCtx = (): IsListedContext => {
    const knownTags = plugin.wordlists.index.tags;
    const settings = resolveWordlistSettings(plugin.store.settings.wordlists);
    return {
      knownTags,
      isTagOn: (tag) => tagEnabled(settings, tag),
      likeOn: likeChipOn(settings),
    };
  };

  // #6 的篩選依據：跟側欄一樣的 isListed（標籤 chip ＋ Like chip）。
  const filteredEntries = (): VocabEntry[] => {
    const ctx2 = isListedCtx();
    // Read store.entries fresh each time (it's a filtered copy): the
    // snapshot above would keep showing a word deleted by unliking (w11 X).
    return plugin.store.entries.filter((e) => isListed(e, ctx2));
  };

  // "開始複習 · 今日 n 張" (設計稿 L1) — its own live-updating button, drawn
  // once (not inside drawStats/drawList, which redraw on every toggle).
  const reviewSlot = el.createDiv();
  renderReviewButton(plugin, reviewSlot, ctx);

  // #6: 跟側欄共用的 chip 列（標籤＋Like）取代舊的「只看 Like」切換。
  // updateWordlistSettings()（chip 的 onClick 最終都走到這）會
  // rerenderReadingViews()，整個 dashboard block 會被重新跑一次 —— 不用
  // 自己再掛 data:changed 監聽、也不用手動重畫，這個 div 畫一次就好。
  const chipsEl = el.createDiv();
  const wlSettings = resolveWordlistSettings(plugin.store.settings.wordlists);
  renderFilterChips(chipsEl, [
    ...tagChipSpecs(plugin, plugin.wordlists.index.tags, wlSettings, (tag) => tagCountInLibrary(plugin, tag)),
    likeChipSpec(plugin, wlSettings, likeCountInLibrary(plugin)),
  ]);

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
  };

  // Grouped by source note title — lets a note that only holds a
  // vocab-dashboard block double as a per-note word list. Each group
  // heading is itself collapsible and shows its word count.
  // Which words the list last showed — so a store change that adds or
  // removes one (an unlike-delete or undo from anywhere, incl. another copy
  // of this block) redraws it, while a plain field edit doesn't (w11 X).
  let shownIds = "";
  const listedIds = () => filteredEntries().map((e) => e.id).join(",");

  const drawList = () => {
    wordUi.beginRender();
    listWrap.empty();
    shownIds = listedIds();
    const rows = filteredEntries().filter((e) => e.word.toLowerCase().includes(query.toLowerCase()));
    renderGroupedVocabList(plugin, listWrap, rows, collapsedGroups, expandState, () => drawList(), {
      showDue: true,
      ui: wordUi,
      openWordPage: (entry) => void plugin.openWordPage(entry.id), // 1006-2 #13
    });
  };

  drawStats();
  drawList();
  let queued = false;
  owner.register(
    plugin.store.events.on("data:changed", () => {
      if (queued) return;
      queued = true;
      window.setTimeout(() => {
        queued = false;
        if (listedIds() === shownIds) return;
        drawStats();
        drawList();
      }, 0);
    })
  );
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
