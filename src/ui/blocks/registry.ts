import type { MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { renderDashboard } from "./dashboard";
import { renderDna, type DnaBlockDeps } from "./dna";
import { renderFamilies } from "./families";
import { renderFlashcards } from "./flashcards";
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
  // The plugin is the block's WordHeaderHost.
  { lang: WORD_BLOCK_LANG, render: renderWordHeader },
  // M7 (規劃書 06 §7): 字族樹, 動詞用法, 冷知識.
  { lang: "vocab-families", render: renderFamilies },
  // Same block under the name the galaxy redesign uses (09 〔A2〕).
  { lang: "vocab-galaxy", render: renderFamilies },
  { lang: "vocab-verbs", render: renderVerbs },
  { lang: "vocab-trivia", render: renderTrivia },
  // Wave 9 (規劃書 09 §7): Word DNA — morpheme breakdown, timeline, 冷知識.
  { lang: "vocab-dna", render: (plugin, source, el, ctx) => renderDna(dnaDeps(plugin), source, el, ctx) },
];

export function registerBlocks(plugin: VocabTrackerPlugin): void {
  for (const def of BLOCKS) {
    plugin.registerMarkdownCodeBlockProcessor(def.lang, (source, el, ctx) =>
      def.render(plugin, source, el, ctx)
    );
  }
}
