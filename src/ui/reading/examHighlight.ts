import { setTooltip } from "obsidian";
import { tagLabel } from "../../core/wordlists/parse";
import { segmentText, type Lookup } from "../../core/wordlists/scan";

export const EXAM_WORD_CLS = "vt-exam-word";

// Rendered text that isn't prose to read: code, math, links, tags, already
// tracked ==marks==, frontmatter/properties, and this plugin's own
// code-block UIs (dashboard, flashcards).
const SKIP = [
  "code", "pre", "a", "mark", "button", "input", "textarea", "script", "style",
  ".math", ".tag", ".internal-link", ".external-link", ".frontmatter",
  ".frontmatter-container", ".metadata-container", "[class*='block-language-']",
  `.${EXAM_WORD_CLS}`,
].join(", ");

// Underlines every list word inside a rendered reading-view section.
// Doesn't touch the note's markdown — it's purely a view-time decoration,
// so turning it off (or removing a list) leaves no trace in the file.
export function highlightExamWords(
  el: HTMLElement,
  lookup: Lookup,
  colorOf: (tag: string) => string
): void {
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
      const span = frag.createSpan({ cls: EXAM_WORD_CLS, text: seg.word });
      span.dataset.vtTags = seg.tags.join(" ");
      span.style.setProperty("--vt-exam-color", colorOf(seg.tags[0]));
      setTooltip(span, seg.tags.map(tagLabel).join(" · "), { delay: 300 });
    }
    node.replaceWith(frag);
  }
}
