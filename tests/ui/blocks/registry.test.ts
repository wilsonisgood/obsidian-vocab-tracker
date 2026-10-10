import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../../perf/support/obsidian"));

import { BLOCKS } from "../../../src/ui/blocks/registry";

// 1010 A: each page has one new block name; the old names keep working.
describe("block registry names", () => {
  const renderer = (lang: string) => BLOCKS.find((b) => b.lang === lang)?.render;

  it.each([
    ["vocab-card", "vocab-flashcards"],
    ["vocab-galaxy", "vocab-families"],
    ["vocab-usage", "vocab-verbs"],
    ["vocab-eureka", "vocab-trivia"],
  ])("%s and %s draw with the same renderer", (next, old) => {
    expect(renderer(next)).toBeDefined();
    expect(renderer(next)).toBe(renderer(old));
  });

  it("registers no language twice", () => {
    const langs = BLOCKS.map((b) => b.lang);
    expect(new Set(langs).size).toBe(langs.length);
  });
});
