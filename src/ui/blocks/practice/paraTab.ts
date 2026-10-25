import type { Component } from "obsidian";
import { t } from "../../../core/i18n";
import type { Thread } from "../../../core/model/thread";
import {
  excerpt,
  filterKey,
  paragraphsInFilter,
  paraScopeOptions,
  parseParaFilter,
  type ParaFilter,
} from "../../../core/practice/paraphrase";
import type { AiStatus } from "../../../services/ai/AiService";
import type { MountPlayer } from "./grammarTab";
import type { MountMistakes, ScenarioPracticeApi } from "./mixTypes";
import { toPlayerQuestion } from "./scenarioQuestionView";
import { mountScenarioPane, type ScenarioPane } from "./scenarioPane";
import type { FilterStore, PracticeTabDef } from "./types";

// 換句話說 tab: paraphrase questions on the paragraphs the learner has
// discussed (their sentences, with what was asked about them). 出題範圍
// picks all discussions, one note's, or one paragraph's — the last one is
// what the sidebar's 「用這段練換句話說」 sets.

export interface ParaTabDeps {
  api: ScenarioPracticeApi;
  mountPlayer: MountPlayer;
  mountMistakes?: MountMistakes;
  // Resolves when the learner shard and threads.json have loaded.
  ready(): Promise<void>;
  // Live paragraph discussions.
  threads(): readonly Thread[];
  // The 換句話說 filter was changed elsewhere (the sidebar button, a synced
  // device); returns the unsubscribe.
  onFilterChange?(fn: () => void): () => void;
  aiStatus(): AiStatus;
}

export function paraTab(deps: ParaTabDeps): PracticeTabDef {
  return {
    id: "para",
    label: t("practice.para.label"),
    order: 4,
    mount(el, ctx) {
      el.addClass("vt-pr-para");
      let alive = true;
      ctx.component.register(() => (alive = false));
      void deps.ready().then(() => {
        if (!alive) return;
        start(el, deps, ctx.filters, ctx.component);
      });
    },
  };
}

function start(el: HTMLElement, deps: ParaTabDeps, filters: FilterStore, owner: Component): void {
  let filter: ParaFilter = parseParaFilter(filters.get("para"));
  let pane: ScenarioPane | null = null;

  // A note or paragraph that's gone (deleted discussion, renamed note)
  // falls back to everything.
  const effective = (): ParaFilter =>
    filter.scope !== "all" && paragraphsInFilter(deps.threads(), filter).length === 0 ? { scope: "all" } : filter;

  const bar = el.createDiv({ cls: "vt-pr-para-scope" });
  bar.createSpan({ cls: "vt-pr-mix-tags-label", text: t("practice.para.scope") });
  const select = bar.createEl("select", { cls: "dropdown vt-pr-para-select" });
  const choices = new Map<string, ParaFilter>();

  const drawScope = () => {
    select.empty();
    choices.clear();
    const threads = deps.threads();
    const { all, notes } = paraScopeOptions(threads);
    const add = (f: ParaFilter, text: string) => {
      const key = filterKey(f);
      choices.set(key, f);
      select.createEl("option", { text, attr: { value: key } });
    };
    add({ scope: "all" }, t("practice.para.scopeAll", { n: all }));
    const cur = effective();
    if (cur.scope === "thread") {
      const th = threads.find((x) => x.id === cur.threadId);
      const text = th?.anchor.kind === "paragraph" ? excerpt(th.anchor.snapshot) : cur.threadId;
      add(cur, t("practice.para.scopeThread", { text }));
    }
    for (const n of notes) add(n.filter, t("practice.para.scopeNote", { title: n.title, n: n.count }));
    select.value = filterKey(cur);
    select.disabled = all === 0;
  };

  const apply = () => {
    const refs = paragraphsInFilter(deps.threads(), effective());
    pane?.setRequest(refs.length ? { track: "para", paragraphs: refs } : null, new Set(refs.map((r) => r.threadId)));
  };

  select.addEventListener("change", () => {
    const next = choices.get(select.value);
    if (!next) return;
    filter = next;
    filters.set("para", filter);
    drawScope();
    apply();
  });

  if (deps.onFilterChange) {
    owner.register(
      deps.onFilterChange(() => {
        const next = parseParaFilter(filters.get("para"));
        if (filterKey(next) === filterKey(filter)) return;
        filter = next;
        drawScope();
        apply();
      })
    );
  }

  pane = mountScenarioPane(el, {
    track: "para",
    api: deps.api,
    mountPlayer: deps.mountPlayer,
    mountMistakes: deps.mountMistakes,
    owner,
    toPlayer: (q) => toPlayerQuestion(q),
    aiStatus: deps.aiStatus,
    idleText: () => (deps.threads().length === 0 ? t("practice.para.empty") : t("practice.para.nothing")),
  });
  drawScope();
  apply();
}
