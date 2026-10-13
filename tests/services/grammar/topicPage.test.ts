import { describe, expect, it } from "vitest";
import {
  findExplanationSection,
  GrammarPageError,
  insertExplanation,
  renderTopicPage,
  sanitizeExplanation,
  topicFileName,
  topicPagePath,
} from "../../../src/services/grammar/topicPage";

describe("topic page file", () => {
  it("renders the fixed layout of rule 9", () => {
    expect(renderTopicPage("be-verb")).toMatchInlineSnapshot(`
      "---
      vocab-tracker: grammar
      vocab-tracker-id: be-verb
      ---
      \`\`\`vocab-grammar-topic
      id: be-verb
      \`\`\`

      ## 說明

      \`\`\`vocab-grammar-practice
      topic: be-verb
      \`\`\`

      ## 我的筆記
      "
    `);
  });

  it("names the file after the title, replacing characters a path can't hold", () => {
    expect(topicFileName("現在完成式 vs. 過去式", "x")).toBe("現在完成式 vs. 過去式");
    expect(topicFileName('a/b: c?  "d" [e]#f', "x")).toBe("a-b- c- -d- -e--f");
    expect(topicFileName("  ...  ", "fallback-id")).toBe("fallback-id");
    expect(topicPagePath("vocab-list", "be 動詞", "be-verb")).toBe("vocab-list/Grammar/be 動詞.md");
  });
});

describe("the 說明 section", () => {
  const fresh = renderTopicPage("be-verb");

  it("counts the practice block under it as empty", () => {
    const sec = findExplanationSection(fresh)!;
    expect(sec.empty).toBe(true);
    expect(fresh.split("\n")[sec.end]).toBe("## 我的筆記");
  });

  it("is not empty once the learner wrote anything", () => {
    expect(findExplanationSection(fresh.replace("## 說明\n", "## 說明\n\n我自己的筆記\n"))!.empty).toBe(false);
    // A code block of the learner's own counts too.
    expect(findExplanationSection(fresh.replace("## 說明\n", "## 說明\n```js\nx\n```\n"))!.empty).toBe(false);
  });

  it("is null without the heading, and ignores one inside a code block", () => {
    expect(findExplanationSection("# x\n\n## 筆記\n")).toBeNull();
    expect(findExplanationSection("```\n## 說明\n```\n")).toBeNull();
  });

  it("writes the explanation under the heading, before the practice block", () => {
    const out = insertExplanation(fresh, "**核心概念**\n\n- a\n- b");
    expect(out).toContain("## 說明\n\n**核心概念**\n\n- a\n- b\n\n```vocab-grammar-practice");
    expect(out.endsWith("## 我的筆記\n")).toBe(true);
    // Everything else is untouched.
    expect(out.replace("**核心概念**\n\n- a\n- b\n\n", "")).toBe(fresh);
  });

  it("never overwrites: a second write, or a learner's text, is refused", () => {
    const once = insertExplanation(fresh, "first");
    expect(() => insertExplanation(once, "second")).toThrowError(GrammarPageError);
    try {
      insertExplanation(once, "second");
    } catch (e) {
      expect((e as GrammarPageError).code).toBe("not-empty");
    }
  });

  it("refuses without the heading or with nothing to write", () => {
    expect(() => insertExplanation("# no\n", "x")).toThrowError(/no-section/);
    expect(() => insertExplanation(fresh, "  \n ")).toThrowError(/empty-text/);
  });

  it("demotes headings so the section can't end early, leaving code alone", () => {
    expect(sanitizeExplanation("# A\n## B\n### C\n```\n## code\n```\ntext")).toBe("### A\n### B\n### C\n```\n## code\n```\ntext");
    const out = insertExplanation(fresh, "## 例句\nx");
    expect(findExplanationSection(out)!.end).toBe(out.split("\n").indexOf("## 我的筆記"));
  });
});
