import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (u: URL) => readFileSync(u, "utf8");

describe("flashcard ratings on mobile (mobile.css)", () => {
  const css = read(new URL("../../src/styles/mobile.css", import.meta.url));

  it("is 2×2 on iPhone and on any iPad by default (narrow Split View / Slide Over)", () => {
    expect(css).toMatch(
      /body\.is-phone \.vt-fc-ratings,\s*body\.is-tablet \.vt-fc-ratings \{\s*grid-template-columns: repeat\(2,/
    );
  });

  it("is one row of four only on an iPad at least 600px wide", () => {
    expect(css).toMatch(
      /@media \(min-width: 600px\) \{\s*body\.is-tablet \.vt-fc-ratings \{\s*grid-template-columns: repeat\(4,/
    );
    // and never unconditionally four-across on a tablet
    const outsideMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    expect(outsideMedia).not.toMatch(/is-tablet[^{]*\{[^}]*repeat\(4,/);
  });
});
