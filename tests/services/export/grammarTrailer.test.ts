import { describe, expect, it } from "vitest";
import { renderAiNoteFile, type AiNoteInput } from "../../../src/services/export/renderers/aiNote";
import { renderRound, roundsOf } from "../../../src/services/export/renderers/common";
import { ctx, turn } from "./fixtures";

// Wave 15 S: the vt-grammar trailer is machine data; exports never show it.

const TRAILER = "<!-- vt-grammar: present-perfect-vs-past, passive-basic -->";
const ANSWER = `你問的是：「It has been done.」\n\n這是現在完成式的被動。\n${TRAILER}`;

describe("export strips the grammar trailer", () => {
  it("renderRound drops the trailer line", () => {
    const [round] = roundsOf([turn("user", "文法", { taskId: "paragraph.grammar" }), turn("assistant", ANSWER, { taskId: "paragraph.grammar" })]);
    const out = renderRound(round, ctx(), "###");
    expect(out).toContain("這是現在完成式的被動。");
    expect(out).not.toContain("vt-grammar");
    expect(out).not.toContain("<!--");
    // No trailing blank run left behind by the removed line.
    expect(out.endsWith("被動。")).toBe(true);
  });

  it("the .ai.md file carries no trailer, and the answer text is intact", () => {
    const input: AiNoteInput = {
      articlePath: "eng/Speech.md",
      paragraphs: [
        {
          index: 2,
          text: "It has been done.",
          turns: [turn("user", "文法", { taskId: "paragraph.grammar" }), turn("assistant", ANSWER, { taskId: "paragraph.grammar" })],
        },
      ],
      words: [],
    };
    const file = renderAiNoteFile(input, ctx());
    expect(file).toContain("這是現在完成式的被動。");
    expect(file).not.toContain("vt-grammar");
  });

  it("an answer that is only a trailer is not exported as a round", () => {
    expect(roundsOf([turn("user", "q"), turn("assistant", "<!-- vt-grammar: past-simple -->")])).toEqual([]);
  });

  it("plain answers are exported exactly as before", () => {
    const [round] = roundsOf([turn("user", "q"), turn("assistant", "**a**\n\n- b")]);
    expect(renderRound(round, ctx(), "###")).toContain("**a**\n\n- b");
  });
});
