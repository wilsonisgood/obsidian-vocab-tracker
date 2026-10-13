import type { Component } from "obsidian";
import { t } from "../../../core/i18n";
import type { PracticeQuestion, ScenarioTrack } from "../../../core/model/practice";
import { learnButton } from "../learnUi";
import type { MountPlayer } from "./grammarTab";
import { groupPracticeMistakes, mistakeKey, mistakeLine, practiceMistakeCount } from "./mistakesPanelModel";
import type { PlayerHandle, PlayerQuestion } from "./playerTypes";
import type { ScenarioPracticeApi } from "./scenarioTypes";

// The shared 錯題區 of the scenario tabs (第十七波 Q; 常用字 now, 單字情境 and
// 混合 through deps.mountMistakes): a folded 「錯題區（n）」 whose groups (by
// error tag) are redone in place with the scenario player, answers going
// through `fromMistakes: true` so a right one resolves the mistake.

export interface MistakesPanelDeps {
  api: ScenarioPracticeApi;
  // Without a track: the mistakes of every scenario track (混合).
  track?: ScenarioTrack;
  mountPlayer: MountPlayer;
  toPlayer(q: PracticeQuestion): PlayerQuestion;
}

export function renderMistakesPanel(
  el: HTMLElement,
  deps: MistakesPanelDeps,
  owner: Component
): { refresh(): void } {
  const { api } = deps;
  const box = el.createDiv({ cls: "vt-pr-mistakes" });
  let open = false;
  let redoKey: string | null = null;
  let redoHandle: PlayerHandle | null = null;
  let alive = true;

  const toggle = box.createEl("button", {
    cls: "vt-pr-mistakes-toggle",
    attr: { type: "button", "aria-expanded": "false" },
  });
  const countEl = toggle.createSpan();
  const chevron = toggle.createSpan({ cls: "vt-pr-chevron", text: "›", attr: { "aria-hidden": "true" } });
  const body = box.createDiv({ cls: "vt-pr-mistakes-body is-hidden" });

  const groups = () => groupPracticeMistakes(api.mistakeQuestions(deps.track));
  const updateCount = () => countEl.setText(`${t("practice.mistakes.title")}（${practiceMistakeCount(groups())}）`);

  const closeRedo = () => {
    redoHandle?.unload();
    redoHandle = null;
  };

  const draw = () => {
    closeRedo();
    toggle.setAttr("aria-expanded", String(open));
    chevron.toggleClass("is-open", open);
    body.empty();
    body.toggleClass("is-hidden", !open);
    updateCount();
    if (!open) return;
    const list = groups();
    if (list.length === 0) body.createDiv({ cls: "vt-pr-empty", text: t("practice.mistakes.empty") });
    for (const g of list) {
      const group = body.createDiv({ cls: "vt-pr-mistake-group" });
      const row = group.createDiv({ cls: "vt-pr-mistake" });
      row.createSpan({ cls: "vt-pr-mistake-tag", text: g.label });
      row.createSpan({ cls: "vt-pr-mistake-count", text: t("practice.mistakes.count", { n: g.questions.length }) });
      // Every mistake of the group, one line each (第十八波 R).
      const list = group.createEl("ul", { cls: "vt-pr-mistake-list" });
      for (const q of g.questions) list.createEl("li", { cls: "vt-pr-mistake-item", text: mistakeLine(q.text) });
      const isOpen = redoKey === g.key;
      learnButton(row, {
        label: isOpen ? t("practice.mistakes.fold") : t("practice.mistakes.redo"),
        icon: isOpen ? "chevron-up" : "rotate-ccw",
        ghost: true,
        onClick: () => {
          redoKey = isOpen ? null : g.key;
          draw();
        },
      });
      if (isOpen) redoHandle = mountRedo(group.createDiv({ cls: "vt-pr-redo" }), g.key);
    }
  };

  // The player over the open mistakes of one group. What was answered or
  // skipped here isn't offered again this time, even if it stayed wrong.
  const mountRedo = (host: HTMLElement, key: string): PlayerHandle => {
    const done = new Set<string>();
    const byId = new Map<string, PracticeQuestion>();
    return deps.mountPlayer(
      host,
      {
        questions: () => {
          byId.clear();
          const out: PlayerQuestion[] = [];
          for (const q of api.mistakeQuestions(deps.track)) {
            if (mistakeKey(q) !== key || done.has(q.id)) continue;
            byId.set(q.id, q);
            out.push(deps.toPlayer(q));
          }
          return out;
        },
        emptyText: () => t("practice.mistakes.redoDone"),
        callbacks: {
          onAnswer: (a) => {
            done.add(a.question.id);
            const q = byId.get(a.question.id);
            if (q) api.answer(q, a.optionId, a.correct, { hinted: a.hinted, fromMistakes: true });
            updateCount();
          },
          onSkip: (pq) => {
            done.add(pq.id);
            const q = byId.get(pq.id);
            if (q) api.skip(q);
            updateCount();
          },
          onRetire: (pq) => {
            done.add(pq.id);
            const q = byId.get(pq.id);
            if (q) api.retire(q);
            updateCount();
          },
        },
      },
      owner
    );
  };

  toggle.addEventListener("click", () => {
    open = !open;
    if (!open) redoKey = null;
    draw();
  });

  // A redraw under an open redo would throw away the round being played, so
  // while one is open only the count follows.
  const refresh = () => {
    if (!alive) return;
    if (redoKey) updateCount();
    else draw();
  };
  owner.register(api.events.on("pool:change", () => refresh()));
  owner.register(() => {
    alive = false;
    closeRedo();
  });
  draw();
  return { refresh };
}
