import { describe, expect, it } from "vitest";
import { canGradeLocally, grade } from "../../../src/core/grammar/grading";
import type { GrammarQuestion } from "../../../src/core/model/grammar";

function q(extra: Partial<GrammarQuestion>): GrammarQuestion {
  return { id: "q", topicId: "t", objectiveId: "o", type: "blank", stem: "x ___", answer: "x", explanation: "", errorTag: "other", ...extra };
}
const blank = (answer: string, accepted?: string[]) => q({ type: "blank", answer, accepted });

describe("grade — choice / find-error", () => {
  const choice = q({ type: "choice", options: ["lost", "have lost", "had lost"], answer: "have lost" });
  it("compares against the options", () => {
    expect(grade(choice, "have lost")).toEqual({ correct: true, normalizedGiven: "have lost" });
    expect(grade(choice, "lost")).toEqual({ correct: false, normalizedGiven: "lost" });
    expect(grade(choice, "  Have  Lost ")).toEqual({ correct: true, normalizedGiven: "have lost" });
  });
  it("a text that isn't an option is wrong", () => {
    expect(grade(choice, "has lost").correct).toBe(false);
    expect(grade(choice, "").correct).toBe(false);
  });
  it("find-error picks a fragment", () => {
    const f = q({ type: "find-error", stem: "We have visited Kyoto last year.", options: ["have visited", "Kyoto", "last year"], answer: "have visited", accepted: ["visited"] });
    expect(grade(f, "have visited").correct).toBe(true);
    expect(grade(f, "Kyoto").correct).toBe(false);
    // typing the corrected wording is not a pick
    expect(grade(f, "visited").correct).toBe(false);
  });
});

describe("grade — blank", () => {
  it("ignores case, spacing and final punctuation", () => {
    const b = blank("has finished");
    for (const g of ["has finished", "Has Finished", "  has   finished  ", "has finished.", "has finished!", "has finished ?"]) {
      expect(grade(b, g).correct, g).toBe(true);
    }
    expect(grade(b, "has finish").correct).toBe(false);
    expect(grade(b, "").correct).toBe(false);
    expect(grade(b, "   ").correct).toBe(false);
  });

  it("takes any accepted answer", () => {
    const b = blank("have been", ["'ve been", "have been living"]);
    expect(grade(b, "'ve been").correct).toBe(true);
    expect(grade(b, "have been living").correct).toBe(true);
    expect(grade(b, "has been").correct).toBe(false);
  });

  it("treats curly and straight quotes alike", () => {
    expect(grade(blank("don't"), "don’t").correct).toBe(true);
    expect(grade(blank("don’t"), "don't").correct).toBe(true);
    expect(grade(blank('"yes"'), "“yes”").correct).toBe(true);
    expect(grade(blank("don't"), "don`t").correct).toBe(true);
  });

  it("treats a contraction and its expansion as the same", () => {
    expect(grade(blank("don't"), "do not").correct).toBe(true);
    expect(grade(blank("do not"), "don't").correct).toBe(true);
    expect(grade(blank("I'm"), "I am").correct).toBe(true);
    expect(grade(blank("they're"), "They are").correct).toBe(true);
    expect(grade(blank("we've"), "we have").correct).toBe(true);
    expect(grade(blank("she'll"), "she will").correct).toBe(true);
    expect(grade(blank("isn't"), "is not").correct).toBe(true);
    expect(grade(blank("won't"), "will not").correct).toBe(true);
    expect(grade(blank("can't"), "cannot").correct).toBe(true);
    expect(grade(blank("can't"), "can not").correct).toBe(true);
    expect(grade(blank("let's"), "let us").correct).toBe(true);
    // but not each other's opposites
    expect(grade(blank("don't"), "do").correct).toBe(false);
    expect(grade(blank("I'm"), "I was").correct).toBe(false);
  });

  it("'d and 's keep both readings", () => {
    expect(grade(blank("I'd gone"), "I had gone").correct).toBe(true);
    expect(grade(blank("I'd go"), "I would go").correct).toBe(true);
    expect(grade(blank("I had gone"), "I'd gone").correct).toBe(true);
    expect(grade(blank("I had gone"), "I would gone").correct).toBe(false);
    expect(grade(blank("she's tall"), "she is tall").correct).toBe(true);
    expect(grade(blank("she has finished"), "she's finished").correct).toBe(true);
    expect(grade(blank("she is finished"), "she's finished").correct).toBe(true);
    // a possessive is not expanded
    expect(grade(blank("John's"), "John is").correct).toBe(false);
  });

  it("returns the tidied given text", () => {
    expect(grade(blank("has"), "  Has  .").normalizedGiven).toBe("Has");
    expect(grade(blank("don't"), "don’t").normalizedGiven).toBe("don't");
  });
});

describe("grade — open types", () => {
  it("rewrite / translate need the AI", () => {
    const r = grade(q({ type: "rewrite", answer: "He said that he was tired." }), " He said that he was tired. ");
    expect(r).toEqual({ correct: false, normalizedGiven: "He said that he was tired", needsAi: true });
    expect(grade(q({ type: "translate" }), "x").needsAi).toBe(true);
  });
  it("canGradeLocally covers exactly the P types", () => {
    expect(["choice", "blank", "find-error"].every((type) => canGradeLocally({ type: type as GrammarQuestion["type"] }))).toBe(true);
    expect(canGradeLocally({ type: "rewrite" })).toBe(false);
    expect(canGradeLocally({ type: "translate" })).toBe(false);
  });
});
