import { beforeEach, describe, expect, it, vi } from "vitest";

// Built-in explanations are switched per test (default: none), so the
// layout tests don't depend on which topics have one.
const builtIn = vi.hoisted(() => ({ text: undefined as string | undefined }));
vi.mock("../../../src/core/grammar/explanations", () => ({ builtInExplanation: () => builtIn.text }));

import { GrammarPages } from "../../../src/services/grammar/GrammarPages";
import { GrammarPageError } from "../../../src/services/grammar/topicPage";
import { MemoryVault } from "../files/fakes";

function setup() {
  const vault = new MemoryVault();
  const opened: string[] = [];
  const pages = new GrammarPages({
    vault,
    folder: () => "vocab-list",
    openPath: async (p) => void opened.push(p),
  });
  return { vault, pages, opened };
}

describe("GrammarPages", () => {
  beforeEach(() => {
    builtIn.text = undefined;
  });

  it("builds the path from the entry folder and the topic's title", () => {
    expect(setup().pages.pathOf("be-verb")).toBe("vocab-list/Grammar/be 動詞.md");
    expect(() => setup().pages.pathOf("nope")).toThrow(/Unknown grammar topic/);
  });

  it("creates the page the first time it is opened, then opens it", async () => {
    const { vault, pages, opened } = setup();
    await pages.open("be-verb");
    expect(vault.log).toEqual(["create vocab-list/Grammar/be 動詞.md"]);
    expect(vault.files.get("vocab-list/Grammar/be 動詞.md")).toContain("vocab-tracker-id: be-verb");
    expect(opened).toEqual(["vocab-list/Grammar/be 動詞.md"]);
    await pages.open("be-verb");
    expect(vault.log).toHaveLength(1);
    expect(opened).toHaveLength(2);
  });

  it("creates once when called twice at the same time", async () => {
    const { vault, pages } = setup();
    await Promise.all([pages.open("be-verb"), pages.open("be-verb")]);
    expect(vault.log).toEqual(["create vocab-list/Grammar/be 動詞.md"]);
  });

  it("finds a page the learner renamed or moved", async () => {
    const { vault, pages, opened } = setup();
    await pages.open("be-verb");
    vault.move("vocab-list/Grammar/be 動詞.md", "我的/be.md");
    await pages.open("be-verb");
    expect(opened.at(-1)).toBe("我的/be.md");
    expect(vault.log).toHaveLength(1);
  });

  it("uses a file that appears while creating, without overwriting", async () => {
    const { vault, pages } = setup();
    vault.beforeCreate = (p) => vault.files.set(p, "mine");
    await pages.open("be-verb");
    expect(vault.files.get("vocab-list/Grammar/be 動詞.md")).toBe("mine");
  });

  it("writes the explanation once, then refuses", async () => {
    const { vault, pages } = setup();
    await pages.writeExplanation("be-verb", "說明內容");
    const path = "vocab-list/Grammar/be 動詞.md";
    expect(vault.files.get(path)).toContain("## 說明\n\n說明內容\n\n```vocab-grammar-practice");
    const before = vault.files.get(path);
    await expect(pages.writeExplanation("be-verb", "另一份")).rejects.toBeInstanceOf(GrammarPageError);
    expect(vault.files.get(path)).toBe(before);
  });

  it("waits for the vault index before looking", async () => {
    const { vault, pages } = setup();
    const ready = vi.spyOn(vault, "ready");
    await pages.ensure("be-verb");
    expect(ready).toHaveBeenCalled();
  });
  it("creates a new page with the built-in explanation already in it", async () => {
    builtIn.text = "**核心概念**\n內建";
    const { vault, pages } = setup();
    await pages.ensure("be-verb");
    expect(vault.files.get("vocab-list/Grammar/be 動詞.md")).toContain("## 說明\n\n**核心概念**\n內建\n\n```vocab-grammar-practice");
  });

  it("fills an existing page's empty 說明 once, and never touches the learner's text", async () => {
    const { vault, pages } = setup();
    await pages.ensure("be-verb"); // page made with no built-in
    const path = "vocab-list/Grammar/be 動詞.md";
    builtIn.text = "內建說明";
    await pages.ensure("be-verb");
    expect(vault.files.get(path)).toContain("## 說明\n\n內建說明\n\n```vocab-grammar-practice");
    const filled = vault.files.get(path)!;
    await pages.ensure("be-verb");
    expect(vault.files.get(path)).toBe(filled);

    vault.files.set(path, filled.replace("內建說明", "我自己寫的"));
    await pages.ensure("be-verb");
    expect(vault.files.get(path)).toContain("我自己寫的");
    expect(vault.files.get(path)).not.toContain("內建說明");
  });

  it("writeBuiltInExplanation fills the section, and rejects for a topic without one", async () => {
    const { vault, pages } = setup();
    await expect(pages.writeBuiltInExplanation("be-verb")).rejects.toBeInstanceOf(GrammarPageError);
    await pages.ensure("be-verb");
    builtIn.text = "內建說明";
    await pages.writeBuiltInExplanation("be-verb");
    expect(vault.files.get("vocab-list/Grammar/be 動詞.md")).toContain("內建說明");
  });
});
