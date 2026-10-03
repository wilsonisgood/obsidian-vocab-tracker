import { describe, expect, it } from "vitest";
import { extractSentence } from "../../../src/core/text/sentence";

function fakeNode(parentElement: unknown): Node {
  return { parentElement } as unknown as Node;
}

describe("extractSentence", () => {
  it("extracts the sentence containing the word when boundaries exist", () => {
    const text = "First sentence. The cat sat. Third sentence.";
    const start = text.indexOf("cat");
    const end = start + 3;
    const node = fakeNode({ closest: () => null });
    expect(extractSentence(text, start, end, node)).toBe("The cat sat.");
  });

  it("falls back to the whole block when the text has no sentence boundary", () => {
    const text = "a cat sat";
    const start = text.indexOf("cat");
    const end = start + 3;
    const block = { textContent: "a cat sat (full block)" };
    const node = fakeNode({ closest: () => block });
    expect(extractSentence(text, start, end, node)).toBe("a cat sat (full block)");
  });

  it("falls back to the trimmed sentence when there is no node", () => {
    const text = "a cat sat";
    const start = text.indexOf("cat");
    const end = start + 3;
    expect(extractSentence(text, start, end, null)).toBe("a cat sat");
  });

  it("falls back to the trimmed sentence when the block text is too long", () => {
    const text = "a cat sat";
    const start = text.indexOf("cat");
    const end = start + 3;
    const block = { textContent: "x".repeat(500) };
    const node = fakeNode({ closest: () => block });
    expect(extractSentence(text, start, end, node)).toBe("a cat sat");
  });
});
