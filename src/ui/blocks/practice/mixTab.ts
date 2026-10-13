import type { Component } from "obsidian";
import { topicById } from "../../../core/grammar/catalog";
import { t } from "../../../core/i18n";
import type { PolySense } from "../../../core/model/poly";
import type { AiStatus } from "../../../services/ai/AiService";
import { renderFilterBar } from "./filterBar";
import type { MountPlayer } from "./grammarTab";
import {
  buildMixRequest,
  categoryOfTag,
  emptyTally,
  mixFilterToValue,
  mixFocusIds,
  mixGroups,
  mixSummary,
  parseMixFilter,
  recordAnswer,
  tallyText,
  valueToMixFilter,
  type MixFilter,
  type MixSources,
} from "./mixTabModel";
import {
  type GrammarRef,
  type MountMistakes,
  type ScenarioPracticeApi,
  type VocabRef,
} from "./mixTypes";
import { toPlayerQuestion } from "./scenarioQuestionView";
import { mountScenarioPane, type ScenarioPane } from "./scenarioPane";
import type { PracticeTabDef } from "./types";

// 混合 tab (第十七波 V): one scenario round across 單字 / 文法 / 常用字, each
// asking about what that tab's own filter has selected. Only the categories
// ticked here are mixed; a category with nothing selected is skipped.

export interface MixTabDeps {
  api: ScenarioPracticeApi;
  mountPlayer: MountPlayer;
  mountMistakes?: MountMistakes;
  // Resolves when LearnerStore (and the stores below) have loaded.
  ready(): Promise<void>;
  // What each tab's saved filter selects (≤ 12 words / topics' objectives).
  vocabRefs(): VocabRef[];
  grammarRefs(): GrammarRef[];
  polySenses(): { tested: PolySense[]; reference: PolySense[] };
  aiStatus(): AiStatus;
}

export function mixTab(deps: MixTabDeps): PracticeTabDef {
  return {
    id: "mix",
    label: t("practice.mix.label"),
    order: 3,
    mount(el, ctx) {
      el.addClass("vt-pr-mix");
      let alive = true;
      ctx.component.register(() => (alive = false));
      void deps.ready().then(() => {
        if (!alive) return;
        start(el, deps, ctx.filters, ctx.component);
      });
    },
  };
}

function start(
  el: HTMLElement,
  deps: MixTabDeps,
  filters: { get(t: "mix"): unknown; set(t: "mix", v: unknown): void },
  owner: Component
): void {
  let filter: MixFilter = parseMixFilter(filters.get("mix"));
  const tally = emptyTally();
  let pane: ScenarioPane | null = null;
  let tallyEl: HTMLElement | null = null;

  const sources = (): MixSources => ({
    vocab: deps.vocabRefs(),
    grammar: deps.grammarRefs(),
    poly: deps.polySenses(),
  });

  const apply = () => {
    const req = buildMixRequest(filter, sources());
    pane?.setRequest(req, mixFocusIds(req));
  };

  const barEl = el.createDiv();
  const bar = renderFilterBar(barEl, {
    groups: mixGroups(),
    value: mixFilterToValue(filter),
    summary: (v) => mixSummary(valueToMixFilter(v), sources()),
    onChange: (v) => {
      filter = valueToMixFilter(v);
      filters.set("mix", filter);
      bar.update(mixFilterToValue(filter));
      apply();
    },
  });

  pane = mountScenarioPane(el, {
    track: "mix",
    api: deps.api,
    mountPlayer: deps.mountPlayer,
    mountMistakes: deps.mountMistakes,
    owner,
    toPlayer: (q) => toPlayerQuestion(q, { topicTitle: (id) => topicById(id)?.title ?? "" }),
    aiStatus: deps.aiStatus,
    idleText: () => (filter.include.length === 0 ? t("practice.mix.none") : t("practice.mix.nothing")),
    onAnswer: (a) => {
      if (!categoryOfTag(a.question.tag)) return;
      recordAnswer(tally, a.question.tag, a.correct, a.hinted);
      tallyEl?.setText(tallyText(tally));
    },
  });
  tallyEl = pane.headEl.createDiv({ cls: "vt-pr-mix-tally" });
  apply();
}
