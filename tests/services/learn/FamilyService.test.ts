import { describe, expect, it, vi } from "vitest";
import type { Family } from "../../../src/core/model/family";
import type { VocabStore } from "../../../src/core/store/VocabStore";
import type { AiService } from "../../../src/services/ai/AiService";
import { AiError } from "../../../src/services/ai/errors";
import type { DictionaryService } from "../../../src/services/dictionary/DictionaryService";
import { FAMILY_THREAD_ID, FamilyService, mergeFamily } from "../../../src/services/learn/FamilyService";
import { LearnStore } from "../../../src/services/learn/LearnStore";
import type { DictionaryLookupPort, LearnAi, LearnVocabPort } from "../../../src/services/learn/ports";
import { MemoryStorage } from "../ai/fakes";
import { entry, FakeDictionary, FakeLearnAi, FakeVocab, result } from "./fakes";

const NOW = new Date("2026-10-04T12:00:00Z");

const CLOTHING = {
  topic: "clothing",
  label: "服裝",
  groups: [
    {
      label: "舞台服裝",
      members: [
        { word: "glittery", zh: "閃閃發光的" },
        { word: "Leotard", zh: "連身緊身衣" },
        { word: "sequin", zh: "亮片" },
        { word: "tulle", zh: "薄紗" },
        { word: "sequin", zh: "重複" },
      ],
    },
  ],
};
const GL = {
  topic: "gl-",
  label: "gl- 發光家族",
  groups: [{ label: "光", members: [{ word: "glitter", zh: "閃爍" }, { word: "gleam", zh: "光澤" }] }],
};

function setup(json: unknown = { families: [CLOTHING, GL] }, dict = new FakeDictionary()) {
  const vocab = new FakeVocab([
    entry("e1", "glittery", { partOfSpeech: "adjective", definitionZh: "閃亮的", createdAt: "2026-10-01T00:00:00Z" }),
    entry("e2", "leotard", { partOfSpeech: "noun", createdAt: "2026-10-02T00:00:00Z" }),
    entry("e3", "apron", { createdAt: "2026-09-01T00:00:00Z" }),
  ]);
  const ai = new FakeLearnAi(() => result(JSON.stringify(json), { json }));
  const learn = new LearnStore({ storage: new MemoryStorage(), clock: () => NOW });
  let n = 0;
  const families = new FamilyService({ ai, vocab, learn, dictionary: dict, clock: () => NOW, newId: () => `id${++n}` });
  return { vocab, ai, learn, families, dict };
}

describe("FamilyService.generate", () => {
  it("returns candidates with learned members linked, without saving anything", async () => {
    const { families, ai, learn } = setup();
    const cands = await families.generate({ seedEntryIds: ["e1"] });

    expect(ai.threadIds).toEqual([FAMILY_THREAD_ID]);
    expect(cands).toHaveLength(2);
    expect(cands[0]).toMatchObject({ topic: "clothing", label: "服裝", seedEntryIds: ["e1"] });
    expect(cands[0].groups[0].members).toEqual([
      { entryId: "e1", word: "glittery", zh: "閃閃發光的" },
      { entryId: "e2", word: "Leotard", zh: "連身緊身衣" },
      { word: "sequin", zh: "亮片" },
      { word: "tulle", zh: "薄紗" },
    ]);
    expect(families.newWords(cands).map((m) => m.word)).toEqual(["sequin", "tulle", "glitter", "gleam"]);
    expect(learn.families()).toEqual([]);

    // Seeds lead the word list and get their own section in the task.
    const req = ai.requests[0];
    expect(req.output?.name).toBe("word_families");
    expect(req.system[1].text.split("\n")[1]).toBe("- glittery（adjective） 閃亮的");
    expect(req.messages[0].content).toContain("〔起點單字〕\n- glittery（adjective） 閃亮的");
  });

  it("regroups the whole list when there are no seeds", async () => {
    const { families, ai } = setup();
    await families.generate();
    expect(ai.requests[0].messages[0].content).toContain("任務：重新分群");
    // Most recent first.
    expect(ai.requests[0].system[1].text).toContain("- leotard（noun）\n- glittery（adjective） 閃亮的\n- apron");
  });

  it("propagates bad_output when the JSON doesn't hold", async () => {
    const { families } = setup({ nope: true });
    await expect(families.generate()).rejects.toMatchObject({ code: "bad_output" });
    await expect(families.generate()).rejects.toBeInstanceOf(AiError);
  });
});

describe("FamilyService.save", () => {
  it("stores families and adds ticked words after a dictionary lookup", async () => {
    const dict = new FakeDictionary(new Set(["tulle"]));
    const { families, vocab, learn } = setup(undefined, dict);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cands = await families.generate({ seedEntryIds: ["e1"] });
    const { families: saved, added } = await families.save(cands, { addWords: ["SEQUIN", "tulle"] });
    spy.mockRestore();

    expect(saved.map((f) => f.id)).toEqual(["id1", "id2"]);
    expect(saved[0]).toMatchObject({ source: "ai", seedEntryIds: ["e1"], entryCountAtGenerate: 3 });
    expect(dict.looked).toEqual(["sequin", "tulle"]);
    expect(added.map((e) => e.word)).toEqual(["sequin", "tulle"]);
    expect(added[0]).toMatchObject({
      definition: "definition of sequin",
      definitionZh: "sequin 的中文",
      phonetic: "/sequin/",
      synonyms: "a, b",
      origin: "family:id1",
      added: expect.stringMatching(/^2026-10-0\d /),
    });
    // Lookup failed: still added, with the AI's gloss.
    expect(added[1]).toMatchObject({ definition: "", definitionZh: "薄紗", origin: "family:id1" });
    expect(vocab.entries).toHaveLength(5);

    // Members now point at the new entries.
    const members = learn.family("id1")!.groups[0].members;
    expect(members.find((m) => m.word === "sequin")?.entryId).toBe(added[0].id);
    expect(members.find((m) => m.word === "tulle")?.entryId).toBe(added[1].id);
    expect(families.familiesOf("e1").map((f) => f.topic)).toEqual(["clothing"]);
  });

  it("只存字族: saves without adding words", async () => {
    const { families, vocab, dict } = setup();
    const cands = await families.generate();
    const { added } = await families.save(cands);
    expect(added).toEqual([]);
    expect(dict.looked).toEqual([]);
    expect(vocab.entries).toHaveLength(3);
    expect(families.families()).toHaveLength(2);
  });

  it("merges into an existing family with the same topic instead of duplicating it", async () => {
    const { families } = setup();
    await families.save(await families.generate());
    await families.save(await families.generate({ seedEntryIds: ["e2"] }));
    const all = families.families();
    expect(all).toHaveLength(2);
    expect(all.find((f) => f.topic === "clothing")?.seedEntryIds).toEqual(["e2"]);
  });

  it("重新分群 replaces the AI families but keeps manual ones", async () => {
    const { families, learn } = setup();
    learn.putFamily({ id: "manual", topic: "mine", label: "我的", source: "manual", groups: [] });
    await families.save(await families.generate());
    await families.save([(await families.generate())[1]], { replace: true });
    expect(families.families().map((f) => f.topic).sort()).toEqual(["gl-", "mine"]);
  });

  it("marks each family with where it came from", async () => {
    const { families } = setup();
    const [list] = (await families.save(await families.generate())).families;
    expect(list.scope).toBe("list");
    const { families: found } = await families.save([
      { topic: "kitchen", label: "廚房", seedEntryIds: ["e3"], groups: [{ label: "x", members: [{ word: "ladle", zh: "勺" }] }] },
    ]);
    expect(found[0].scope).toBe("word");
  });

  it("重新分群 keeps the families 找字族 saved from a word page", async () => {
    const { families, learn } = setup();
    // 字族樹: whole-list grouping (clothing, gl-).
    await families.save(await families.generate());
    // Word page 找字族 for apron: a new topic.
    await families.save([
      { topic: "kitchen", label: "廚房", seedEntryIds: ["e3"], groups: [{ label: "x", members: [{ word: "ladle", zh: "勺" }] }] },
    ]);
    // A family saved before `scope` existed, from a word page (has a seed).
    learn.putFamily({ id: "old-word", topic: "old", label: "舊", source: "ai", seedEntryIds: ["e2"], groups: [] });
    // …and one from an old whole-list grouping (no seeds).
    learn.putFamily({ id: "old-list", topic: "older", label: "更舊", source: "ai", seedEntryIds: [], groups: [] });

    const deleted: Family[] = [];
    learn.events.on("family:upsert", (f) => {
      if (f.deletedAt) deleted.push(f);
    });
    await families.save([(await families.generate())[1]], { replace: true });
    expect(families.families().map((f) => f.topic).sort()).toEqual(["gl-", "kitchen", "old"]);
    // Regroup tombstones say who deleted them (for the merge).
    expect(deleted.map((f) => [f.topic, f.deletedBy])).toEqual([
      ["clothing", "regroup"],
      ["gl-", "regroup"],
      ["older", "regroup"],
    ]);
  });

  it("a delete by the user isn't marked as a regroup", async () => {
    const { families, learn } = setup();
    const [f] = (await families.save(await families.generate())).families;
    let tomb: Family | undefined;
    learn.events.on("family:upsert", (x) => (tomb = x));
    families.remove(f.id);
    expect(tomb?.deletedAt).toBeTruthy();
    expect(tomb?.deletedBy).toBeUndefined();
  });

  it("a 找字族 result merged into a grouped family protects it from 重新分群", async () => {
    const { families } = setup();
    await families.save(await families.generate());
    // Word page 找字族 for leotard returns clothing again: merged, now "word".
    await families.save([(await families.generate({ seedEntryIds: ["e2"] }))[0]]);
    const clothing = families.families().find((f) => f.topic === "clothing")!;
    expect(clothing.scope).toBe("word");

    await families.save([(await families.generate())[1]], { replace: true });
    const after = families.families();
    expect(after.map((f) => f.topic).sort()).toEqual(["clothing", "gl-"]);
    // 重新分群's gl- is a fresh whole-list family; clothing kept its id.
    expect(after.find((f) => f.topic === "clothing")!.id).toBe(clothing.id);
    expect(after.find((f) => f.topic === "gl-")!.scope).toBe("list");
  });

  it("重新分群 merging into a kept word family leaves it a word family", async () => {
    const { families } = setup();
    await families.save([(await families.generate({ seedEntryIds: ["e1"] }))[0]]);
    await families.save(await families.generate(), { replace: true });
    const clothing = families.families().find((f) => f.topic === "clothing")!;
    expect(clothing.scope).toBe("word");
    expect(families.families()).toHaveLength(2);
  });

  it("addSuggested adds one word of a saved family", async () => {
    const { families, vocab } = setup();
    const [saved] = (await families.save(await families.generate())).families;
    const e = await families.addSuggested(saved.id, "tulle");
    expect(e).toMatchObject({ word: "tulle", origin: `family:${saved.id}` });
    expect(vocab.entries.map((x) => x.word)).toContain("tulle");
    expect(families.familiesOf(e!.id)).toHaveLength(1);
    expect(await families.addSuggested(saved.id, "unknown")).toBeUndefined();
  });

  it("remove tombstones a family", async () => {
    const { families } = setup();
    const [f] = (await families.save(await families.generate())).families;
    families.remove(f.id);
    expect(families.families().map((x) => x.id)).not.toContain(f.id);
  });

  it("stop cancels the request", () => {
    const { families, ai } = setup();
    families.stop();
    expect(ai.cancelled).toEqual([FAMILY_THREAD_ID]);
  });
});

describe("regroup suggestion (+20%)", () => {
  it("suggests regrouping once the list has grown by 20%", async () => {
    const { families, vocab } = setup();
    expect(families.needsRegroup()).toBe(false); // no families yet
    await families.save(await families.generate());
    expect(families.needsRegroup()).toBe(false);
    vocab.all.push(entry("n1", "one"));
    expect(families.needsRegroup()).toBe(true); // 4 ≥ 3 × 1.2
  });

  it("measures growth from the last whole-list grouping, not a word page's 找字族", async () => {
    const { families, vocab } = setup();
    await families.save(await families.generate());
    vocab.all.push(entry("n1", "one"));
    // 找字族 on a word page right now must not reset the count.
    await families.save([
      { topic: "kitchen", label: "廚房", seedEntryIds: ["e3"], groups: [{ label: "x", members: [{ word: "ladle", zh: "勺" }] }] },
    ]);
    expect(families.needsRegroup()).toBe(true);
  });

  it("never suggests regrouping when there are only word-page families", async () => {
    const { families, vocab } = setup();
    await families.save(await families.generate({ seedEntryIds: ["e1"] }));
    vocab.all.push(entry("n1", "one"), entry("n2", "two"));
    expect(families.needsRegroup()).toBe(false);
  });
});

describe("mergeFamily", () => {
  it("unions groups by label and members by word", () => {
    const merged = mergeFamily(
      { id: "f", topic: "t", label: "T", source: "ai", groups: [{ label: "A", members: [{ word: "x", zh: "舊" }] }], seedEntryIds: ["s1"] },
      { topic: "t", label: "T", seedEntryIds: ["s1", "s2"], groups: [{ label: "a", members: [{ word: "X", zh: "新" }, { word: "y", zh: "" }] }, { label: "B", members: [{ word: "z", zh: "" }] }] }
    );
    expect(merged.groups).toEqual([
      { label: "A", members: [{ word: "x", zh: "舊" }, { word: "y", zh: "" }] },
      { label: "B", members: [{ word: "z", zh: "" }] },
    ]);
    expect(merged.seedEntryIds).toEqual(["s1", "s2"]);
  });
});

describe("port compatibility", () => {
  it("the real VocabStore, DictionaryService and AiService satisfy the learn ports", () => {
    // Type-level checks: fail to compile if those APIs drift.
    const vocab = (s: VocabStore): LearnVocabPort => s;
    const dict = (d: DictionaryService): DictionaryLookupPort => d;
    const ai = (a: AiService): LearnAi => a;
    expect([vocab, dict, ai].every((f) => typeof f === "function")).toBe(true);
  });
});
