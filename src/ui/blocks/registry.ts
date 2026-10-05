import type { MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { renderDashboard } from "./dashboard";
import { renderFlashcards } from "./flashcards";
import { renderWordHeader, WORD_BLOCK_LANG } from "./wordHeader";

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
];

export function registerBlocks(plugin: VocabTrackerPlugin): void {
  for (const def of BLOCKS) {
    plugin.registerMarkdownCodeBlockProcessor(def.lang, (source, el, ctx) =>
      def.render(plugin, source, el, ctx)
    );
  }
}
