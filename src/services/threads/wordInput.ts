import type { VocabEntry } from "../../core/model/entry";
import type { NoteReaderPort } from "../../core/ports";
import { paragraphAtLine, plainParagraph } from "../../core/text/paragraphs";
import type { WordInput } from "../ai/context/wordContext";

export interface WordSource {
  title: string;
  // 1-based ¶ number shown as 「出自 ¶12」.
  paragraphNumber: number;
  paragraph: string;
}

function basename(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

// The full paragraph the word was captured from (規劃書 06 §6.4: the whole
// paragraph, not just the sentence, so 「這句」 can be resolved). Null when
// the entry has no source or the note/line is gone — the prompt then falls
// back to the stored example sentence.
export async function findWordSource(entry: Pick<VocabEntry, "source">, notes: NoteReaderPort): Promise<WordSource | null> {
  const src = entry.source;
  if (!src?.path) return null;
  let content: string | null;
  try {
    content = await notes.read(src.path);
  } catch {
    return null;
  }
  if (content === null) return null;
  const hit = paragraphAtLine(content, src.line);
  if (!hit) return null;
  return { title: basename(src.path), paragraphNumber: hit.index + 1, paragraph: plainParagraph(hit.text) };
}

export function wordInput(
  entry: VocabEntry,
  source: WordSource | null,
  extra: Pick<WordInput, "selection" | "question" | "compareWith"> = {}
): WordInput {
  return {
    entry,
    sourceParagraph: source?.paragraph,
    sourceTitle: source?.title,
    ...extra,
  };
}
