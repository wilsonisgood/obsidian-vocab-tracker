import type { MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { renderDashboard } from "./dashboard";
import { renderDna, type DnaBlockDeps } from "./dna";
import { renderFamilies } from "./families";
import { renderFlashcards } from "./flashcards";
import { renderGrammarMap, type GrammarMapDeps } from "./grammarMap";
import { renderGrammarPractice, type GrammarPracticeDeps } from "./grammarPractice";
import { renderGrammarTopic, type GrammarTopicDeps } from "./grammarTopic";
import { openPluginSettings } from "../kit/openSettings";
import { renderTrivia } from "./trivia";
import { renderVerbs } from "./verbs";
import { renderWordHeader, WORD_BLOCK_LANG } from "./wordHeader";

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
    // R1: 錯題本「重做這組」 opens the practice in place.
    practice: grammarPracticeDeps(plugin),
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

function grammarPracticeDeps(plugin: VocabTrackerPlugin): GrammarPracticeDeps {
  return { app: plugin.app, manifestId: plugin.manifest.id, grammar: plugin.grammar, questions: plugin.grammarQuestions, ai: plugin.ai };
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
  // M7 (規劃書 06 §7): 字族樹, 動詞用法, 冷知識.
  { lang: "vocab-families", render: renderFamilies },
  // Same block under the name the galaxy redesign uses (09 〔A2〕).
  { lang: "vocab-galaxy", render: renderFamilies },
  { lang: "vocab-verbs", render: renderVerbs },
  { lang: "vocab-usage", render: renderVerbs },
  { lang: "vocab-trivia", render: renderTrivia },
  { lang: "vocab-eureka", render: renderTrivia },
  // Wave 9 (規劃書 09 §7): Word DNA — morpheme breakdown, timeline, 冷知識.
  { lang: "vocab-dna", render: (plugin, source, el, ctx) =>
      // Only the Word DNA entry file feeds the sidebar (規劃書 10 §2.1).
      renderDna({ ...dnaDeps(plugin), isEntryFile: plugin.files.entryFilePath("dna") === ctx.sourcePath }, source, el, ctx) },
  // Wave 15: 文法學習.
  { lang: "vocab-grammar", render: (p, s, el, ctx) => renderGrammarMap(grammarMapDeps(p), s, el, ctx) },
  { lang: "vocab-grammar-topic", render: (p, s, el, ctx) => renderGrammarTopic(grammarTopicDeps(p), s, el, ctx) },
  { lang: "vocab-grammar-practice", render: (p, s, el, ctx) => renderGrammarPractice(grammarPracticeDeps(p), s, el, ctx) },
];

export function registerBlocks(plugin: VocabTrackerPlugin): void {
  for (const def of BLOCKS) {
    plugin.registerMarkdownCodeBlockProcessor(def.lang, (source, el, ctx) =>
      def.render(plugin, source, el, ctx)
    );
  }
}
