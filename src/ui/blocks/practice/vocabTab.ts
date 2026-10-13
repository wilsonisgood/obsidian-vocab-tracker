import { Component } from "obsidian";
import type { VocabEntry } from "../../../core/model/entry";
import { CARD_MODES } from "../../../core/model/srs";
import type { AiStatus } from "../../../services/ai/AiService";
import { FlashcardsBlock, type FlashcardsHost } from "../flashcards";
import { parseFlashcardParams } from "../params";
import { t } from "../../../core/i18n";
import { renderFilterBar } from "./filterBar";
import { parseFilterValue, pruneValue, type FilterValue } from "./filterBarModel";
import type { MountPlayer } from "./grammarTab";
import { toPlayerQuestion, type MountMistakes, type ScenarioPracticeApi } from "./mixTypes";
import { mountScenarioPane } from "./scenarioPane";
import type { PracticeTabDef } from "./types";
import {
  collectVocabOptions,
  parseVocabMode,
  pickVocabRefs,
  toQueueFilter,
  vocabGroups,
  vocabQuickPicks,
  vocabScenarioRequest,
  vocabSummary,
  type VocabMode,
} from "./vocabFilterModel";

// 單字 tab (第十六波 E): the shared filter bar over the existing flashcards
// (FSRS card review). A filter change starts a new round.
// 第十七波 V: a second switch, 情境練習, writes a scenario round around the
// words the same filter selects (C2: cards stay the default).

export interface VocabScenarioDeps {
  api: ScenarioPracticeApi;
  mountPlayer: MountPlayer;
  mountMistakes?: MountMistakes;
  ready(): Promise<void>;
  aiStatus(): AiStatus;
  now?(): Date;
}

const MODE_KEY = "vocab-tracker:practice.vocabMode";

// A screen preference, not learning data: this device only.
function loadMode(): VocabMode {
  try {
    return parseVocabMode(window.localStorage.getItem(MODE_KEY));
  } catch {
    return "cards";
  }
}
function saveMode(m: VocabMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, m);
  } catch {
    /* private window etc. */
  }
}

export function vocabTab(host: FlashcardsHost, scenario?: VocabScenarioDeps): PracticeTabDef {
  return {
    id: "vocab",
    label: t("practice.vocab.label"),
    order: 0,
    mount(el, ctx) {
      const groups = vocabGroups(collectVocabOptions(host.store.entries as readonly VocabEntry[]));
      let value: FilterValue = pruneValue(parseFilterValue(ctx.filters.get("vocab")), groups);
      let mode: VocabMode = scenario ? loadMode() : "cards";
      el.addClass("vt-pr-vocab");

      const barEl = el.createDiv();
      const switchEl = scenario ? el.createDiv({ cls: "vt-pr-segmented", attr: { role: "group" } }) : null;
      const bodyEl = el.createDiv({ cls: "vt-pr-vocab-body" });

      // The active mode's view hangs under its own component so a switch
      // unloads it.
      let view: Component | null = null;
      let onFilter: () => void = () => {};

      const mountCards = (box: HTMLElement, owner: Component) => {
        const cardsEl = box.createDiv({ cls: "vt-pr-vocab-cards" });
        const block = new FlashcardsBlock(
          cardsEl,
          host,
          { ...parseFlashcardParams(""), mode: CARD_MODES[0] },
          { filter: () => toQueueFilter(value, new Date()) }
        );
        owner.addChild(block);
        onFilter = () => block.restart();
      };

      const mountScenario = (box: HTMLElement, owner: Component, s: VocabScenarioDeps) => {
        const entries = () => host.store.entries as readonly VocabEntry[];
        const refs = () => pickVocabRefs(entries(), value, s.now?.() ?? new Date());
        let alive = true;
        owner.register(() => (alive = false));
        void s.ready().then(() => {
          if (!alive) return;
          const names = new Map<string, string>();
          const pane = mountScenarioPane(box, {
            track: "vocab",
            api: s.api,
            mountPlayer: s.mountPlayer,
            mountMistakes: s.mountMistakes,
            owner,
            toPlayer: (q) => toPlayerQuestion(q, (x) => names.get(x.focus.id) ?? ""),
            aiStatus: s.aiStatus,
            idleText: () => t("practice.vocab.scenarioFew"),
          });
          const apply = () => {
            const r = refs();
            for (const x of r) names.set(x.id, x.word);
            const req = vocabScenarioRequest(r);
            pane.setRequest(req, new Set(r.map((x) => x.id)));
          };
          onFilter = apply;
          apply();
        });
      };

      const draw = () => {
        if (view) {
          ctx.component.removeChild(view);
          view = null;
        }
        bodyEl.empty();
        const comp = new Component();
        view = comp;
        ctx.component.addChild(comp);
        if (mode === "scenario" && scenario) mountScenario(bodyEl, comp, scenario);
        else mountCards(bodyEl, comp);
      };

      const bar = renderFilterBar(barEl, {
        groups,
        quick: vocabQuickPicks(),
        value,
        summary: (v) => vocabSummary(v, groups),
        onChange: (next) => {
          value = next;
          ctx.filters.set("vocab", next);
          onFilter();
        },
      });
      void bar;

      if (switchEl) {
        const buttons: [VocabMode, HTMLElement][] = (
          [
            ["cards", t("practice.vocab.scenarioCards")],
            ["scenario", t("practice.vocab.scenarioPractice")],
          ] as [VocabMode, string][]
        ).map(([m, label]) => {
          const b = switchEl.createEl("button", { cls: "vt-pr-segment", text: label, attr: { type: "button" } });
          b.addEventListener("click", () => {
            if (mode === m) return;
            mode = m;
            saveMode(m);
            paint();
            draw();
          });
          return [m, b];
        });
        const paint = () => {
          for (const [m, b] of buttons) {
            b.toggleClass("is-active", m === mode);
            b.setAttr("aria-pressed", String(m === mode));
          }
        };
        paint();
      }
      draw();
    },
  };
}
