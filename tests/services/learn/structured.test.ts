import { describe, expect, it } from "vitest";
import {
  AiError,
  aiDebugOf,
  aiDebugReport,
  formatAiRequest,
  redactSecrets,
  withDebug,
} from "../../../src/services/ai/errors";
import { defaultLearnerProfile } from "../../../src/core/model/settings";
import { familyGenerate } from "../../../src/services/ai/tasks/family";
import { verbUsage } from "../../../src/services/ai/tasks/verbUsage";
import { FamilyService } from "../../../src/services/learn/FamilyService";
import { LearnStore } from "../../../src/services/learn/LearnStore";
import { runStructured } from "../../../src/services/learn/structured";
import { VerbUsageService } from "../../../src/services/learn/VerbUsageService";
import { MemoryStorage } from "../ai/fakes";
import { entry, FakeDictionary, FakeLearnAi, FakePreparingAi, FakeVocab, result } from "./fakes";

const NOW = new Date("2026-10-05T12:00:00Z");
const KNOWN = { known: [{ word: "glittery", partOfSpeech: "adjective", zh: "閃亮的" }, { word: "leotard" }] };

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a rejection");
}

describe("formatAiRequest (debug box prompt)", () => {
  it("prints every system block, message and the request settings", () => {
    const req = familyGenerate.build(KNOWN, { profile: { ...defaultLearnerProfile(), level: "B1" }, history: [] });
    expect(formatAiRequest(req)).toMatchSnapshot();
  });

  it("numbers system blocks only when there are several", () => {
    expect(formatAiRequest({ system: [{ text: "S" }], messages: [{ role: "user", content: "Q" }] })).toBe("[system]\nS\n\n[user]\nQ");
  });
});

describe("redactSecrets", () => {
  it("removes API keys of every provider and explicit secrets", () => {
    const text = [
      "anthropic sk-ant-api03-abcdefghijklmnop",
      "openai sk-proj-ABCDEF1234567890",
      "gemini AIzaSyA1234567890abcdefghijklmnop",
      "header Bearer abcdefghijklmnopqrstuvwx",
      "x-api-key: zzzzzzzzzzzz",
      "custom my-own-key-123456",
    ].join("\n");
    const out = redactSecrets(text, ["my-own-key-123456"]);
    expect(out).toBe(
      [
        "anthropic [REDACTED]",
        "openai [REDACTED]",
        "gemini [REDACTED]",
        "header Bearer [REDACTED]",
        "x-api-key: [REDACTED]",
        "custom [REDACTED]",
      ].join("\n")
    );
  });

  it("leaves ordinary text alone", () => {
    expect(redactSecrets("sky-blue sketch, ask- me")).toBe("sky-blue sketch, ask- me");
  });
});

describe("withDebug", () => {
  it("only decorates bad_output errors, once", () => {
    const net = new AiError("network");
    expect(aiDebugOf(withDebug(net, () => ({ prompt: "p", output: "o" })))).toBeUndefined();
    const bad = new AiError("bad_output", "no JSON");
    withDebug(bad, () => ({ prompt: "p sk-ant-secret12345", output: "o" }));
    expect(aiDebugOf(bad)).toEqual({ prompt: "p [REDACTED]", output: "o", reason: "no JSON" });
    withDebug(bad, () => ({ prompt: "other", output: "other" }));
    expect(aiDebugOf(bad)?.prompt).toBe("p [REDACTED]");
    expect(aiDebugOf(new Error("x"))).toBeUndefined();
  });

  it("builds a copyable report", () => {
    const report = aiDebugReport(
      { taskId: "family.generate", model: "gemini-2.5-flash", stop: "end", reason: "malformed group", prompt: "[user]\nQ", output: "" },
      { prompt: "送給 AI 的 prompt", output: "AI 的原始輸出", empty: "（沒有內容）" }
    );
    expect(report).toMatchSnapshot();
  });
});

describe("runStructured", () => {
  it("returns the parsed value", async () => {
    const json = { families: [{ topic: "t", label: "T", groups: [{ label: "g", members: [{ word: "a", zh: "甲" }] }] }] };
    const ai = new FakePreparingAi(() => result(JSON.stringify(json), { json }));
    const { value, result: r } = await runStructured(ai, familyGenerate, KNOWN);
    expect(value[0].topic).toBe("t");
    expect(r.taskId).toBe("family.generate");
  });

  it("puts the prompt and the raw answer on a parse failure", async () => {
    const raw = '{"families": [{"topic": "x", "groups": "not a list"}]}';
    const ai = new FakePreparingAi(() => result(raw, { json: JSON.parse(raw), model: "gemini-2.5-flash" }));
    const e = await caught(runStructured(ai, familyGenerate, KNOWN));
    expect(e).toBeInstanceOf(AiError);
    const d = aiDebugOf(e)!;
    expect(d.taskId).toBe("family.generate");
    expect(d.output).toBe(raw);
    expect(d.model).toBe("gemini-2.5-flash");
    expect(d.stop).toBe("end");
    expect(d.reason).toBe("family.generate: malformed family");
    // The very request that was sent.
    expect(d.prompt).toBe(formatAiRequest(ai.requests[0]));
    expect(d.prompt).toContain("任務：重新分群");
  });

  it("shows native JSON when the provider sent no text", async () => {
    const json = { nope: true };
    const ai = new FakePreparingAi(() => result("", { json }));
    const d = aiDebugOf(await caught(runStructured(ai, familyGenerate, KNOWN)))!;
    expect(d.output).toBe('{\n  "nope": true\n}');
  });

  it("reports an answer cut off by max_tokens", async () => {
    const ai = new FakePreparingAi(() => result('{"families": [', { stop: "max_tokens" }));
    const d = aiDebugOf(await caught(runStructured(ai, familyGenerate, KNOWN)))!;
    expect(d.output).toBe('{"families": [');
    expect(d.stop).toBe("max_tokens");
  });

  it("uses the streamed text when the provider itself couldn't read the JSON", async () => {
    const ai = new FakePreparingAi(() => {
      throw new AiError("bad_output", "Model output is not valid JSON", { partialText: "Sure! Here you go: {oops" });
    });
    const d = aiDebugOf(await caught(runStructured(ai, verbUsage, { entry: entry("v", "sugarcoat") })))!;
    expect(d.output).toBe("Sure! Here you go: {oops");
    expect(d.prompt).toContain("任務：用法（sugarcoat）");
  });

  it("leaves other errors alone, and works without prepare", async () => {
    const limited = new FakePreparingAi(() => {
      throw new AiError("rate_limit");
    });
    expect(aiDebugOf(await caught(runStructured(limited, familyGenerate, KNOWN)))).toBeUndefined();

    const plain = new FakeLearnAi(() => result("not json at all"));
    const d = aiDebugOf(await caught(runStructured(plain, familyGenerate, KNOWN)))!;
    expect(d.prompt).toBe("");
    expect(d.output).toBe("not json at all");
  });
});

describe("services carry the debug info", () => {
  it("FamilyService.generate", async () => {
    // liked: true — 整體分群 (無 seed) 只看 like 的字 (1006report.md #24).
    const vocab = new FakeVocab([entry("e1", "glittery", { liked: true })]);
    const ai = new FakePreparingAi(() => result("I can't group these."));
    const learn = new LearnStore({ storage: new MemoryStorage(), clock: () => NOW });
    const families = new FamilyService({ ai, vocab, learn, dictionary: new FakeDictionary(), clock: () => NOW });
    const e = await caught(families.generate());
    expect(e).toMatchObject({ code: "bad_output" });
    expect(aiDebugOf(e)?.output).toBe("I can't group these.");
    expect(aiDebugOf(e)?.prompt).toContain("- glittery");
  });

  it("VerbUsageService.generate", async () => {
    const vocab = new FakeVocab([entry("v1", "sugarcoat", { partOfSpeech: "verb" })]);
    const ai = new FakePreparingAi(() => result('{"entries": []}', { json: { entries: [] } }));
    const learn = new LearnStore({ storage: new MemoryStorage(), clock: () => NOW });
    const verbs = new VerbUsageService({ ai, vocab, learn, clock: () => NOW });
    const e = await caught(verbs.generate(vocab.entries[0]));
    expect(aiDebugOf(e)).toMatchObject({
      taskId: "verb.usage",
      reason: "verb.usage: no usable part-of-speech entries",
      output: '{"entries": []}',
    });
  });
});
