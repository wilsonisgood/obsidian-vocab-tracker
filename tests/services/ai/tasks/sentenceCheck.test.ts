import { describe, expect, it } from "vitest";
import { isFullSentence, isTargetForm } from "../../../../src/services/ai/tasks/sentenceCheck";

describe("sentenceCheck", () => {
  it("accepts regular and near forms of the target", () => {
    expect(isTargetForm("gets", "get")).toBe(true);
    expect(isTargetForm("got", "get")).toBe(true);
    expect(isTargetForm("took", "take")).toBe(true);
    expect(isTargetForm("of", "of")).toBe(true);
    expect(isTargetForm("make", "take")).toBe(false);
  });

  it("knows the wholly irregular forms of the 常用字 verbs", () => {
    expect(isTargetForm("went", "go")).toBe(true);
    expect(isTargetForm("gone", "go")).toBe(true);
    expect(isTargetForm("did", "do")).toBe(true);
    expect(isTargetForm("caught", "catch")).toBe(true);
    expect(isTargetForm("brought", "bring")).toBe(true);
    expect(isTargetForm("went", "get")).toBe(false);
  });

  it("rejects a question written into the sentence and a blank at the end", () => {
    expect(isFullSentence("[[of]] 在這句中是什麼意思？")).toBe(false);
    expect(isFullSentence("For the visitors, we should prepare a cup ____.")).toBe(false);
    expect(isFullSentence("For the visitors, we should prepare a cup ____ tea.")).toBe(true);
  });
});
