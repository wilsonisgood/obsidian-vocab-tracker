import type { MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { renderDashboard } from "./dashboard";
import { renderDna, type DnaBlockDeps } from "./dna";
import { renderFamilies } from "./families";
import { renderFlashcards } from "./flashcards";
import { renderGrammarMap, type GrammarMapDeps } from "./grammarMap";
import { renderGrammarPractice, type GrammarPracticeDeps } from "./grammarPractice";
import { renderGrammarTopic, type GrammarTopicDeps } from "./grammarTopic";
import { renderPractice } from "./practice";
import { grammarTab } from "./practice/grammarTab";
import { mixTab } from "./practice/mixTab";
import { paraTab } from "./practice/paraTab";
import { polyTab } from "./practice/polyTab";
import { renderMistakesPanel } from "./practice/mistakesPanel";
import { pickVocabRefs, vocabScopeIds } from "./practice/vocabFilterModel";
import { toPlayerQuestion } from "./practice/scenarioQuestionView";
import { parseFilterValue } from "./practice/filterBarModel";
import type { MountMistakes } from "./practice/mixTypes";
import { renderPolysemyMap, type PolysemyMapDeps } from "./polysemyMap";
import { topicById } from "../../core/grammar/catalog";
import { parseGrammarFilter, topicsInFilter } from "../../core/grammar/practiceFilter";
import { parsePolyFilter, sensesInFilter } from "../../core/poly/catalog";
import type { GrammarRef } from "../../services/practice/scenarioApi";
import { mountScenarioPlayer } from "./practice/scenarioPlayer";
import { grammarSightings } from "../../core/grammar/sightings";
import { weakFocuses } from "../../core/learner/weakness";
import type { GrammarFilter } from "../../core/grammar/practiceFilter";
import type { FilterStore, PracticeHost } from "./practice/types";
import { openPluginSettings } from "../kit/openSettings";
import { renderBuddy } from "./buddy";
import { renderTrivia } from "./trivia";
import { renderVerbs } from "./verbs";
import { renderWordHeader, WORD_BLOCK_LANG } from "./wordHeader";
import { renderWordDna, renderWordInfo, WORD_DNA_LANG, WORD_INFO_LANG } from "./wordSections";

// Word DNA (規劃書 09 §7): bundles the concrete services the block only
// knows through DnaBlockDeps (see dna.ts's header comment).
function dnaDeps(plugin: VocabTrackerPlugin): DnaBlockDeps {
  return {
    app: plugin.app,
    manifestId: plugin.manifest.id,
    vocab: plugin.store,
    learn: plugin.learn,
    morphemes: plugin.morphemes,
    threads: plugin.threads,
    ai: plugin.ai,
    selection: plugin.selection,
    openWord: (e) => void plugin.surfaces.openWordCard(e.id, "data"),
    focus: plugin.dnaFocus,
    pageContext: plugin.pageContext,
  };
}

// 文法學習 (Wave 15): 文法地圖, 主題頁, 練習.
function grammarMapDeps(plugin: VocabTrackerPlugin): GrammarMapDeps {
  return {
    grammar: plugin.grammar,
    level: () => plugin.store.settings.learner?.level ?? "",
    openTopic: (id) => plugin.grammarPages.open(id),
    api: plugin.grammarQuestions,
    mountPlayer: mountScenarioPlayer,
    ...grammarRouting(plugin),
  };
}

function grammarTopicDeps(plugin: VocabTrackerPlugin): GrammarTopicDeps {
  return {
    grammar: plugin.grammar,
    threads: plugin.threads,
    ai: plugin.ai,
    pages: plugin.grammarPages,
    openTopic: (id) => plugin.grammarPages.open(id),
    openNote: (path) => plugin.openNote(path),
    openSettings: () => openPluginSettings(plugin.app, plugin.manifest.id),
  };
}

// The card needs api / ready / setGrammarFilter / openPractice at integration.
function grammarPracticeDeps(plugin: VocabTrackerPlugin): GrammarPracticeDeps {
  return { api: plugin.grammarQuestions, ready: () => grammarReady(plugin), ...grammarRouting(plugin) };
}

// 第十六波: the grammar stores both load before a grammar practice surface draws.
async function grammarReady(plugin: VocabTrackerPlugin): Promise<void> {
  await Promise.all([plugin.grammar.ensureLoaded(), plugin.learner.ensureLoaded()]);
}

// 第十六波 (12 §0, w16 第二批 rule 5): 「練這個主題」 sets the shared grammar
// filter to the topic and opens the hub's 文法 tab.
export function grammarRouting(plugin: VocabTrackerPlugin): {
  setGrammarFilter(f: GrammarFilter): void;
  openPractice(track: "grammar"): void;
} {
  return {
    setGrammarFilter: (f) => plugin.learner.setFilter("grammar", f),
    openPractice: (track) => void plugin.openPracticeTab(track),
  };
}

function polysemyDeps(plugin: VocabTrackerPlugin): PolysemyMapDeps {
  return {
    senseStats: senseStats(plugin),
    setPolyFilter: (f) => plugin.learner.setFilter("poly", f),
    openPractice: (track) => void plugin.openPracticeTab(track),
  };
}

// 練習中心 (Wave 16 E). Filter values are learning data, so they live in
// the learner shard and sync (1013-card-tabs C5).
function practiceFilters(plugin: VocabTrackerPlugin): FilterStore {
  return {
    get: (track) => plugin.learner.filter(track),
    set: (track, value) => plugin.learner.setFilter(track, value),
  };
}

// 第十七波: both are loaded before a scenario tab draws.
function scenarioReady(plugin: VocabTrackerPlugin): Promise<void> {
  return grammarReady(plugin);
}

// The shared 錯題區 as the 單字 and 混合 panes mount it; 混合 shows the
// mistakes of every scenario track.
function mountMistakes(plugin: VocabTrackerPlugin): MountMistakes {
  return (el, track, owner) =>
    renderMistakesPanel(
      el,
      {
        api: plugin.scenario,
        ...(track === "mix" ? {} : { track }),
        mountPlayer: mountScenarioPlayer,
        toPlayer: (q) => toPlayerQuestion(q, { topicTitle: (id) => topicById(id)?.title ?? "" }),
      },
      owner
    );
}

// Objectives of the topics the 文法 filter selects, at most 12 (混合 tab).
function mixGrammarRefs(plugin: VocabTrackerPlugin): GrammarRef[] {
  const out: GrammarRef[] = [];
  const filter = parseGrammarFilter(plugin.learner.filter("grammar"));
  for (const id of topicsInFilter(filter, plugin.store.settings.learner?.level ?? "")) {
    const topic = topicById(id);
    if (!topic) continue;
    for (const o of topic.objectives) {
      if (out.length >= 12) return out;
      out.push({ topicId: topic.id, objectiveId: o.id, text: o.text, title: topic.title, pattern: topic.pattern });
    }
  }
  return out;
}

function senseStats(plugin: VocabTrackerPlugin) {
  return (id: string) => plugin.learnerModel.senseStats(id);
}

function practiceHost(plugin: VocabTrackerPlugin): PracticeHost {
  return {
    app: plugin.app,
    store: plugin.store,
    srs: plugin.srs,
    jumpToSource: (e) => plugin.jumpToSource(e),
    openVocabFile: () => plugin.openVocabFile(),
    tabs: () => [
      grammarTab({
        api: plugin.grammarQuestions,
        mountPlayer: mountScenarioPlayer,
        ready: () => grammarReady(plugin),
        level: () => plugin.store.settings.learner?.level ?? "",
        sightings: () => grammarSightings(plugin.threads.paragraphThreads()),
        progress: (id) => plugin.grammar.progress(id),
        weakTopicIds: () => [
          ...new Set(
            weakFocuses(plugin.learner.learnEvents({ track: "grammar" }), { now: new Date(), track: "grammar" }).map(
              (w) => w.focus.id.split("/")[0]
            )
          ),
        ],
        aiStatus: () => plugin.ai.status(),
      }),
      polyTab({
        api: plugin.scenario,
        mountPlayer: mountScenarioPlayer,
        ready: () => scenarioReady(plugin),
        savedWords: () => plugin.store.entries.filter((e) => e.liked === true && !e.deletedAt).map((e) => e.word),
        weakSenseIds: () =>
          weakFocuses(plugin.learner.learnEvents({ track: "poly" }), { now: new Date(), track: "poly" }).map(
            (w) => w.focus.id
          ),
        senseStats: senseStats(plugin),
        aiStatus: () => plugin.ai.status(),
      }),
      mixTab({
        api: plugin.scenario,
        mountPlayer: mountScenarioPlayer,
        mountMistakes: mountMistakes(plugin),
        ready: () => scenarioReady(plugin),
        vocabRefs: () =>
          pickVocabRefs(plugin.store.entries, parseFilterValue(plugin.learner.filter("vocab")), new Date()),
        vocabScopeIds: () =>
          vocabScopeIds(plugin.store.entries, parseFilterValue(plugin.learner.filter("vocab")), new Date()),
        grammarRefs: () => mixGrammarRefs(plugin),
        polySenses: () => sensesInFilter(parsePolyFilter(plugin.learner.filter("poly"))),
        aiStatus: () => plugin.ai.status(),
      }),
      paraTab({
        api: plugin.scenario,
        mountPlayer: mountScenarioPlayer,
        mountMistakes: mountMistakes(plugin),
        ready: async () => {
          await Promise.all([scenarioReady(plugin), plugin.threads.ensureLoaded()]);
        },
        threads: () => plugin.threads.paragraphThreads(),
        onFilterChange: (fn) => plugin.learner.events.on("filter:change", (track) => track === "para" && fn()),
        aiStatus: () => plugin.ai.status(),
      }),
    ],
    filters: practiceFilters(plugin),
    vocabScenario: () => ({
      api: plugin.scenario,
      mountPlayer: mountScenarioPlayer,
      mountMistakes: mountMistakes(plugin),
      ready: () => scenarioReady(plugin),
      aiStatus: () => plugin.ai.status(),
    }),
  };
}

// Every vocab-* code block (規劃書 06 §9.6). The block body is its params
// (`key: value`, one per line); each renderer owns a MarkdownRenderChild
// added through ctx.addChild, so subscriptions end with the block.

export interface BlockDef {
  lang: string;
  render(plugin: VocabTrackerPlugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void;
}

export const BLOCKS: readonly BlockDef[] = [
  { lang: "vocab-dashboard", render: renderDashboard },
  { lang: "vocab-flashcards", render: renderFlashcards },
  // 1010 A: one name per page — the old block names above/below keep working.
  { lang: "vocab-card", render: renderFlashcards },
  // The plugin is the block's WordHeaderHost.
  { lang: WORD_BLOCK_LANG, render: renderWordHeader },
  // 1016 #1: the word page's 「## Info」/「## 字根」 sections.
  { lang: WORD_INFO_LANG, render: renderWordInfo },
  { lang: WORD_DNA_LANG, render: renderWordDna },
  // M7 (規劃書 06 §7): 字族樹, 動詞用法, 冷知識.
  { lang: "vocab-families", render: renderFamilies },
  // Same block under the name the galaxy redesign uses (09 〔A2〕).
  { lang: "vocab-galaxy", render: renderFamilies },
  { lang: "vocab-verbs", render: renderVerbs },
  { lang: "vocab-usage", render: renderVerbs },
  { lang: "vocab-trivia", render: renderTrivia },
  { lang: "vocab-eureka", render: renderTrivia },
  { lang: "vocab-buddy", render: renderBuddy },
  // Wave 9 (規劃書 09 §7): Word DNA — morpheme breakdown, timeline, 冷知識.
  { lang: "vocab-dna", render: (plugin, source, el, ctx) =>
      // Only the Word DNA entry file feeds the sidebar (規劃書 10 §2.1).
      renderDna({ ...dnaDeps(plugin), isEntryFile: plugin.files.entryFilePath("dna") === ctx.sourcePath }, source, el, ctx) },
  { lang: "vocab-practice", render: (p, s, el, ctx) => renderPractice(practiceHost(p), s, el, ctx) },
  // Wave 15: 文法學習.
  { lang: "vocab-grammar", render: (p, s, el, ctx) => renderGrammarMap(grammarMapDeps(p), s, el, ctx) },
  { lang: "vocab-grammar-topic", render: (p, s, el, ctx) => renderGrammarTopic(grammarTopicDeps(p), s, el, ctx) },
  // 第十七波 Q: Polysemy.md 的意思地圖.
  { lang: "vocab-polysemy", render: (p, s, el, ctx) => renderPolysemyMap(polysemyDeps(p), s, el, ctx) },
  { lang: "vocab-grammar-practice", render: (p, s, el, ctx) => renderGrammarPractice(grammarPracticeDeps(p), s, el, ctx) },
];

export function registerBlocks(plugin: VocabTrackerPlugin): void {
  for (const def of BLOCKS) {
    plugin.registerMarkdownCodeBlockProcessor(def.lang, (source, el, ctx) =>
      def.render(plugin, source, el, ctx)
    );
  }
}
