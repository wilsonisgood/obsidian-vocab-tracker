import { describe, expect, it } from "vitest";
import { clozeParts } from "../../../src/core/text/cloze";

describe("clozeParts", () => {
  it("splits around the word", () => {
    expect(clozeParts("She wore a glittery leotard on stage.", "leotard")).toEqual({
      before: "She wore a glittery ",
      answer: "leotard",
      after: " on stage.",
    });
  });

  it("matches case-insensitively and keeps the sentence's casing", () => {
    expect(clozeParts("Endeavor to persevere.", "endeavor")?.answer).toBe("Endeavor");
  });

  it("matches common inflections", () => {
    expect(clozeParts("All our endeavors failed.", "endeavor")?.answer).toBe("endeavors");
    expect(clozeParts("He toiled all day.", "toil")?.answer).toBe("toiled");
  });

  it("does not match inside a longer word", () => {
    expect(clozeParts("Read the article.", "art")).toBeNull();
    expect(clozeParts("A non-toil day.", "non")).toBeNull();
  });

  it("returns null without an example or when the word is absent", () => {
    expect(clozeParts("", "word")).toBeNull();
    expect(clozeParts("Nothing here.", "word")).toBeNull();
  });

  it("escapes regex characters in the word", () => {
    expect(clozeParts("Use C++ daily.", "C++")?.answer).toBe("C++");
    expect(clozeParts("aXb test", "a.b")).toBeNull();
    expect(clozeParts("a.b test", "a.b")?.answer).toBe("a.b");
  });
});
