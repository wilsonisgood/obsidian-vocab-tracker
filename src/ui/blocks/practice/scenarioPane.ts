import type { Component } from "obsidian";
import { t } from "../../../core/i18n";
import type { PracticeQuestion, ScenarioTrack } from "../../../core/model/practice";
import type { AiStatus } from "../../../services/ai/AiService";
import type { MountPlayer } from "./grammarTab";
import type { MountMistakes, ScenarioPracticeApi, ScenarioRequest } from "./mixTypes";
import { REFILL_THRESHOLD } from "./grammarTabModel";
import type { PlayerAnswer, PlayerHandle, PlayerQuestion } from "./playerTypes";
import { RefillController } from "./refillGuardModel";
import { renderRefillError } from "./refillUi";

// The scenario player over one track's pool, shared by the 單字 tab's
// 情境練習 and the 混合 tab (第十七波 V). Mirrors grammarTab: player, refill,
// error note and the shared 錯題區 below. The tab says what to ask about
// with setRequest(); the pool is narrowed to it (applyScope) and refilled.

export interface ScenarioPaneOptions {
  track: ScenarioTrack;
  api: ScenarioPracticeApi;
  mountPlayer: MountPlayer;
  mountMistakes?: MountMistakes;
  owner: Component;
  toPlayer(q: PracticeQuestion): PlayerQuestion | null;
  aiStatus(): AiStatus;
  // Why there's nothing to ask about, while no request is set.
  idleText(): string;
  onAnswer?(a: PlayerAnswer): void;
}

export interface ScenarioPane {
  // An element above the player for the tab's own line (the mix tally).
  headEl: HTMLElement;
  setRequest(req: ScenarioRequest | null, focusIds: ReadonlySet<string>): void;
}

export function mountScenarioPane(el: HTMLElement, o: ScenarioPaneOptions): ScenarioPane {
  const { api, track } = o;
  let alive = true;
  let req: ScenarioRequest | null = null;
  let mounted = false;
  let sweeping = false;
  const byId = new Map<string, PracticeQuestion>();
  const ctl = new RefillController({
    poolSize: () => api.poolQuestions(track).length,
    threshold: REFILL_THRESHOLD,
    run: (signal) => run(signal),
  });
  o.owner.register(() => {
    alive = false;
    ctl.dispose();
  });

  const headEl = el.createDiv({ cls: "vt-pr-mix-head" });
  const noteEl = el.createDiv({ cls: "vt-pr-grammar-note" });
  const playerEl = el.createDiv({ cls: "vt-pr-scenario-player" });

  const showError = (error: unknown) => {
    if (!alive) return;
    const failed = renderRefillError(noteEl, error, () => {
      noteEl.empty();
      ctl.manual();
    });
    ctl.ended(failed);
  };

  const canStart = (): boolean =>
    alive &&
    !!req &&
    !ctl.paused &&
    !api.isRefilling(track) &&
    o.aiStatus() === "ready" &&
    api.poolQuestions(track).length === 0;

  const emptyText = (): string => {
    if (!req) return o.idleText();
    if (api.isRefilling(track)) return t("practice.grammar.preparing");
    if (canStart()) return t("practice.startHint");
    const s = o.aiStatus();
    if (s === "disabled") return t("practice.grammar.aiOff");
    if (s === "no_key") return t("practice.grammar.noKey");
    if (s === "offline") return t("practice.grammar.offline");
    return t("practice.grammar.none");
  };

  const run = (signal: AbortSignal) => {
    if (!alive || !req || api.isRefilling(track)) return;
    api.refill(req, { signal }).catch((e: unknown) => showError(e));
  };

  // Questions the player can't show leave the pool.
  const sweep = () => {
    if (sweeping) return;
    sweeping = true;
    try {
      for (const q of api.poolQuestions(track).filter((x) => !o.toPlayer(x))) api.skip(q);
    } finally {
      sweeping = false;
    }
  };

  const act = (pq: PlayerQuestion, fn: (q: PracticeQuestion) => void) => {
    const q = byId.get(pq.id);
    if (q) fn(q);
    ctl.afterAction();
  };

  const player: PlayerHandle = o.mountPlayer(
    playerEl,
    {
      questions: () => {
        byId.clear();
        const out: PlayerQuestion[] = [];
        for (const q of api.poolQuestions(track)) {
          const pq = o.toPlayer(q);
          if (!pq) continue;
          byId.set(q.id, q);
          out.push(pq);
        }
        return out;
      },
      emptyText,
      emptyAction: () => (canStart() ? { label: t("practice.start"), run: () => ctl.manual() } : null),
      callbacks: {
        onAnswer: (a) => {
          o.onAnswer?.(a);
          act(a.question, (q) => api.answer(q, a.optionId, a.correct, { hinted: a.hinted, fromMistakes: false }));
        },
        onSkip: (pq) => act(pq, (q) => api.skip(q)),
        onRetire: (pq) => act(pq, (q) => api.retire(q)),
      },
    },
    o.owner
  );

  const mistakes = o.mountMistakes?.(el.createDiv({ cls: "vt-pr-mistakes" }), track, o.owner);

  o.owner.register(
    api.events.on("pool:change", (tr) => {
      if (tr !== track) return;
      sweep();
      player.refresh();
      mistakes?.refresh();
    })
  );
  o.owner.register(api.events.on("refill:start", (tr) => tr === track && player.refresh()));
  o.owner.register(
    api.events.on("refill:end", (e) => {
      if (e.track !== track) return;
      showError(e.error);
      player.refresh();
    })
  );

  return {
    headEl,
    setRequest(next, focusIds) {
      req = next;
      noteEl.empty();
      api.applyScope(track, focusIds);
      sweep();
      player.refresh();
      // The first request is the tab opening (an empty pool waits for
      // 「開始出題」); later ones are filter changes (debounced).
      if (mounted) ctl.filterChanged();
      else ctl.mount();
      mounted = true;
    },
  };
}
