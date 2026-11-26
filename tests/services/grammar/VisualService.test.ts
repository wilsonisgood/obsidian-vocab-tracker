import { describe, expect, it } from "vitest";
import { VisualService } from "../../../src/services/grammar/VisualService";
import type { LearnAi } from "../../../src/services/learn/ports";
import { grammarVisual } from "../../../src/services/ai/tasks/grammarVisual";
import { topicById } from "../../../src/core/grammar/catalog";
import { defaultLearnerProfile } from "../../../src/core/model/settings";

const sample = {
  kind: "agreement",
  sentence: { text: "The list of items is long.", marks: [] },
  explain: "核心名詞是 list。",
  head: "list",
  number: "singular",
  skip: "of items",
  verb: "is",
  steps: ["找核心名詞 list", "動詞跟 list 配 → is"],
  traps: [],
};

function fakeAi(json: unknown): LearnAi & { calls: unknown[]; cancelled: string[] } {
  const calls: unknown[] = [];
  const cancelled: string[] = [];
  return {
    calls,
    cancelled,
    run: async (_task: unknown, input: unknown) => {
      calls.push(input);
      return { text: JSON.stringify(json), json, model: "m", stop: "end" } as never;
    },
    cancel: (id: string) => void cancelled.push(id),
  };
}

describe("VisualService", () => {
  it("沒有產生過就用內建的；不認得的主題回 null", () => {
    const s = new VisualService({ ai: fakeAi(sample) });
    expect(s.current("no-such-topic")).toBeNull();
    expect(s.isGenerated("agreement-difficult")).toBe(false);
  });

  it("換一個例句：存下 AI 的版面、記下看過的例句、可以回到內建", async () => {
    const ai = fakeAi(sample);
    const s = new VisualService({ ai });
    const seen: string[] = [];
    s.events.on("visual:change", (e) => seen.push(e.topicId));
    const v = await s.regenerate("agreement-difficult");
    expect(v.kind).toBe("agreement");
    expect(s.current("agreement-difficult")).toEqual(v);
    expect(s.isGenerated("agreement-difficult")).toBe(true);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    await s.regenerate("agreement-difficult");
    const second = ai.calls[1] as { avoid: string[] };
    expect(second.avoid).toContain(sample.sentence.text);
    s.reset("agreement-difficult");
    expect(s.isGenerated("agreement-difficult")).toBe(false);
  });

  it("第一次格式不對會自動再問一次", async () => {
    let n = 0;
    const ai: LearnAi = {
      run: async () => {
        n++;
        const json = n === 1 ? { kind: "agreement" } : sample;
        return { text: JSON.stringify(json), json, model: "m", stop: "end" } as never;
      },
      cancel: () => {},
    };
    const s = new VisualService({ ai });
    const v = await s.regenerate("agreement-difficult");
    expect(n).toBe(2);
    expect(v.kind).toBe("agreement");
  });

  it("兩次都不合版面就丟錯，不存", async () => {
    const s = new VisualService({ ai: fakeAi({ kind: "agreement" }) });
    await expect(s.regenerate("agreement-difficult")).rejects.toThrow();
    expect(s.isGenerated("agreement-difficult")).toBe(false);
  });
});

describe("grammar.visual task", () => {
  it("schema 用主題對到的那種版面", () => {
    const topic = topicById("agreement-difficult")!;
    const req = grammarVisual.build({ topic, avoid: ["A sentence."] }, { profile: defaultLearnerProfile(), history: [] });
    const text = JSON.stringify(req);
    expect(text).toContain("grammar_visual");
    expect(text).toContain("主詞動詞一致");
    expect(text).toContain("A sentence.");
  });
});
