import type { Component } from "obsidian";
import { GRAMMAR_TOPICS } from "../../../core/grammar/catalog";
import { dueTopics } from "../../../core/grammar/progress";
import type { GrammarProgress, GrammarSighting } from "../../../core/model/grammar";
import type { CefrLevel } from "../../../core/model/settings";
import type { AiStatus } from "../../../services/ai/AiService";
import { aiErrorBox } from "../../kit/aiDebug";
import {
  parseGrammarFilter,
  type GrammarFilter,
  type GrammarPracticeApi,
  type GrammarQuestionLike,
} from "../../grammar/practiceTypes";
import { isAbort, learnButton, learnErrorText } from "../learnUi";
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
import type { PracticeTabDef } from "./types";

// 文法 tab of the practice hub (第十六波 H): the shared filter bar (階段 /
// 主題 + quick picks), the scenario player over the pool G keeps, and a
// folded 錯題區 below whose groups are redone in place with the same player.

const L = {
  label: { zh: "文法", en: "Grammar" },
  mistakes: { zh: "錯題區", en: "Mistakes" },
  mistakesEmpty: { zh: "目前沒有錯題。", en: "No mistakes right now." },
  redo: { zh: "重做這組", en: "Redo this group" },
  fold: { zh: "收起", en: "Fold" },
  count: { zh: "{n} 題", en: "{n}" },
  preparing: { zh: "題目準備中…", en: "Preparing questions…" },
  aiOff: { zh: "AI 沒有開啟，無法生成新題目", en: "AI is off, so new questions can't be generated" },
  noKey: { zh: "尚未設定 AI 金鑰，無法生成新題目", en: "No AI key set, so new questions can't be generated" },
  offline: { zh: "目前離線，無法生成新題目", en: "Offline, so new questions can't be generated" },
  none: { zh: "目前沒有新題目，換個篩選或稍後再試。", en: "No new questions right now. Change the filter or try again later." },
  redoDone: { zh: "這組已經做完了。", en: "This group is done." },
};

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
    label: L.label.zh,
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
  private ctrl: AbortController | null = null;
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
    this.owner.register(() => {
      this.alive = false;
      this.ctrl?.abort();
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
        callbacks: {
          onAnswer: (a) => {
            const q = this.byId.get(a.question.id);
            if (q) api.answer(q, a.optionId, a.correct, { hinted: a.hinted, fromMistakes: false });
            this.maybeRefill();
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
    this.refill();
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
        this.refill();
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

  private maybeRefill(): void {
    if (this.deps.api.poolQuestions().length <= REFILL_THRESHOLD) this.refill();
  }

  private refill(): void {
    const { api } = this.deps;
    if (!this.alive || api.isRefilling()) return;
    if (api.poolQuestions().length > REFILL_THRESHOLD) return;
    this.ctrl = new AbortController();
    api.refill(this.filter, { signal: this.ctrl.signal }).catch((e: unknown) => this.showError(e));
  }

  private emptyText(): string {
    if (this.deps.api.isRefilling()) return L.preparing.zh;
    const s = this.deps.aiStatus();
    if (s === "disabled") return L.aiOff.zh;
    if (s === "no_key") return L.noKey.zh;
    if (s === "offline") return L.offline.zh;
    return L.none.zh;
  }

  private showError(error: unknown): void {
    this.clearError();
    if (!error || isAbort(error) || !this.alive) return;
    this.noteEl.appendChild(aiErrorBox({ text: learnErrorText(error), error }));
  }

  private clearError(): void {
    this.noteEl.empty();
  }

  // ── 錯題區 ─────────────────────────────────────────────────────

  private groups(): MistakeGroupView[] {
    return groupMistakes(this.deps.api.mistakeQuestions());
  }

  private updateMistakeCount(): void {
    this.mistakeCountEl.setText(`${L.mistakes.zh}（${mistakeCount(this.groups())}）`);
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
      if (groups.length === 0) body.createDiv({ cls: "vt-pr-empty", text: L.mistakesEmpty.zh });
      for (const g of groups) {
        const group = body.createDiv({ cls: "vt-pr-mistake-group" });
        const row = group.createDiv({ cls: "vt-pr-mistake" });
        row.createSpan({ cls: "vt-pr-mistake-tag", text: g.label });
        row.createSpan({ cls: "vt-pr-mistake-count", text: L.count.zh.replace("{n}", String(g.questions.length)) });
        const isOpen = redoTag === g.errorTag;
        learnButton(row, {
          label: isOpen ? L.fold.zh : L.redo.zh,
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
      emptyText: () => L.redoDone.zh,
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
