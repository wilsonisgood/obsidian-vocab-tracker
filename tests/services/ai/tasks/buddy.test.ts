import { describe, expect, it } from "vitest";
import { en } from "../../../../src/core/i18n/en";
import { zhTW } from "../../../../src/core/i18n/zh-TW";
import { defaultLearnerProfile } from "../../../../src/core/model/settings";
import { BUDDY_BASE_PROMPT, BUDDY_TASKS, BUDDY_TEMPLATES, buddyCustom, buddyReview } from "../../../../src/services/ai/tasks/buddy";
import { defaultTaskRegistry } from "../../../../src/services/ai/tasks/registry";
import { WARM_TONE } from "../../../../src/services/ai/tasks/tone";

const ctx = { profile: defaultLearnerProfile(), history: [] };
const FORBIDDEN = ["教練", "糾正", "考核", "計畫表", "達成率"];

describe("buddy tasks", () => {
  it("are registered under surface buddy with the spec'd ids", () => {
    const reg = defaultTaskRegistry();
    expect(BUDDY_TASKS.map((t) => t.id)).toEqual([
      "buddy.grammar", "buddy.writing", "buddy.review", "buddy.level", "buddy.reading", "buddy.plan", "buddy.custom",
    ]);
    for (const t of BUDDY_TASKS) {
      expect(reg.get(t.id)).toBe(t);
      expect(t.surface).toBe("buddy");
      expect(t.tier).toBe("smart");
      expect(t.maxTokens).toBe(4096);
    }
    expect(reg.forSurface("buddy").filter((t) => t.label)).toHaveLength(6);
    expect(buddyCustom.label).toBeUndefined();
  });

  it("puts WARM_TONE in the base and the learner background in the cached block", () => {
    const req = buddyCustom.build({ context: "【學習紀錄摘要】\n- 單字：120", question: "hi" }, ctx);
    expect(req.system[0].text).toContain(WARM_TONE);
    // system[0] is the base; the background is the cached block after it.
    const cached = req.system.slice(1).filter((b) => b.cache);
    expect(cached).toHaveLength(1);
    expect(cached[0].text).toContain("單字：120");
    expect(req.messages.at(-1)?.content).not.toContain("單字：120");
  });

  it("has no cached block when the context is empty, and replays history", () => {
    const history = [{ role: "user" as const, content: "a" }, { role: "assistant" as const, content: "b" }];
    const req = buddyCustom.build({ context: "", question: "hi" }, { ...ctx, history });
    expect(req.system.slice(1).some((b) => b.cache)).toBe(false);
    expect(req.messages.length).toBe(3);
  });

  it("review uses the question or the selection as the writing", () => {
    expect(buddyReview.build({ context: "", question: "I goed home." }, ctx).messages.at(-1)?.content).toContain("I goed home.");
    const sel = buddyReview.build({ context: "", selection: "She don't like it." }, ctx).messages.at(-1)?.content ?? "";
    expect(sel).toContain("She don't like it.");
    expect(sel).toContain("不會記成學習紀錄");
    expect(buddyReview.build({ context: "" }, ctx).messages.at(-1)?.content).toContain("貼上");
  });

  it("keeps pressure words out of its own prompts and i18n", () => {
    const own = [BUDDY_BASE_PROMPT.replace(WARM_TONE, ""), ...Object.values(BUDDY_TEMPLATES)].join("\n");
    for (const w of FORBIDDEN) expect(own).not.toContain(w);
    const keys = Object.keys(zhTW).filter((k) => k.includes("buddy"));
    expect(keys.length).toBeGreaterThan(5);
    for (const k of keys) for (const w of FORBIDDEN) expect((zhTW as Record<string, string>)[k]).not.toContain(w);
    for (const k of keys) expect(k in en).toBe(true);
  });
});
