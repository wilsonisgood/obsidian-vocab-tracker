import { describe, expect, it } from "vitest";
import { topicById } from "../../../../src/core/grammar/catalog";
import { defaultLearnerProfile, type CefrLevel } from "../../../../src/core/model/settings";
import { isAiError } from "../../../../src/services/ai/errors";
import type { AiRequest, AiResult } from "../../../../src/services/ai/providers/types";
import {
  GRAMMAR_EXPLAIN_BASE_PROMPT,
  grammarExplain,
  parseGrammarExplanation,
} from "../../../../src/services/ai/tasks/grammarExplain";
import { defaultTaskRegistry } from "../../../../src/services/ai/tasks/registry";

const ctx = (level: CefrLevel | "" = "") => ({ profile: { ...defaultLearnerProfile(), level }, history: [] });

function render(req: AiRequest): string {
  const sys = req.system.map((b, i) => `── system[${i}]${b.cache ? " (cache)" : ""} ──\n${b.text}`);
  const msgs = req.messages.map((m) => `── ${m.role}${m.cache ? " (cache)" : ""} ──\n${m.content}`);
  return [`tier=${req.tier} maxTokens=${req.maxTokens}`, ...sys, ...msgs].join("\n\n");
}

const text = (t: string) => ({ text: t }) as AiResult;

describe("grammar.explain", () => {
  const topic = topicById("present-perfect-vs-past")!;

  it("the topic exists in the catalog with related topics", () => {
    expect(topic).toBeDefined();
    expect(topic.related.length).toBeGreaterThan(0);
  });

  it("a topic with related topics — full request", () => {
    expect(render(grammarExplain.build({ topic }, ctx("B1")))).toMatchSnapshot();
  });

  it("a topic with nothing related skips the comparison section", () => {
    const alone = { ...topic, related: [], prerequisites: [], };
    const out = render(grammarExplain.build({ topic: alone }, ctx()));
    expect(out).not.toContain("和相關主題的差別");
    expect(out).toMatchSnapshot();
  });

  it("is a smart-tier, surface-grammar task with no quick-action label", () => {
    expect(grammarExplain).toMatchObject({ id: "grammar.explain", surface: "grammar", tier: "smart", maxTokens: 4096 });
    expect(grammarExplain.label).toBeUndefined();
  });

  it("the system prompt keeps the safety rules (不確定、原創例句)", () => {
    expect(GRAMMAR_EXPLAIN_BASE_PROMPT).toContain("不確定就直接說");
    expect(GRAMMAR_EXPLAIN_BASE_PROMPT).toContain("不要引用或模仿任何出版教材");
    expect(GRAMMAR_EXPLAIN_BASE_PROMPT).not.toMatch(/Murphy|Grammar in Use|Cambridge/);
  });

  it("raises a short answer limit so the explanation isn't cut off, leaves 'no limit' alone", () => {
    const short = grammarExplain.build({ topic }, { profile: { ...defaultLearnerProfile(), maxAnswerChars: 300 }, history: [] });
    expect(short.system.at(-1)?.text).toContain("900 字");
    const none = grammarExplain.build({ topic }, { profile: { ...defaultLearnerProfile(), maxAnswerChars: 0 }, history: [] });
    expect(none.system.at(-1)?.text).not.toContain("字以內");
  });

  it("parse trims, unwraps a markdown fence and rejects an empty answer", () => {
    expect(parseGrammarExplanation(text("  **核心概念**\n\nx \n"))).toBe("**核心概念**\n\nx");
    expect(parseGrammarExplanation(text("```markdown\n**a**\n```"))).toBe("**a**");
    try {
      parseGrammarExplanation(text("  "));
      expect.unreachable();
    } catch (e) {
      expect(isAiError(e) && e.code).toBe("bad_output");
    }
  });

  it("is in the default registry, with grammar.questions", () => {
    expect(defaultTaskRegistry().get("grammar.explain")).toBe(grammarExplain);
    expect(defaultTaskRegistry().forSurface("grammar").map((t) => t.id)).toEqual(["grammar.explain", "grammar.questions"]);
  });
});
