import { builtInExplanation } from "../../core/grammar/explanations";
import { joinPath } from "../../core/text/slug";
import { frontmatter } from "../export/renderers/common";

// The grammar topic page's file (第十五波 M, rule 9; 1013 §3.2). Pure —
// GrammarPages does the vault work. One note per topic, made the first
// time the learner opens it:
//
//   ---
//   vocab-tracker: grammar
//   vocab-tracker-id: <topicId>
//   ---
//   ```vocab-grammar-topic      ← M: header, objectives, sightings, related
//   ```
//   ## 說明                      ← written once by 「✦ 生成說明」, then the user's
//   ```vocab-grammar-practice   ← P: the practice block
//   ```
//   ## 我的筆記

export const GRAMMAR_PAGE_KIND = "grammar";
export const GRAMMAR_FOLDER = "Grammar";
export const EXPLAIN_HEADING = "## 說明";
export const TOPIC_BLOCK = "vocab-grammar-topic";
export const PRACTICE_BLOCK = "vocab-grammar-practice";
const BLOCK_PREFIX = "vocab-grammar-";

// What can go wrong writing the explanation (the UI keys its message on `code`).
export type GrammarPageErrorCode = "not-empty" | "no-section" | "empty-text";

export class GrammarPageError extends Error {
  constructor(
    public readonly code: GrammarPageErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "GrammarPageError";
  }
}

export function isGrammarPageError(e: unknown): e is GrammarPageError {
  return e instanceof GrammarPageError;
}

// ── Names ────────────────────────────────────────────────────────

// File name (without ".md") from the topic's title: characters a vault
// path or a wikilink can't hold become "-" (rule 9).
export function topicFileName(title: string, fallback: string): string {
  const name = title
    .replace(/[\\/:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim();
  return name || fallback;
}

// Where a new topic page goes: <entry-file folder>/Grammar/<title>.md.
export function topicPagePath(entryFolder: string, title: string, topicId: string): string {
  return joinPath(joinPath(entryFolder, GRAMMAR_FOLDER), `${topicFileName(title, topicId)}.md`);
}

export function renderTopicPage(topicId: string): string {
  // The built-in explanation (1013-2) goes right under 「## 說明」.
  const builtIn = builtInExplanation(topicId);
  const explanation = builtIn ? sanitizeExplanation(builtIn) : "";
  return [
    frontmatter({ "vocab-tracker": GRAMMAR_PAGE_KIND, "vocab-tracker-id": topicId }),
    "```" + TOPIC_BLOCK,
    `id: ${topicId}`,
    "```",
    "",
    EXPLAIN_HEADING,
    "",
    ...(explanation ? [explanation, ""] : []),
    "```" + PRACTICE_BLOCK,
    `topic: ${topicId}`,
    "```",
    "",
    "## 我的筆記",
    "",
  ].join("\n");
}

// ── The 「## 說明」 section ───────────────────────────────────────

const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/;
const EXPLAIN_RE = /^##[ \t]+說明[ \t]*$/;
const SECTION_END_RE = /^#{1,2}[ \t]/;

interface Fence {
  char: string;
  len: number;
}

// Walks the lines tracking fenced code, so a `## ` inside a code block is
// never taken for a heading. `visit` gets each line and whether it is
// inside (or is the fence line of) a fenced block, and the fence's info
// string when this line opens one.
function walk(lines: readonly string[], visit: (line: string, i: number, inFence: boolean, opens?: string) => void): void {
  let fence: Fence | null = null;
  lines.forEach((line, i) => {
    const m = FENCE_RE.exec(line);
    if (fence) {
      visit(line, i, true);
      if (m && m[1][0] === fence.char && m[1].length >= fence.len && !m[2].trim()) fence = null;
      return;
    }
    if (m) {
      fence = { char: m[1][0], len: m[1].length };
      visit(line, i, true, m[2].trim());
      return;
    }
    visit(line, i, false);
  });
}

export interface ExplanationSection {
  // 0-based line of 「## 說明」.
  heading: number;
  // First line after the section (the next `# `/`## ` heading, or the end).
  end: number;
  // True when nothing but whitespace and the plugin's own vocab-grammar-*
  // blocks (the practice block sits under 說明) is in the section.
  empty: boolean;
}

export function findExplanationSection(text: string): ExplanationSection | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let heading = -1;
  let end = lines.length;
  walk(lines, (line, i, inFence) => {
    if (inFence) return;
    if (heading < 0) {
      if (EXPLAIN_RE.test(line)) heading = i;
    } else if (end === lines.length && SECTION_END_RE.test(line)) {
      end = i;
    }
  });
  if (heading < 0) return null;

  // Re-walk the section's own lines: fences opened inside it.
  let own = false;
  let ownBlock = false;
  const body = lines.slice(heading + 1, end);
  walk(body, (line, _i, inFence, opens) => {
    if (opens !== undefined) ownBlock = opens.startsWith(BLOCK_PREFIX);
    if (inFence ? !ownBlock : line.trim() !== "") own = true;
  });
  return { heading, end, empty: !own };
}

// Headings inside an explanation would end the 說明 section early (and break
// 「is it empty」 afterwards): `#`/`##` become `###`, fenced code is left alone.
export function sanitizeExplanation(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").trim().split("\n");
  walk(lines, (line, i, inFence) => {
    if (!inFence) lines[i] = line.replace(/^#{1,2}(?=[ \t])/, "###");
  });
  return lines.join("\n").trim();
}

// The note's text with the explanation written right under 「## 說明」
// (before the practice block). Throws when the section is missing or the
// learner already has something in it — never overwrites.
export function insertExplanation(text: string, markdown: string): string {
  const body = sanitizeExplanation(markdown);
  if (!body) throw new GrammarPageError("empty-text");
  const sec = findExplanationSection(text);
  if (!sec) throw new GrammarPageError("no-section");
  if (!sec.empty) throw new GrammarPageError("not-empty");
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const head = lines.slice(0, sec.heading + 1);
  let rest = lines.slice(sec.heading + 1);
  while (rest.length && rest[0].trim() === "") rest = rest.slice(1);
  return [...head, "", body, ...(rest.length ? ["", ...rest] : [""])].join("\n");
}
