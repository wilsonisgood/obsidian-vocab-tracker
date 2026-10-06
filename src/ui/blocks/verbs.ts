import { Component, MarkdownRenderChild, MarkdownRenderer, Notice, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import { isListed, type IsListedContext } from "../../core/model/like";
import { POS_KEYS, type PosKey, type UsageBlock } from "../../core/model/usage";
import { likeChipOn, resolveWordlistSettings, tagEnabled } from "../../core/model/wordlists";
import { usagePosHeadings } from "../../services/export/labels";
import { WordIndex } from "../../services/learn/wordIndex";
import { aiErrorBox } from "../kit/aiDebug";
import { emptyState } from "../kit/emptyState";
import { inlineNote } from "../kit/inlineNote";
import { bindPronounceButton } from "../kit/pronounce";
import { t } from "../../core/i18n";
import { guardReadingClicks, isAbort, learnButton, learnErrorText, renderLearnAiGate, wordChip } from "./learnUi";
import { likeChipSpec, renderFilterChips, tagChipSpecs, tagCountInLibrary, likeCountInLibrary } from "../sidebar/examStrip";
import {
  entriesWithUsage,
  filterByActivePos,
  filterVerbs,
  parseVerbsParams,
  phoneticLine,
  pickVerb,
  posChipsIn,
  usageDates,
  usageMeta,
  usageRows,
  type VerbsParams,
} from "./verbsModel";

// ── vocab-verbs code block (規劃書 06 §7.3, §9.6; 設計稿 L6; wave 8 U2 —
// 用法總表，任何詞性，1006-2 回饋 #22) ──
//
//   ```vocab-verbs
//   word: sugarcoat     # single-verb mode, e.g. on a word page (optional)
//   ```
//
// Left: every word that has a usage block for some part of speech (not
// verb-only any more), with a filter and a pos chip row; right: the
// selected word's usage, one subsection per part of speech, each with its
// own 收藏 and 重新產生. `word=` mode shows one word's every part of
// speech with no list.

type FavoriteKey = "favorite" | "favorited" | "unfavorite" | "savedTo" | "rowFavorited";

function l(key: FavoriteKey, path?: string): string {
  return path === undefined ? t(`learn.verb.${key}`) : t(`learn.verb.${key}`, { path });
}

// 「n. v. adj. adv. …」 — language-neutral, same abbreviation regardless of
// the plugin's locale (1006-2 #22).
const POS_ABBR: Record<PosKey, string> = {
  n: "n.",
  v: "v.",
  adj: "adj.",
  adv: "adv.",
  prep: "prep.",
  conj: "conj.",
  pron: "pron.",
  interj: "interj.",
};

export function renderVerbs(
  plugin: VocabTrackerPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  ctx.addChild(new VerbsBlock(el, plugin, parseVerbsParams(source), ctx.sourcePath));
}

class VerbsBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private filterEl: HTMLElement | null = null;
  private posChipsEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private detailEl!: HTMLElement;
  private query = "";
  private selectedId: string | undefined;
  // 詞性 chip 被按淡的集合 (1006-2 #22)：只存在這個 block 實例裡，不跨裝置。
  private dimmedPos = new Set<PosKey>();
  // Last failure per entry, shown under its usage until the next try
  // (with what was thrown, for the debug box).
  private errors = new Map<string, { text: string; cause: unknown }>();
  // AI text (pattern.meaningZh / .example) is Markdown (1006 #22); each
  // renderDetail() gets a fresh scope so the previous render's listeners
  // are dropped (same lifecycle trivia.ts's favorites list uses).
  private markdownScope: Component | null = null;

  constructor(
    containerEl: HTMLElement,
    private plugin: VocabTrackerPlugin,
    private params: VerbsParams,
    private sourcePath: string
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-verbs"] });
    guardReadingClicks(this, this.root);

    if (this.params.word) {
      this.root.addClass("is-single");
      this.detailEl = this.root.createDiv({ cls: "vt-verb-detail" });
    } else {
      this.buildLayout();
    }

    // The filter input is built once and never redrawn, so typing in it
    // survives store events.
    const redraw = () => this.render();
    this.register(this.plugin.store.events.on("data:changed", redraw));
    this.register(this.plugin.verbs.events.on("verb:busy", redraw));
    // 收藏 (寫入單字頁) lives in learn.json.
    this.register(this.plugin.learn.events.on("verbFavorite:upsert", redraw));
    this.register(this.plugin.learn.events.on("learn:reloaded", redraw));
    this.render();
    void this.plugin.learn.ensureLoaded().then(redraw);
  }

  // 跟側欄一樣的 isListed 篩選 (dashboard.ts 的 isListedCtx 同款：標籤 chip
  // ＋ Like chip，共用同一份設定 (1006-2 #5))。
  private isListedCtx(): IsListedContext {
    const knownTags = this.plugin.wordlists.index.tags;
    const settings = resolveWordlistSettings(this.plugin.store.settings.wordlists);
    return {
      knownTags,
      isTagOn: (tag) => tagEnabled(settings, tag),
      likeOn: likeChipOn(settings),
    };
  }

  private anyFavorited(entryId: string): boolean {
    return this.plugin.learn.loaded && this.plugin.learn.usageFavoritesFor(entryId).length > 0;
  }

  private toggleFavorite(e: VocabEntry, pos: PosKey): void {
    const verbs = this.plugin.verbs;
    if (verbs.isFavorite(e.id, pos)) return verbs.unfavorite(e.id, pos);
    verbs.favorite(e, pos);
    // Saving it puts the usage on the word's page (created if needed).
    const page = this.plugin.exporter.wordPagePath(e.id, e.word);
    new Notice(l("savedTo", page.split("/").slice(-2).join("/")));
  }

  private buildLayout(): void {
    const grid = this.root.createDiv({ cls: "vt-verbs-grid" });
    const side = grid.createDiv({ cls: "vt-verbs-side" });
    // 標籤＋Like 的 chip 列：跟側欄／vocab-list dashboard 共用同一份元件和
    // 設定 (1006-2 #5, dashboard.ts 73-76 同款)。toggle 最終都走
    // plugin.updateWordlistSettings()，會 rerenderReadingViews() 讓整個
    // block 重新跑一次，不用自己再畫一次。
    this.filterEl = side.createDiv({ cls: "vt-verbs-tag-chips" });
    const wlSettings = resolveWordlistSettings(this.plugin.store.settings.wordlists);
    renderFilterChips(this.filterEl, [
      ...tagChipSpecs(this.plugin, this.plugin.wordlists.index.tags, wlSettings, (tag) => tagCountInLibrary(this.plugin, tag)),
      likeChipSpec(this.plugin, wlSettings, likeCountInLibrary(this.plugin)),
    ]);
    this.posChipsEl = side.createDiv({ cls: "vt-verbs-pos-chips" });
    const search = side.createDiv({ cls: "vt-verbs-search" });
    setIcon(search.createSpan({ cls: "vt-verbs-search-icon" }), "search");
    const input = search.createEl("input", { cls: "vt-verbs-filter", type: "search" });
    input.placeholder = t("learn.verb.filter");
    input.addEventListener("input", () => {
      this.query = input.value;
      this.render();
    });
    this.countEl = side.createDiv({ cls: "vt-verbs-count" });
    this.listEl = side.createDiv({ cls: "vt-verbs-list" });
    this.detailEl = grid.createDiv({ cls: "vt-verb-detail" });
  }

  private renderPosChips(chips: readonly PosKey[]): void {
    const host = this.posChipsEl;
    if (!host) return;
    host.empty();
    if (!chips.length) return;
    const headings = usagePosHeadings();
    for (const pos of chips) {
      const chip = host.createEl("button", { cls: "vt-verbs-pos-chip" });
      const dim = this.dimmedPos.has(pos);
      chip.toggleClass("is-dim", dim);
      chip.setAttr("aria-pressed", String(!dim));
      chip.title = headings[pos];
      chip.setText(POS_ABBR[pos]);
      chip.addEventListener("click", () => {
        if (this.dimmedPos.has(pos)) this.dimmedPos.delete(pos);
        else this.dimmedPos.add(pos);
        this.render();
      });
    }
  }

  private render(): void {
    if (this.params.word) return this.renderSingle(this.params.word);

    // 1006-2 #22: 只列產生過用法的字（不論詞性），再套用側欄同款的
    // isListed，然後是搜尋框，最後是詞性 chip（「一個字只要有任一亮著的
    // 詞性有內容就列出」）。
    const listedCtx = this.isListedCtx();
    const learned = entriesWithUsage(this.plugin.store.entries).filter((e) => isListed(e, listedCtx));
    const afterQuery = filterVerbs(learned, this.query);
    const chips = posChipsIn(afterQuery);
    this.renderPosChips(chips);
    const active = new Set(chips.filter((p) => !this.dimmedPos.has(p)));
    const shown = filterByActivePos(afterQuery, active);
    this.selectedId = pickVerb(shown, this.selectedId);
    this.root.toggleClass("is-empty", !learned.length);

    if (this.countEl) this.countEl.setText(t("learn.verb.count", { n: learned.length }));
    const list = this.listEl;
    if (list) {
      list.empty();
      if (learned.length && !shown.length) list.createDiv({ cls: "vt-verbs-nomatch", text: t("learn.verb.noMatch") });
      for (const e of shown) {
        const row = list.createEl("button", { cls: "vt-verbs-row" });
        row.toggleClass("is-active", e.id === this.selectedId);
        row.setAttr("aria-pressed", String(e.id === this.selectedId));
        row.createSpan({ cls: "vt-verbs-row-word", text: e.word });
        if (this.plugin.verbs.isBusy(e.id)) setIcon(row.createSpan({ cls: "vt-verbs-row-icon is-busy" }), "loader");
        else if (this.anyFavorited(e.id)) {
          const icon = row.createSpan({ cls: "vt-verbs-row-icon is-saved" });
          setIcon(icon, "bookmark-check");
          icon.setAttr("aria-label", l("rowFavorited"));
        } else {
          const icon = row.createSpan({ cls: "vt-verbs-row-icon" });
          setIcon(icon, "check");
          icon.setAttr("aria-label", t("learn.verb.hasUsage"));
        }
        row.addEventListener("click", () => {
          this.selectedId = e.id;
          this.render();
        });
      }
    }

    this.detailEl.empty();
    if (!learned.length) {
      this.detailEl.appendChild(emptyState({ icon: "list", title: t("learn.verb.none.title"), body: t("learn.verb.none.body") }));
      return;
    }
    const selected = shown.find((e) => e.id === this.selectedId);
    if (selected) this.renderDetail(selected);
  }

  private renderSingle(word: string): void {
    this.detailEl.empty();
    const entry = new WordIndex(this.plugin.store.entries).find(word);
    if (!entry) {
      this.detailEl.appendChild(inlineNote({ text: t("learn.notFound", { word }) }));
      return;
    }
    // 1006-2 #22: 單字模式顯示這個字所有詞性的用法 — 不再只限動詞
    // (VerbUsageService.canGenerate() 本來就允許任何活著的字)。
    this.renderDetail(entry);
  }

  // ── Right pane ────────────────────────────────────────────────

  private renderDetail(e: VocabEntry): void {
    const el = this.detailEl;
    const head = el.createDiv({ cls: "vt-verb-head" });
    head.createSpan({ cls: "vt-verb-word", text: e.word });
    const phon = phoneticLine(e);
    if (phon) head.createSpan({ cls: "vt-verb-phon", text: phon });
    const speak = head.createEl("button", { cls: "vt-verb-speak clickable-icon" });
    setIcon(speak, "volume-2");
    speak.setAttr("aria-label", t("learn.verb.speak"));
    bindPronounceButton(speak, e);

    // 出處跟詞性無關，整個字只放一次；每個詞性自己的加入/更新日期在它的
    // 小節裡 (usageDates，見下)。
    const source = usageMeta(e, undefined).source;
    if (source) el.createDiv({ cls: "vt-verb-meta", text: t("learn.verb.meta.source", { source }) });

    const busy = this.plugin.verbs.isBusy(e.id);
    if (busy) {
      const box = el.createDiv({ cls: "vt-learn-busy" });
      const line = box.createDiv({ cls: "vt-learn-busy-text" });
      setIcon(line.createSpan({ cls: "vt-learn-busy-icon" }), "sparkles");
      line.createSpan({ text: t("learn.verb.generating", { word: e.word }) });
      learnButton(box, { label: t("learn.stop"), icon: "square", onClick: () => this.plugin.verbs.stop(e.id) });
    }

    const error = this.errors.get(e.id);
    if (error && !busy) el.appendChild(aiErrorBox({ text: error.text, error: error.cause }));

    if (this.markdownScope) {
      this.removeChild(this.markdownScope);
      this.markdownScope = null;
    }

    const usages = this.plugin.verbs.usages(e);
    const posList = POS_KEYS.filter((p) => usages[p]);

    if (posList.length) {
      const scope = (this.markdownScope = this.addChild(new Component()));
      for (const pos of posList) this.renderPosSection(el, e, pos, usages[pos]!, scope, busy);
      return;
    }

    if (busy) return;
    if (renderLearnAiGate(el, this.plugin)) return;
    el.appendChild(
      emptyState({
        icon: "sparkles",
        title: t("learn.verb.empty.title", { word: e.word }),
        body: t("learn.verb.empty.body"),
        action: { label: t("learn.verb.generate"), icon: "sparkles", onClick: () => void this.generate(e) },
      })
    );
  }

  // One part of speech's usage: its own heading, patterns/related, meta
  // (加入/更新日期) and actions (收藏 / 重新產生) (1006-2 #19 #22).
  private renderPosSection(
    el: HTMLElement,
    e: VocabEntry,
    pos: PosKey,
    usage: UsageBlock,
    scope: Component,
    entryBusy: boolean
  ): void {
    const section = el.createDiv({ cls: "vt-verb-pos" });
    section.createDiv({ cls: "vt-verb-pos-title", text: usagePosHeadings()[pos] });

    const dates = usageDates(usage);
    if (dates) section.createDiv({ cls: "vt-verb-meta", text: dates });

    const { patterns, related } = usageRows(usage);
    const list = section.createDiv({ cls: "vt-verb-patterns" });
    for (const p of patterns) {
      const row = list.createDiv({ cls: "vt-verb-pattern" });
      row.createSpan({ cls: "vt-verb-pattern-p", text: p.pattern });
      const right = row.createDiv({ cls: "vt-verb-pattern-body" });
      if (p.meaningZh) {
        const zh = right.createDiv({ cls: "vt-verb-pattern-zh" });
        void MarkdownRenderer.render(this.plugin.app, p.meaningZh, zh, this.sourcePath, scope);
      }
      if (p.example) {
        const ex = right.createDiv({ cls: "vt-verb-pattern-ex" });
        void MarkdownRenderer.render(this.plugin.app, p.example, ex, this.sourcePath, scope);
      }
    }
    if (related.length) {
      section.createDiv({ cls: "vt-verb-section", text: t("learn.verb.related") });
      const chipsEl = section.createDiv({ cls: "vt-verb-related" });
      const index = new WordIndex(this.plugin.store.entries);
      for (const r of related) {
        // A similar expression that's already in the list opens its card.
        const known = index.find(r.phrase);
        const chip = wordChip(chipsEl, this.plugin, known && known.id !== e.id ? known : undefined, "vt-verb-related-chip");
        chip.createSpan({ text: r.phrase });
        if (r.zh) chip.createSpan({ cls: "vt-verb-related-zh", text: r.zh });
      }
    }

    if (entryBusy) return;
    const actions = section.createDiv({ cls: "vt-verb-actions" });
    // 收藏 = 寫入單字頁 (design L6; 1005 回饋 #4), 按詞性 (1006-2 #21).
    const saved = this.plugin.verbs.isFavorite(e.id, pos);
    const fav = learnButton(actions, {
      label: l(saved ? "favorited" : "favorite"),
      icon: saved ? "bookmark-check" : "bookmark",
      onClick: () => this.toggleFavorite(e, pos),
    });
    fav.addClass("vt-verb-favorite");
    fav.toggleClass("is-active", saved);
    fav.setAttr("aria-pressed", String(saved));
    if (saved) fav.title = l("unfavorite");
    fav.disabled = !this.plugin.learn.loaded;
    const regen = learnButton(actions, {
      label: t("learn.verb.regenerate"),
      icon: "refresh-cw",
      onClick: () => void this.regenerate(e, pos),
    });
    const status = this.plugin.ai.status();
    if (status !== "ready") {
      regen.disabled = true;
      const offline = status === "offline";
      actions.appendChild(
        inlineNote({ tone: offline ? "offline" : "info", text: t(offline ? "learn.ai.offline" : "learn.ai.body") })
      );
    }
  }

  // Generates every part of speech at once (empty state only — once a
  // word has at least one, each section's own 「重新產生」 (regenerate()
  // below) covers it instead).
  private async generate(e: VocabEntry): Promise<void> {
    if (this.plugin.verbs.isBusy(e.id)) return;
    this.errors.delete(e.id);
    try {
      await this.plugin.verbs.generateAll(e);
    } catch (err) {
      if (!isAbort(err)) {
        console.error("Vocab Tracker: verb usage failed", err);
        this.errors.set(e.id, { text: learnErrorText(err), cause: err });
      }
    }
    // verb:busy already redrew; draw once more for the error.
    this.render();
  }

  // 「重新產生」 on one part of speech's section — only that pos is replaced.
  private async regenerate(e: VocabEntry, pos: PosKey): Promise<void> {
    if (this.plugin.verbs.isBusy(e.id)) return;
    this.errors.delete(e.id);
    try {
      await this.plugin.verbs.regenerate(e, pos);
    } catch (err) {
      if (!isAbort(err)) {
        console.error("Vocab Tracker: verb usage failed", err);
        this.errors.set(e.id, { text: learnErrorText(err), cause: err });
      }
    }
    this.render();
  }
}
