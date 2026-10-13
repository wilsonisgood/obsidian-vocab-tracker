import type { Component } from "obsidian";
import { t } from "../../../core/i18n";
import type { PolyCategory, PolyFilter } from "../../../core/model/poly";
import type { PracticeQuestion } from "../../../core/model/practice";
import { parsePolyFilter, sensesInFilter } from "../../../core/poly/catalog";
import type { AiStatus } from "../../../services/ai/AiService";
import { aiErrorBox } from "../../kit/aiDebug";
import { isAbort, learnErrorText } from "../learnUi";
import { renderFilterBar } from "./filterBar";
import type { MountPlayer } from "./grammarTab";
import { renderMistakesPanel } from "./mistakesPanel";
import type { PlayerHandle, PlayerQuestion } from "./playerTypes";
import {
  DOT_CHAR,
  filterToValue,
  initialCategory,
  levelLabel,
  polyGroups,
  polyQuickPicks,
  polySummary,
  POLY_REFILL_THRESHOLD,
  senseSections,
  testedSenseIds,
  toggleExcluded,
  valueToFilter,
  type SenseStats,
} from "./polyTabModel";
import { toPlayerQuestion } from "./scenarioQuestionView";
import type { ScenarioPracticeApi } from "./scenarioTypes";
import type { PracticeTabDef } from "./types";

// 常用字 tab of the practice hub (第十七波 Q): filter bar (類別 / 字 / 級數 +
// quick picks), the collapsible sense map with its ticks, the scenario
// player over the "poly" pool and the shared 錯題區 below.

export interface PolyTabDeps {
  // ScenarioService (S).
  api: ScenarioPracticeApi;
  mountPlayer: MountPlayer;
  // Resolves when the LearnerStore has loaded.
  ready(): Promise<void>;
  // Words the learner saved (VocabEntry.word); 我收錄過的 = ∩ POLY_WORDS.
  savedWords(): string[];
  // weakFocuses(learner.learnEvents(), { track: "poly", ... }) → sense ids.
  weakSenseIds(): string[];
  // LearnModel / LearnerStore: counts and the latest results of one sense.
  senseStats(id: string): SenseStats;
  aiStatus(): AiStatus;
}

export function polyTab(deps: PolyTabDeps): PracticeTabDef {
  return {
    id: "poly",
    label: t("practice.poly.label"),
    order: 2,
    mount(el, ctx) {
      el.addClass("vt-pr-poly");
      let alive = true;
      ctx.component.register(() => (alive = false));
      void deps.ready().then(() => {
        if (alive) new PolyTabView(el, deps, ctx.filters, ctx.component).start();
      });
    },
  };
}

class PolyTabView {
  private filter: PolyFilter;
  private category: PolyCategory;
  private ctrl: AbortController | null = null;
  private player!: PlayerHandle;
  private noteEl!: HTMLElement;
  private mapEl!: HTMLElement;
  private mapOpen = true;
  private alive = true;
  private byId = new Map<string, PracticeQuestion>();

  constructor(
    private el: HTMLElement,
    private deps: PolyTabDeps,
    private filters: { get(t: "poly"): unknown; set(t: "poly", v: unknown): void },
    private owner: Component
  ) {
    this.filter = parsePolyFilter(filters.get("poly"));
    this.category = initialCategory(this.filter);
  }

  start(): void {
    const { api } = this.deps;
    this.owner.register(() => {
      this.alive = false;
      this.ctrl?.abort();
    });

    const barEl = this.el.createDiv();
    this.renderBar(barEl);
    this.mapEl = this.el.createDiv({ cls: "vt-pr-poly-map" });
    this.renderMap();
    this.noteEl = this.el.createDiv({ cls: "vt-pr-grammar-note" });
    const playerEl = this.el.createDiv({ cls: "vt-pr-grammar-player" });

    this.player = this.deps.mountPlayer(
      playerEl,
      {
        questions: () => this.questions(),
        emptyText: () => this.emptyText(),
        callbacks: {
          onAnswer: (a) => {
            const q = this.byId.get(a.question.id);
            if (q) api.answer(q, a.optionId, a.correct, { hinted: a.hinted, fromMistakes: false });
            this.afterAnswer();
          },
          onSkip: (pq) => {
            const q = this.byId.get(pq.id);
            if (q) api.skip(q);
            this.maybeRefill();
          },
          onRetire: (pq) => {
            const q = this.byId.get(pq.id);
            if (q) api.retire(q);
            this.maybeRefill();
          },
        },
      },
      this.owner
    );

    renderMistakesPanel(
      this.el.createDiv(),
      {
        api,
        track: "poly",
        mountPlayer: this.deps.mountPlayer,
        toPlayer: (q) => toPlayerQuestion(q, {}),
      },
      this.owner
    );

    this.owner.register(
      api.events.on("pool:change", (track) => {
        if (track !== "poly") return;
        this.player.refresh();
      })
    );
    this.owner.register(
      api.events.on("refill:start", (track) => {
        if (track === "poly") this.player.refresh();
      })
    );
    this.owner.register(
      api.events.on("refill:end", ({ track, error }) => {
        if (track !== "poly") return;
        this.showError(error);
        this.player.refresh();
      })
    );

    this.applyScope();
    this.player.refresh();
    this.refill();
  }

  // ── Filter ─────────────────────────────────────────────────────

  private renderBar(barEl: HTMLElement): void {
    const { deps } = this;
    const groups = polyGroups(this.category);
    const quick = polyQuickPicks({ saved: deps.savedWords(), weakSenseIds: deps.weakSenseIds() });
    const bar = renderFilterBar(barEl, {
      groups,
      quick,
      value: filterToValue(this.filter, this.category),
      summary: (v) => polySummary(valueToFilter(v, this.filter).filter),
      onChange: (v) => {
        const next = valueToFilter(v, this.filter);
        this.filter = next.filter;
        this.category = next.category;
        this.filters.set("poly", this.filter);
        // The 字 chips follow the category.
        groups.splice(0, groups.length, ...polyGroups(this.category));
        bar.update(filterToValue(this.filter, this.category));
        this.onFilterChanged();
      },
    });
  }

  private onFilterChanged(): void {
    this.clearError();
    this.renderMap();
    this.applyScope();
    this.player.refresh();
    this.refill();
  }

  // The pool keeps only questions about senses this filter tests.
  private applyScope(): void {
    this.deps.api.applyScope("poly", testedSenseIds(this.filter));
  }

  // ── Sense map ──────────────────────────────────────────────────

  private renderMap(): void {
    const el = this.mapEl;
    el.empty();
    const sections = senseSections(this.filter, (id) => this.deps.senseStats(id));
    if (sections.length === 0) {
      el.addClass("is-hidden");
      return;
    }
    el.removeClass("is-hidden");
    const head = el.createEl("button", {
      cls: "vt-pr-poly-map-head",
      attr: { type: "button", "aria-expanded": String(this.mapOpen) },
    });
    head.createSpan({ text: t("practice.poly.map") });
    head
      .createSpan({ cls: "vt-pr-chevron", text: "›", attr: { "aria-hidden": "true" } })
      .toggleClass("is-open", this.mapOpen);
    head.addEventListener("click", () => {
      this.mapOpen = !this.mapOpen;
      this.renderMap();
    });
    if (!this.mapOpen) return;
    const body = el.createDiv({ cls: "vt-pr-poly-map-body" });
    for (const sec of sections) {
      const box = body.createDiv({ cls: "vt-pr-poly-word" });
      box.createDiv({ cls: "vt-pr-poly-word-title", text: sec.word });
      for (const r of sec.rows) {
        const row = box.createEl("label", { cls: "vt-pr-poly-sense" });
        row.toggleClass("is-off", !r.checked || r.outOfLevel);
        const cb = row.createEl("input", { attr: { type: "checkbox" } });
        cb.checked = r.checked;
        cb.addEventListener("change", () => {
          this.filter = toggleExcluded(this.filter, r.id);
          this.filters.set("poly", this.filter);
          this.onFilterChanged();
        });
        const main = row.createDiv({ cls: "vt-pr-poly-sense-main" });
        const top = main.createDiv({ cls: "vt-pr-poly-sense-top" });
        top.createSpan({ cls: "vt-pr-poly-zh", text: r.zh });
        top.createSpan({ cls: "vt-pr-poly-eg", text: r.example });
        main.createDiv({ cls: "vt-pr-poly-cue", text: r.cue });
        const meta = row.createDiv({ cls: "vt-pr-poly-meta" });
        meta.createSpan({ cls: "vt-pr-poly-level", text: levelLabel(r.level) });
        meta.createSpan({
          cls: ["vt-pr-poly-dot", `is-${r.dot}`],
          text: DOT_CHAR[r.dot],
          attr: { title: t(`practice.poly.dot.${r.dot}`) },
        });
      }
    }
  }

  // ── Pool ───────────────────────────────────────────────────────

  private questions(): PlayerQuestion[] {
    this.byId.clear();
    const out: PlayerQuestion[] = [];
    for (const q of this.deps.api.poolQuestions("poly")) {
      this.byId.set(q.id, q);
      out.push(toPlayerQuestion(q, {}));
    }
    return out;
  }

  private afterAnswer(): void {
    this.renderMap();
    this.maybeRefill();
  }

  private maybeRefill(): void {
    if (this.deps.api.poolQuestions("poly").length <= POLY_REFILL_THRESHOLD) this.refill();
  }

  private refill(): void {
    const { api } = this.deps;
    if (!this.alive || api.isRefilling("poly")) return;
    const { tested, reference } = sensesInFilter(this.filter);
    if (tested.length === 0) return;
    if (api.poolQuestions("poly").length > POLY_REFILL_THRESHOLD) return;
    this.ctrl = new AbortController();
    api.refill({ track: "poly", tested, reference }, { signal: this.ctrl.signal }).catch((e: unknown) => this.showError(e));
  }

  private emptyText(): string {
    if (this.filter.words.length === 0) return t("practice.poly.pickWord");
    if (this.deps.api.isRefilling("poly")) return t("practice.poly.preparing");
    const s = this.deps.aiStatus();
    if (s === "disabled") return t("practice.poly.aiOff");
    if (s === "no_key") return t("practice.poly.noKey");
    if (s === "offline") return t("practice.poly.offline");
    return t("practice.poly.none");
  }

  private showError(error: unknown): void {
    this.clearError();
    if (!error || isAbort(error) || !this.alive) return;
    this.noteEl.appendChild(aiErrorBox({ text: learnErrorText(error), error }));
  }

  private clearError(): void {
    this.noteEl?.empty();
  }
}
