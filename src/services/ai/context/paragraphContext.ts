import { renderTemplate } from "../../../core/text/template";
import { estimateTokens } from "../../../core/text/tokens";

// Context for paragraph discussions (規劃書 06 §6.4). The whole article goes
// into a cacheable system block; the focus paragraph goes into its own
// block; the selection and the question go into the final user message
// (tasks/paragraph.ts). The article block contains nothing specific to the
// focus paragraph, so every paragraph thread in the same article shares
// one cache entry.

export interface ArticleInput {
  title?: string;
  // Already split by the caller (M5 uses Obsidian section info;
  // core/text/paragraphs.ts covers plain markdown).
  paragraphs: string[];
}

export interface ParagraphInput {
  article: ArticleInput;
  // 0-based index into article.paragraphs.
  paragraphIndex: number;
  // Text the user highlighted, if any — the strongest hint for "which
  // sentence" a vague question is about.
  selection?: string;
  // Free-form question (custom task); quick-action tasks leave it empty.
  question?: string;
  // Words already in the user's list, so the vocab task skips them.
  knownWords?: string[];
}

export interface ParagraphContext {
  articleBlock: string;
  focusBlock: string;
  truncated: boolean;
  slots: {
    paragraph: string;
    paragraphNumber: number;
    selection: string;
    question: string;
    knownWords: string;
  };
}

// ~30k tokens per 規劃書 06 §6.4; beyond that only ±3 paragraphs are sent.
export const MAX_ARTICLE_TOKENS = 30_000;
export const TRUNCATE_WINDOW = 3;

export const ARTICLE_TEMPLATE = `〔文章〕{{#title}}《{{title}}》{{/title}}
{{#truncated}}（全文太長，這裡只附上〔目前段落〕前後各 {{window}} 段；段落編號仍是原文的編號。）{{/truncated}}

{{body}}`;

export const FOCUS_TEMPLATE = `〔目前段落〕¶{{paragraphNumber}}
{{paragraph}}`;

export function buildParagraphContext(
  input: ParagraphInput,
  opts: { maxArticleTokens?: number; window?: number } = {}
): ParagraphContext {
  const { paragraphs } = input.article;
  if (input.paragraphIndex < 0 || input.paragraphIndex >= paragraphs.length) {
    throw new RangeError(`paragraphIndex ${input.paragraphIndex} out of range (0..${paragraphs.length - 1})`);
  }
  const maxTokens = opts.maxArticleTokens ?? MAX_ARTICLE_TOKENS;
  const window = opts.window ?? TRUNCATE_WINDOW;

  const numbered = paragraphs.map((p, i) => `¶${i + 1} ${p.trim()}`);
  const truncated = estimateTokens(numbered.join("\n\n")) > maxTokens;
  const from = truncated ? Math.max(0, input.paragraphIndex - window) : 0;
  const to = truncated ? Math.min(paragraphs.length, input.paragraphIndex + window + 1) : paragraphs.length;

  const articleBlock = renderTemplate(ARTICLE_TEMPLATE, {
    title: input.article.title?.trim(),
    truncated: truncated ? "yes" : "",
    window,
    body: numbered.slice(from, to).join("\n\n"),
  });

  const paragraph = paragraphs[input.paragraphIndex].trim();
  const paragraphNumber = input.paragraphIndex + 1;
  return {
    articleBlock,
    focusBlock: renderTemplate(FOCUS_TEMPLATE, { paragraph, paragraphNumber }),
    truncated,
    slots: {
      paragraph,
      paragraphNumber,
      selection: input.selection?.trim() ?? "",
      question: input.question?.trim() ?? "",
      knownWords: (input.knownWords ?? []).join(", "),
    },
  };
}
