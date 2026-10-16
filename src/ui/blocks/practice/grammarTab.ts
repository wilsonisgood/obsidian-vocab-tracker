import type { Component } from "obsidian";
import { t } from "../../../core/i18n";
import { GRAMMAR_TOPICS } from "../../../core/grammar/catalog";
import { dueTopics } from "../../../core/grammar/progress";
import type { GrammarProgress, GrammarSighting } from "../../../core/model/grammar";
import type { CefrLevel } from "../../../core/model/settings";
import type { AiStatus } from "../../../services/ai/AiService";
import {
  parseGrammarFilter,
  type GrammarFilter,
  type GrammarPracticeApi,
  type GrammarQuestionLike,
} from "../../grammar/practiceTypes";
import { learnButton } from "../learnUi";
import { mistakeLine } from "./mistakesPanelModel";
import { renderFilterBar } from "./filterBar";
import type { FilterGroup } from "./filterBarModel";
import {
  filterToValue,
  grammarGroups,
  grammarQuickPicks,
  grammarSummary,
  groupMistakes,
  mistakeCount,
  recentSightingTopics,
  REFILL_THRESHOLD,
  toPlayerQuestion,
  valueToFilter,
  type MistakeGroupView,
} from "./grammarTabModel";
import type { PlayerHandle, PlayerOptions, PlayerQuestion } from "./playerTypes";
import { RefillController } from "./refillGuardModel";
import { renderRefillError } from "./refillUi";
import type { PracticeTabDef } from "./types";

// 文法 tab of the practice hub (第十六波 H): the shared filter bar (階段 /
// 主題 + quick picks), the scenario player over the pool G keeps, and a
// folded 錯題區 below whose groups are redone in place with the same player.

export type MountPlayer = (el: HTMLElement, opts: PlayerOptions, owner: Component) => PlayerHandle;

export interface GrammarTabDeps {
  // QuestionService (G).
  api: GrammarPracticeApi;
  // P's mountScenarioPlayer.
  mountPlayer: MountPlayer;
  // Resolves when GrammarStore and LearnerStore have loaded.
  ready(): Promise<void>;
  // LearnerProfile.level.
  level(): CefrLevel | "";
  // grammarSightings(plugin.threads.paragraphThreads()).
  sightings(): GrammarSighting[];
  // GrammarStore.progress.
  progress(topicId: string): GrammarProgress | undefined;
  // weakFocuses(learner.learnEvents(), { track: "grammar", ... }) → topic ids.
  weakTopicIds(): string[];
  aiStatus(): AiStatus;
  now?(): Date;
}

export function grammarTab(deps: GrammarTabDeps): PracticeTabDef {
  return {
    id: "grammar",
    label: t("practice.grammar.label"),
    order: 1,
    mount(el, ctx) {
      el.addClass("vt-pr-grammar");
      let alive = true;
      ctx.component.register(() => (alive = false));
      void deps.ready().then(() => {
        if (alive) new GrammarTabView(el, deps, ctx.filters, ctx.component).start();
      });
    },
  };
}

class GrammarTabView {
  private filter: GrammarFilter;
  private ctl!: RefillController;
  private player!: PlayerHandle;
  private noteEl!: HTMLElement;
  private mistakeCountEl!: HTMLElement;
  private sweeping = false;
  private alive = true;
  private byId = new Map<string, GrammarQuestionLike>();

  constructor(
    private el: HTMLElement,
    private deps: GrammarTabDeps,
    private filters: { get(t: "grammar"): unknown; set(t: "grammar", v: unknown): void },
    private owner: Component
  ) {
    this.filter = parseGrammarFilter(filters.get("grammar"));
  }

  start(): void {
    const { api } = this.deps;
    this.ctl = new RefillController({
      poolSize: () => api.poolQuestions().length,
      threshold: REFILL_THRESHOLD,
      run: (signal) => this.refill(signal),
    });
    this.owner.register(() => {
      this.alive = false;
      this.ctl.dispose();
    });

    const barEl = this.el.createDiv();
    this.renderBar(barEl);
    this.noteEl = this.el.createDiv({ cls: "vt-pr-grammar-note" });
    const playerEl = this.el.createDiv({ cls: "vt-pr-grammar-player" });

    this.player = this.deps.mountPlayer(
      playerEl,
      {
        questions: () => this.questions(),
        emptyText: () => this.emptyText(),
        emptyAction: () => this.emptyAction(),
        callbacks: {
          onAnswer: (a) => {
            const q = this.byId.get(a.question.id);
            if (q) api.answer(q, a.optionId, a.correct, { hinted: a.hinted, fromMistakes: false });
            this.ctl.afterAction();
          },
          onSkip: (pq) => {
            const q = this.byId.get(pq.id);
            if (q) api.skip(q);
            this.ctl.afterAction();
          },
          onRetire: (pq) => {
            const q = this.byId.get(pq.id);
            if (q) api.retire(q);
            this.ctl.afterAction();
          },
        },
      },
      this.owner
    );

    this.renderMistakes(this.el.createDiv({ cls: "vt-pr-mistakes" }));

    this.owner.register(
      api.events.on("pool:change", () => {
        this.sweep();
        this.player.refresh();
        this.updateMistakeCount();
      })
    );
    this.owner.register(api.events.on("refill:start", () => this.player.refresh()));
    this.owner.register(
      api.events.on("refill:end", ({ error }) => {
        this.showError(error);
        this.player.refresh();
      })
    );

    api.applyFilter(this.filter);
    this.sweep();
    this.player.refresh();
    // An empty pool waits for 「開始出題」; a part-filled one tops up.
    this.ctl.mount();
  }

  // ── Filter ─────────────────────────────────────────────────────

  private renderBar(barEl: HTMLElement): void {
    const { deps } = this;
    const now = deps.now?.() ?? new Date();
    const level = deps.level();
    const groups: FilterGroup[] = grammarGroups(this.filter, level);
    const quick = grammarQuickPicks(
      {
        weekTopics: recentSightingTopics(deps.sightings(), now),
        dueTopics: dueTopics(GRAMMAR_TOPICS, (id) => deps.progress(id), now).map((t) => t.id),
        weakTopics: deps.weakTopicIds(),
      },
      level
    );
    const bar = renderFilterBar(barEl, {
      groups,
      groupsFor: (v) => grammarGroups(valueToFilter(v, level), level),
      quick,
      value: filterToValue(this.filter),
      summary: (v) => grammarSummary(valueToFilter(v, level), level),
      onChange: (v) => {
        this.filter = valueToFilter(v, level);
        this.filters.set("grammar", this.filter);
        // The topic chips follow the stage: swap the groups in place and
        // redraw with the pruned value.
        groups.splice(0, groups.length, ...grammarGroups(this.filter, level));
        bar.update(filterToValue(this.filter));
        this.clearError();
        deps.api.applyFilter(this.filter);
        this.sweep();
        this.player.refresh();
        this.ctl.filterChanged();
      },
    });
  }

  // ── Pool ───────────────────────────────────────────────────────

  private questions(): PlayerQuestion[] {
    const out: PlayerQuestion[] = [];
    this.byId.clear();
    for (const q of this.deps.api.poolQuestions()) {
      const pq = toPlayerQuestion(q);
      if (!pq) continue;
      this.byId.set(q.id, q);
      out.push(pq);
    }
    return out;
  }

  // Questions the player can't show (blank / rewrite / translate) are
  // skipped so they leave the pool (fixed decision 1).
  private sweep(): void {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const bad = this.deps.api.poolQuestions().filter((q) => !toPlayerQuestion(q));
      for (const q of bad) this.deps.api.skip(q);
    } finally {
      this.sweeping = false;
    }
  }

  private refill(signal: AbortSignal): void {
    const { api } = this.deps;
    if (!this.alive || api.isRefilling()) return;
    api.refill(this.filter, { signal }).catch((e: unknown) => this.showError(e));
  }

  private canStart(): boolean {
    return (
      this.alive &&
      !this.ctl.paused &&
      !this.deps.api.isRefilling() &&
      this.deps.aiStatus() === "ready" &&
      this.deps.api.poolQuestions().length === 0
    );
  }

  private emptyAction(): { label: string; run(): void } | null {
    return this.canStart() ? { label: t("practice.start"), run: () => this.ctl.manual() } : null;
  }

  private emptyText(): string {
    if (this.deps.api.isRefilling()) return t("practice.grammar.preparing");
    if (this.canStart()) return t("practice.startHint");
    const s = this.deps.aiStatus();
    if (s === "disabled") return t("practice.grammar.aiOff");
    if (s === "no_key") return t("practice.grammar.noKey");
    if (s === "offline") return t("practice.grammar.offline");
    return t("practice.grammar.none");
  }

  private showError(error: unknown): void {
    if (!this.alive) return;
    const failed = renderRefillError(this.noteEl, error, () => {
      this.clearError();
      this.ctl.manual();
    });
    this.ctl.ended(failed);
  }

  private clearError(): void {
    this.noteEl.empty();
  }

  // ── 錯題區 ─────────────────────────────────────────────────────

  private groups(): MistakeGroupView[] {
    return groupMistakes(this.deps.api.mistakeQuestions());
  }

  private updateMistakeCount(): void {
    this.mistakeCountEl.setText(`${t("practice.grammar.mistakes")}（${mistakeCount(this.groups())}）`);
  }

  private renderMistakes(box: HTMLElement): void {
    let open = false;
    let redoTag: string | null = null;
    let redoHandle: PlayerHandle | null = null;
    const toggle = box.createEl("button", { cls: "vt-pr-mistakes-toggle", attr: { type: "button", "aria-expanded": "false" } });
    this.mistakeCountEl = toggle.createSpan();
    const chevron = toggle.createSpan({ cls: "vt-pr-chevron", text: "›", attr: { "aria-hidden": "true" } });
    const body = box.createDiv({ cls: "vt-pr-mistakes-body" });
    this.updateMistakeCount();

    const draw = () => {
      redoHandle?.unload();
      redoHandle = null;
      toggle.setAttr("aria-expanded", String(open));
      chevron.toggleClass("is-open", open);
      body.empty();
      body.toggleClass("is-hidden", !open);
      if (!open) return;
      const groups = this.groups();
      if (groups.length === 0) body.createDiv({ cls: "vt-pr-empty", text: t("practice.grammar.mistakesEmpty") });
      for (const g of groups) {
        const group = body.createDiv({ cls: "vt-pr-mistake-group" });
        const row = group.createDiv({ cls: "vt-pr-mistake" });
        row.createSpan({ cls: "vt-pr-mistake-tag", text: g.label });
        row.createSpan({ cls: "vt-pr-mistake-count", text: t("practice.grammar.count", { n: g.questions.length }) });
        const list = group.createEl("ul", { cls: "vt-pr-mistake-list" });
        for (const q of g.questions) list.createEl("li", { cls: "vt-pr-mistake-item", text: mistakeLine(q.stem) });
        const isOpen = redoTag === g.errorTag;
        learnButton(row, {
          label: isOpen ? t("practice.grammar.fold") : t("practice.grammar.redo"),
          icon: isOpen ? "chevron-up" : "rotate-ccw",
          ghost: true,
          onClick: () => {
            redoTag = isOpen ? null : g.errorTag;
            draw();
          },
        });
        if (isOpen) {
          redoHandle = mountMistakeRedo(group.createDiv({ cls: "vt-pr-redo" }), {
            api: this.deps.api,
            mountPlayer: this.deps.mountPlayer,
            owner: this.owner,
            errorTag: g.errorTag,
            onChange: () => this.updateMistakeCount(),
          });
        }
      }
    };
    toggle.addEventListener("click", () => {
      open = !open;
      if (!open) redoTag = null;
      draw();
    });
    draw();
  }
}

// ── In-place redo of one error-tag group (tab and grammar map) ───────

export interface MistakeRedoOptions {
  api: Pick<GrammarPracticeApi, "mistakeQuestions" | "answer" | "skip" | "retire">;
  mountPlayer: MountPlayer;
  owner: Component;
  errorTag: string;
  // After each answer / skip / 👎 (the mistake count may have changed).
  onChange?(): void;
}

// The player over the open mistakes of one error tag. Answers go through
// `fromMistakes: true` (a right one resolves the mistake). What was answered
// or skipped here is not offered again this time, even if it stayed wrong.
export function mountMistakeRedo(host: HTMLElement, o: MistakeRedoOptions): PlayerHandle {
  const done = new Set<string>();
  const byId = new Map<string, GrammarQuestionLike>();
  return o.mountPlayer(
    host,
    {
      questions: () => {
        byId.clear();
        const out: PlayerQuestion[] = [];
        for (const q of o.api.mistakeQuestions()) {
          if (q.errorTag !== o.errorTag || done.has(q.id)) continue;
          const pq = toPlayerQuestion(q);
          if (!pq) continue;
          byId.set(q.id, q);
          out.push(pq);
        }
        return out;
      },
      emptyText: () => t("practice.grammar.redoDone"),
      callbacks: {
        onAnswer: (a) => {
          done.add(a.question.id);
          const q = byId.get(a.question.id);
          if (q) o.api.answer(q, a.optionId, a.correct, { hinted: a.hinted, fromMistakes: true });
          o.onChange?.();
        },
        onSkip: (pq) => {
          done.add(pq.id);
          const q = byId.get(pq.id);
          if (q) o.api.skip(q);
          o.onChange?.();
        },
        onRetire: (pq) => {
          done.add(pq.id);
          const q = byId.get(pq.id);
          if (q) o.api.retire(q);
          o.onChange?.();
        },
      },
    },
    o.owner
  );
}
