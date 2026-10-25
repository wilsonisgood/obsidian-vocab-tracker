import type { VocabEntry } from "../../core/model/entry";
import { segmentText, type Lookup } from "../../core/wordlists/scan";
import { savedWords, vocabLookup } from "../../core/wordlists/vocabLookup";
import { SKIP } from "./examHighlight";

export const VOCAB_AUTO_CLS = "vt-vocab-auto";

// Highlights saved words in every note's reading view, like the ==word==
// that adding a word writes into the note it came from. View-only: other
// notes' markdown is never touched, so deleting the word (or turning the
// setting off) leaves no trace. Each hit is a real <mark>, so the exam
// underliner skips it and processMarks() makes it open the word card.
export function highlightVocabWords(el: HTMLElement, lookup: Lookup): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest(SKIP) || !/[A-Za-z]/.test(n.nodeValue ?? "")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  // Collect first: replacing nodes mid-walk would derail the walker.
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

  for (const node of nodes) {
    const segments = segmentText(node.nodeValue ?? "", lookup);
    if (!segments) continue;
    const frag = document.createDocumentFragment();
    for (const seg of segments) {
      if (typeof seg === "string") {
        frag.appendChild(document.createTextNode(seg));
        continue;
      }
      const mark = frag.createEl("mark", { cls: VOCAB_AUTO_CLS, text: seg.word });
      // The saved word ("analyze" for text that says "analyzed").
      mark.dataset.vtWord = seg.tags[0];
    }
    node.replaceWith(frag);
  }
}

export interface VocabHighlighterDeps {
  entries: () => readonly VocabEntry[];
  enabled: () => boolean;
  inflections: () => boolean;
  // Re-run the reading views' post-processors.
  rerender: () => void;
}

// Keeps the lookup current. Most data:changed events (a review, a liked
// word, a settings edit elsewhere) leave the saved words alone, and
// re-rendering every open note for those would just flicker — so this only
// re-renders when what gets highlighted actually changed.
export class VocabHighlighter {
  private key: string | null = null;
  private lookup: Lookup | null = null;

  constructor(private deps: VocabHighlighterDeps) {}

  // Call on the store's data:changed.
  refresh(): void {
    const before = this.key;
    this.build();
    if (before !== null && before !== this.key) this.deps.rerender();
  }

  process = (el: HTMLElement): void => {
    if (this.key === null) this.build();
    if (this.lookup) highlightVocabWords(el, this.lookup);
  };

  private build(): void {
    const enabled = this.deps.enabled();
    const inflections = this.deps.inflections();
    const words = enabled ? savedWords(this.deps.entries()) : new Set<string>();
    this.key = `${enabled}|${inflections}|${[...words].sort().join(" ")}`;
    this.lookup = words.size > 0 ? vocabLookup(words, inflections) : null;
  }
}
