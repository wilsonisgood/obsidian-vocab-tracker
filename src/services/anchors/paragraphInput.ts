import { plainParagraph, splitParagraphSpans } from "../../core/text/paragraphs";
import { buildWordRe } from "../../core/text/wordRe";
import type { ParagraphInput } from "../ai/context/paragraphContext";
import type { AnchorResolution, ParagraphAnchor } from "./ParagraphAnchorService";

// Builds the paragraph task input (規劃書 06 §6.4 段落: the whole article,
// the focus paragraph, the selection and the question) from where the
// anchor resolved to. Paragraph numbering follows core/text/paragraphs.ts
// — the same ¶ numbers word discussions use (「出自 ¶12」).

export interface ParagraphExtras {
  question?: string;
  selection?: string;
  // Every word in the user's list; only the ones that actually occur in
  // the focus paragraph are sent (the vocab task skips them), so a large
  // word list doesn't inflate the prompt.
  knownWords?: readonly string[];
}

export function noteTitle(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

export function knownWordsIn(paragraph: string, words: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const word = w.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    if (buildWordRe(word).test(paragraph)) {
      seen.add(key);
      out.push(word);
    }
  }
  return out;
}

// The article split into paragraphs with the anchored section as exactly
// one of them: blank-line spans that overlap the section are replaced by
// the section itself, so a loose list (blank lines between items) is still
// one focus paragraph.
export function paragraphInput(anchor: ParagraphAnchor, where: AnchorResolution, extra: ParagraphExtras = {}): ParagraphInput {
  let paragraphs: string[];
  let paragraphIndex: number;
  if (where.status === "found") {
    const { section, content } = where;
    const spans = splitParagraphSpans(content);
    const before = spans.filter((s) => s.lineEnd < section.lineStart).map((s) => plainParagraph(s.text));
    const after = spans.filter((s) => s.lineStart > section.lineEnd).map((s) => plainParagraph(s.text));
    paragraphs = [...before, plainParagraph(section.text), ...after];
    paragraphIndex = before.length;
  } else {
    // Orphaned (note deleted, paragraph gone): the discussion can still
    // continue about the text saved when it started.
    paragraphs = [anchor.snapshot];
    paragraphIndex = 0;
  }
  const focus = paragraphs[paragraphIndex];
  const input: ParagraphInput = { article: { title: noteTitle(anchor.path), paragraphs }, paragraphIndex };
  if (extra.selection) input.selection = extra.selection;
  if (extra.question) input.question = extra.question;
  const known = knownWordsIn(focus, extra.knownWords ?? []);
  if (known.length) input.knownWords = known;
  return input;
}
