import { describe, expect, it } from "vitest";
import { catalogPromptList, GRAMMAR_TOPICS, topicById, topicsOfStage } from "../../../src/core/grammar/catalog";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BANNED = /Grammar in Use|Murphy|Cambridge/i;

describe("GRAMMAR_TOPICS", () => {
  it("has unique kebab-case ids", () => {
    const ids = GRAMMAR_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(KEBAB);
  });

  it("points prerequisites and related at existing topics", () => {
    for (const t of GRAMMAR_TOPICS) {
      for (const id of [...t.prerequisites, ...t.related]) expect(topicById(id), `${t.id} -> ${id}`).toBeDefined();
      expect(t.prerequisites).not.toContain(t.id);
      expect(t.related).not.toContain(t.id);
      expect(t.prerequisites.length).toBeLessThanOrEqual(2);
    }
  });

  it("keeps related links symmetric", () => {
    for (const t of GRAMMAR_TOPICS) for (const id of t.related) expect(topicById(id)?.related).toContain(t.id);
  });

  it("has no prerequisite cycles", () => {
    const state = new Map<string, "open" | "done">();
    const visit = (id: string, trail: string[]) => {
      if (state.get(id) === "done") return;
      expect(state.get(id), `cycle: ${[...trail, id].join(" > ")}`).toBeUndefined();
      state.set(id, "open");
      for (const p of topicById(id)?.prerequisites ?? []) visit(p, [...trail, id]);
      state.set(id, "done");
    };
    for (const t of GRAMMAR_TOPICS) visit(t.id, []);
  });

  it("has 2-4 uniquely-identified objectives per topic", () => {
    for (const t of GRAMMAR_TOPICS) {
      expect(t.objectives.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.objectives.length, t.id).toBeLessThanOrEqual(4);
      const ids = t.objectives.map((o) => o.id);
      expect(new Set(ids).size, t.id).toBe(ids.length);
      for (const o of t.objectives) {
        expect(o.id).toMatch(KEBAB);
        expect(o.text.length).toBeGreaterThan(0);
      }
    }
  });

  it("matches stage and difficulty bands", () => {
    for (const t of GRAMMAR_TOPICS) {
      expect(t.difficulty, t.id).toBeGreaterThanOrEqual((t.stage - 1) * 3 + 1);
      expect(t.difficulty, t.id).toBeLessThanOrEqual(t.stage * 3);
    }
  });

  it("has distinct order inside each stage and sorted output", () => {
    for (const stage of [1, 2, 3] as const) {
      const orders = topicsOfStage(stage).map((t) => t.order);
      expect(new Set(orders).size).toBe(orders.length);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      expect(orders.length).toBeGreaterThan(0);
    }
    expect(topicsOfStage(1).length + topicsOfStage(2).length + topicsOfStage(3).length).toBe(GRAMMAR_TOPICS.length);
  });

  it("keeps summaries short, titles filled and book names out", () => {
    for (const t of GRAMMAR_TOPICS) {
      expect(t.summary.length, t.id).toBeLessThanOrEqual(30);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.pattern.length).toBeGreaterThan(0);
      const text = [t.title, t.summary, t.pattern, t.promptHint ?? "", ...t.objectives.map((o) => o.text)].join("\n");
      expect(text, t.id).not.toMatch(BANNED);
    }
  });

  it("lists one line per topic for the prompt", () => {
    const lines = catalogPromptList().split("\n");
    expect(lines).toHaveLength(GRAMMAR_TOPICS.length);
    expect(lines[0]).toBe("be-verb — be 動詞（am / is / are）");
  });

  it("looks topics up by id", () => {
    expect(topicById("present-perfect-vs-past")?.stage).toBe(2);
    expect(topicById("nope")).toBeUndefined();
  });
});
