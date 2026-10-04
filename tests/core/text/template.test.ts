import { describe, expect, it } from "vitest";
import { renderTemplate, templateSlots } from "../../../src/core/text/template";
import { splitParagraphs } from "../../../src/core/text/paragraphs";
import { estimateTokens } from "../../../src/core/text/tokens";

describe("renderTemplate", () => {
  it("fills named slots", () => {
    expect(renderTemplate("Hi {{name}}, {{n}} words", { name: "Will", n: 3 })).toBe("Hi Will, 3 words");
  });

  it("renders missing slots as empty", () => {
    expect(renderTemplate("a{{missing}}b", {})).toBe("ab");
  });

  it("keeps {{#x}} sections only when x is non-empty", () => {
    const t = "{{#sel}}選取：{{sel}}\n{{/sel}}問題";
    expect(renderTemplate(t, { sel: "foo" })).toBe("選取：foo\n問題");
    expect(renderTemplate(t, { sel: "  " })).toBe("問題");
    expect(renderTemplate(t, {})).toBe("問題");
  });

  it("keeps {{^x}} sections only when x is empty", () => {
    const t = "{{#x}}有{{/x}}{{^x}}沒有{{/x}}";
    expect(renderTemplate(t, { x: "1" })).toBe("有");
    expect(renderTemplate(t, { x: "" })).toBe("沒有");
  });

  it("treats 0 as filled (callers pass undefined to omit)", () => {
    expect(renderTemplate("{{#n}}n={{n}}{{/n}}", { n: 0 })).toBe("n=0");
  });

  it("handles nested sections with different names", () => {
    const t = "{{#a}}A{{#b}}B{{/b}}{{^b}}-{{/b}}{{/a}}";
    expect(renderTemplate(t, { a: "1", b: "1" })).toBe("AB");
    expect(renderTemplate(t, { a: "1" })).toBe("A-");
    expect(renderTemplate(t, { b: "1" })).toBe("");
  });

  it("collapses blank-line runs left by omitted sections and trims", () => {
    expect(renderTemplate("\nA\n\n{{#x}}X\n\n{{/x}}\n\nB  \n", {})).toBe("A\n\nB");
  });

  it("lists every slot a template references", () => {
    expect(templateSlots("{{a}} {{#b}}{{c}}{{/b}} {{^d}}{{/d}}")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("splitParagraphs", () => {
  it("splits on blank lines, drops frontmatter, keeps fenced code together", () => {
    const md = "---\ntitle: x\n---\n# Title\n\nFirst line\nsecond line\n\n```\ncode\n\nmore code\n```\n\n\nLast.";
    expect(splitParagraphs(md)).toEqual(["# Title", "First line\nsecond line", "```\ncode\n\nmore code\n```", "Last."]);
  });
});

describe("estimateTokens", () => {
  it("counts ~4 latin chars per token and 1 per CJK char", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("中文字")).toBe(3);
    expect(estimateTokens("中文 abcd")).toBe(2 + 2);
  });
});
