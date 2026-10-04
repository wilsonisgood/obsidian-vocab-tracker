import { describe, expect, it } from "vitest";
import { findManagedBlock } from "../../../src/services/export/managedBlock";
import { hasAiNoteContent, renderAiNoteFile, renderAiNoteSections, type AiNoteInput } from "../../../src/services/export/renderers/aiNote";
import { balanceFences, blockquote, frontmatter, inlineCode, roundsOf } from "../../../src/services/export/renderers/common";
import { renderTriviaFavoritesFile, renderTriviaFavoritesSections } from "../../../src/services/export/renderers/triviaFavorites";
import {
  familiesOf,
  hasWordPageContent,
  renderWordPageFile,
  renderWordPageSections,
  triviaAbout,
  triviaMentioning,
  type WordPageInput,
} from "../../../src/services/export/renderers/wordPage";
import { EXPORT_LABELS_EN } from "../../../src/services/export/labels";
import { ARTICLE, ctx, FAMILIES, GLITTERY, GLITTERY_THREAD, LEOTARD, TRIVIA, turn, USAGE } from "./fixtures";

// Snapshot tests of the exported Markdown (規劃書 06 §11): any change to
// what lands in the user's vault shows up in review.

const FULL: WordPageInput = { entry: GLITTERY, families: FAMILIES, usage: USAGE, trivia: TRIVIA, thread: GLITTERY_THREAD };
const EMPTY: WordPageInput = { entry: { id: "x", word: "leotard" }, families: [], trivia: [] };

const P12 = "Last time I was in a stadium this size, I was dancing in heels and wearing a glittery leotard.";
const P13 = "all the trustees and members of the board";

const NOTE: AiNoteInput = {
  articlePath: ARTICLE,
  paragraphs: [
    // Out of order on purpose: rendered by index.
    {
      index: 12,
      text: P13,
      turns: [
        turn("user", "翻譯", { taskId: "paragraph.translate", at: "2026-10-02T01:00:00.000Z" }),
        turn("assistant", "所有董事與理事會成員……"),
      ],
    },
    {
      index: 11,
      text: P12,
      blockId: "vt-a1b2c3",
      turns: [
        turn("user", "為什麼用 was dancing，不用 danced？", { taskId: "paragraph.grammar", at: "2026-10-01T01:00:00.000Z" }),
        turn("assistant", "**過去進行式**用來描述那一刻正在進行的畫面……"),
        turn("user", "用比較簡單的說法改寫", { taskId: "paragraph.rephrase", at: "2026-10-03T01:00:00.000Z" }),
        turn("assistant", "The last time I stood in a stadium this big…"),
      ],
    },
    {
      index: null,
      text: "A paragraph that was\ndeleted from the note.",
      blockId: "vt-zzzzzz",
      turns: [turn("user", "這段在說什麼？"), turn("assistant", "在說一段已經被刪掉的內容。")],
    },
    // Only a failed round: skipped.
    { index: 3, text: "Nothing exported here.", turns: [turn("user", "?"), turn("assistant", "", { status: "error" })] },
  ],
  words: [
    { word: "glittery", entryId: GLITTERY.id, questions: 1 },
    { word: "leotard", entryId: LEOTARD.id, questions: 0 },
    { word: "honorees", questions: 0 },
  ],
};

describe("word page renderer", () => {
  it("renders every section (snapshot)", () => {
    const sections = renderWordPageSections(FULL, ctx());
    expect(sections.map((s) => s.name)).toEqual(["families", "usage", "trivia", "discussion"]);
    expect(sections.map((s) => `[${s.name}]\n${s.body}`).join("\n\n")).toMatchSnapshot();
  });

  it("renders the new-file template (snapshot)", () => {
    expect(renderWordPageFile(FULL, ctx())).toMatchSnapshot();
  });

  it("renders empty states (snapshot)", () => {
    expect(renderWordPageFile(EMPTY, ctx())).toMatchSnapshot();
  });

  it("renders English labels (snapshot)", () => {
    expect(renderWordPageFile(EMPTY, { ...ctx(), labels: EXPORT_LABELS_EN })).toMatchSnapshot();
  });

  it("writes frontmatter the word page decorator and id lookup rely on", () => {
    const file = renderWordPageFile(FULL, ctx());
    expect(file.startsWith('---\nvocab-tracker: word\nvocab-tracker-id: "1721900000000"\n---\n```vocab-word\n```\n')).toBe(true);
  });

  it("puts every section inside a findable managed block", () => {
    const file = renderWordPageFile(FULL, ctx());
    for (const name of ["families", "usage", "trivia", "discussion"]) expect(findManagedBlock(file, name)).not.toBeNull();
  });

  it("links other words only when they have a page", () => {
    const body = renderWordPageSections(FULL, ctx({})).find((s) => s.name === "families")!.body;
    expect(body).not.toContain("[[");
    const linked = renderWordPageSections(FULL, ctx()).find((s) => s.name === "families")!.body;
    expect(linked).toContain("[[vocab-list/單字/leotard|leotard]] 緊身衣");
    // The page's own word is bold, never a link to itself.
    expect(linked).toContain("**glittery**");
    expect(linked).not.toContain("|glittery]]");
  });

  it("closes a code fence left open by a stopped answer", () => {
    const body = renderWordPageSections(FULL, ctx()).find((s) => s.name === "discussion")!.body;
    expect(body).toContain("```js\n// a glittery\n```\n\n*（已停止）*");
  });

  it("decides when a page is worth creating on its own", () => {
    expect(hasWordPageContent(FULL)).toBe(true);
    expect(hasWordPageContent(EMPTY)).toBe(false);
    // Families or usage alone don't create a page (§8.2).
    expect(hasWordPageContent({ ...EMPTY, families: FAMILIES, usage: USAGE })).toBe(false);
    // Saved trivia does.
    expect(hasWordPageContent({ entry: GLITTERY, families: [], trivia: [TRIVIA[0]] })).toBe(true);
    // A deleted favourite doesn't.
    expect(hasWordPageContent({ entry: GLITTERY, families: [], trivia: [TRIVIA[2]] })).toBe(false);
    // A thread with only failed / streaming rounds doesn't.
    const failed = { ...GLITTERY_THREAD, turns: GLITTERY_THREAD.turns.slice(2, 6) };
    expect(hasWordPageContent({ entry: GLITTERY, families: [], trivia: [], thread: failed })).toBe(false);
  });

  it("picks families by entry id, or by word for plain members", () => {
    expect(familiesOf(FAMILIES, GLITTERY).map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(familiesOf(FAMILIES, LEOTARD).map((f) => f.id)).toEqual(["f1", "f3"]);
  });

  it("separates a word's own trivia from trivia that mentions it", () => {
    expect(triviaAbout(TRIVIA, GLITTERY.id).map((t) => t.id)).toEqual(["tr1"]);
    expect(triviaMentioning(TRIVIA, GLITTERY).map((t) => t.id)).toEqual(["tr2"]);
    expect(triviaMentioning(TRIVIA, LEOTARD).map((t) => t.id)).toEqual(["tr1"]);
  });
});

describe("AI note renderer", () => {
  it("renders paragraphs in note order, then the words (snapshot)", () => {
    expect(renderAiNoteFile(NOTE, ctx())).toMatchSnapshot();
  });

  it("orders by paragraph index, orphans last", () => {
    const body = renderAiNoteSections(NOTE, ctx())[0].body;
    const i12 = body.indexOf("## ¶12");
    const i13 = body.indexOf("## ¶13");
    const orphan = body.indexOf("## 原文中找不到這段");
    expect(i12).toBeGreaterThanOrEqual(0);
    expect(i12).toBeLessThan(i13);
    expect(i13).toBeLessThan(orphan);
    expect(body).not.toContain("¶4");
  });

  it("embeds live paragraphs by block id and quotes the rest", () => {
    const body = renderAiNoteSections(NOTE, ctx())[0].body;
    expect(body).toContain("![[eng/Taylor_Swift_NYU_Speech_Transcript#^vt-a1b2c3]]");
    expect(body).toContain(`> ${P13}`);
    // Orphan with a stale block id: quoted, not embedded.
    expect(body).not.toContain("vt-zzzzzz");
    expect(body).toContain("> A paragraph that was\n> deleted from the note.");
  });

  it("renders empty states (snapshot)", () => {
    const empty: AiNoteInput = { articlePath: "Note.md", paragraphs: [], words: [] };
    expect(hasAiNoteContent(empty)).toBe(false);
    expect(hasAiNoteContent(NOTE)).toBe(true);
    expect(renderAiNoteFile(empty, ctx())).toMatchSnapshot();
  });
});

describe("trivia favourites renderer", () => {
  it("renders saved items newest first (snapshot)", () => {
    expect(renderTriviaFavoritesFile({ items: TRIVIA }, ctx())).toMatchSnapshot();
  });

  it("renders the empty state", () => {
    expect(renderTriviaFavoritesSections({ items: [] }, ctx())[0].body).toBe("## 收藏\n\n*還沒有收藏。*");
  });
});

describe("renderer helpers", () => {
  it("pairs questions with finished or stopped answers only", () => {
    const rounds = roundsOf(GLITTERY_THREAD.turns);
    expect(rounds.map((r) => r.question.content)).toEqual(["glittery 和 sparkly 差在哪？", "怎麼用在程式碼註解裡？"]);
  });

  it("balanceFences closes only unbalanced fences", () => {
    expect(balanceFences("```\ncode\n```")).toBe("```\ncode\n```");
    expect(balanceFences("```py\ncode")).toBe("```py\ncode\n```");
    expect(balanceFences("~~~~\ncode\n```\n")).toBe("~~~~\ncode\n```\n~~~~");
    expect(balanceFences("text")).toBe("text");
  });

  it("blockquote keeps blank lines inside the quote", () => {
    expect(blockquote("a\n\nb")).toBe("> a\n>\n> b");
  });

  it("inlineCode survives backticks", () => {
    expect(inlineCode("a + b")).toBe("`a + b`");
    expect(inlineCode("use `x`")).toBe("`` use `x` ``");
  });

  it("frontmatter quotes values YAML would misread", () => {
    expect(frontmatter({ a: "word", b: "123", c: "true", d: "[[x]]", e: "a: b" })).toBe(
      '---\na: word\nb: "123"\nc: "true"\nd: "[[x]]"\ne: "a: b"\n---'
    );
  });
});
