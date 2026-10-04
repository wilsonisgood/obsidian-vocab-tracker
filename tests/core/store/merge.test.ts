import { describe, expect, it, vi } from "vitest";
import { merge } from "../../../src/core/store/merge";
import { VocabStore } from "../../../src/core/store/VocabStore";
import type { VocabData, VocabEntry } from "../../../src/core/model/entry";
import { defaultAiSettings, defaultLearnerProfile, type PluginSettings } from "../../../src/core/model/settings";
import { resolveSrsSettings } from "../../../src/core/model/srs";

function makeEntry(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: "1",
    word: "word",
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: null,
    added: "",
    lastReviewed: "",
    reviews: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    rev: 0,
    ...overrides,
  };
}

function data(entries: VocabEntry[]): VocabData {
  return { schemaVersion: 2, settings: { schemaVersion: 2 }, entries };
}

describe("merge", () => {
  it("unions entries added independently on each device", () => {
    const local = data([makeEntry({ id: "mac-word" })]);
    const remote = data([makeEntry({ id: "iphone-word" })]);

    const result = merge(local, remote);

    expect(result.entries.map((e) => e.id).sort()).toEqual(["iphone-word", "mac-word"]);
  });

  it("picks the entry with the newer updatedAt when both sides edited the same id", () => {
    const older = makeEntry({ id: "1", word: "old-edit", updatedAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeEntry({ id: "1", word: "new-edit", updatedAt: "2026-01-02T00:00:00.000Z" });

    expect(merge(data([older]), data([newer])).entries).toEqual([newer]);
    // Order of local/remote shouldn't matter.
    expect(merge(data([newer]), data([older])).entries).toEqual([newer]);
  });

  it("breaks a tie on identical updatedAt using the higher rev", () => {
    const sameTime = "2026-01-01T00:00:00.000Z";
    const lowRev = makeEntry({ id: "1", word: "low-rev", updatedAt: sameTime, rev: 1 });
    const highRev = makeEntry({ id: "1", word: "high-rev", updatedAt: sameTime, rev: 2 });

    expect(merge(data([lowRev]), data([highRev])).entries).toEqual([highRev]);
  });

  it("resolves a delete racing an edit by recency, not by delete always winning", () => {
    const edited = makeEntry({ id: "1", word: "edited", updatedAt: "2026-01-02T00:00:00.000Z" });
    const deleted = makeEntry({
      id: "1",
      word: "edited",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: "2026-01-01T00:00:00.000Z",
    });

    // The edit happened after the delete → edit should win (resurrected).
    expect(merge(data([edited]), data([deleted])).entries[0].deletedAt).toBeUndefined();

    // The delete happened after the edit → delete should win.
    const laterDelete = {
      ...deleted,
      updatedAt: "2026-01-03T00:00:00.000Z",
      deletedAt: "2026-01-03T00:00:00.000Z",
    };
    expect(merge(data([edited]), data([laterDelete])).entries[0].deletedAt).toBe(
      "2026-01-03T00:00:00.000Z"
    );
  });

  it("treats a missing updatedAt as older than any stamped entry", () => {
    const unstamped = makeEntry({ id: "1", word: "unstamped", updatedAt: undefined });
    const stamped = makeEntry({ id: "1", word: "stamped", updatedAt: "2026-01-01T00:00:00.000Z" });

    expect(merge(data([unstamped]), data([stamped])).entries).toEqual([stamped]);
    expect(merge(data([stamped]), data([unstamped])).entries).toEqual([stamped]);
  });

  it("preserves local's ordering and appends remote-only entries after", () => {
    const a = makeEntry({ id: "a" });
    const b = makeEntry({ id: "b" });
    const c = makeEntry({ id: "c" });

    const result = merge(data([a, b]), data([c]));

    expect(result.entries.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});

describe("merge() settings, section by section", () => {
  const T1 = "2026-10-01T00:00:00.000Z";
  const T2 = "2026-10-02T00:00:00.000Z";
  const T3 = "2026-10-03T00:00:00.000Z";
  const withSettings = (settings: PluginSettings): VocabData => ({ schemaVersion: 2, settings, entries: [] });
  const both = (local: PluginSettings, remote: PluginSettings) => [
    merge(withSettings(local), withSettings(remote)).settings,
    merge(withSettings(remote), withSettings(local)).settings,
  ];

  it("keeps both devices' edits when they changed different sections", () => {
    // Mac changed flashcard settings, iPhone changed AI settings.
    const mac: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T2,
      srs: { retention: 0.85, dailyNew: 30, updatedAt: T2 },
      ai: { ...defaultAiSettings(), updatedAt: T1 },
    };
    const iphone: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T3,
      srs: { retention: 0.9, dailyNew: 20, updatedAt: T1 },
      ai: { ...defaultAiSettings(), enabled: true, updatedAt: T3 },
    };
    for (const s of both(mac, iphone)) {
      expect(s?.srs).toEqual(mac.srs);
      expect(s?.ai).toEqual(iphone.ai);
      expect(s?.updatedAt).toBe(T3);
    }
  });

  it("takes the newer copy when both devices changed the same section", () => {
    const older: PluginSettings = { schemaVersion: 2, updatedAt: T3, learner: { ...defaultLearnerProfile(), level: "A2", updatedAt: T1 } };
    const newer: PluginSettings = { schemaVersion: 2, updatedAt: T2, learner: { ...defaultLearnerProfile(), level: "C1", updatedAt: T2 } };
    // Goes by the section's own stamp, not the top-level one.
    for (const s of both(older, newer)) expect(s?.learner?.level).toBe("C1");
  });

  it("keeps local on an exact tie", () => {
    const local: PluginSettings = { schemaVersion: 2, ui: { locale: "en", updatedAt: T1 } };
    const remote: PluginSettings = { schemaVersion: 2, ui: { locale: "zh-TW", updatedAt: T1 } };
    expect(merge(withSettings(local), withSettings(remote)).settings?.ui?.locale).toBe("en");
  });

  it("treats an unstamped (legacy) section as older than any stamped one", () => {
    // The legacy side even has the newer top-level stamp; the section's own
    // stamp still wins.
    const legacy: PluginSettings = { schemaVersion: 2, updatedAt: T3, ai: { ...defaultAiSettings(), monthlyTokenBudget: 5 } };
    const stamped: PluginSettings = { schemaVersion: 2, updatedAt: T1, ai: { ...defaultAiSettings(), monthlyTokenBudget: 9, updatedAt: T1 } };
    for (const s of both(legacy, stamped)) expect(s?.ai?.monthlyTokenBudget).toBe(9);
  });

  it("falls back to the newer top-level stamp when neither copy of a section is stamped", () => {
    const old: PluginSettings = { schemaVersion: 2, updatedAt: T1, learner: { ...defaultLearnerProfile(), level: "A1" } };
    const recent: PluginSettings = { schemaVersion: 2, updatedAt: T2, learner: { ...defaultLearnerProfile(), level: "B1" } };
    for (const s of both(old, recent)) expect(s?.learner?.level).toBe("B1");
  });

  it("takes a section only one side has, and drops nothing the other side lacks", () => {
    const local: PluginSettings = { schemaVersion: 2, updatedAt: T1, srs: { dailyNew: 5, updatedAt: T1 } };
    const remote: PluginSettings = { schemaVersion: 2, updatedAt: T2, wordlists: { highlight: false, updatedAt: T2 } };
    for (const s of both(local, remote)) {
      expect(s?.srs).toEqual(local.srs);
      expect(s?.wordlists).toEqual(remote.wordlists);
    }
  });

  it("compares wordlists (tags included) as one section — no per-tag merging", () => {
    const mac: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T1,
      wordlists: { tags: { "exam/TOEFL": { color: "#111111" }, "exam/IELTS": { enabled: true } }, updatedAt: T1 },
    };
    const iphone: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T2,
      wordlists: { tags: { "exam/IELTS": { enabled: false } }, updatedAt: T2 },
    };
    for (const s of both(mac, iphone)) {
      expect(s?.wordlists).toEqual(iphone.wordlists);
      expect(s?.wordlists?.tags).not.toHaveProperty("exam/TOEFL");
    }
  });

  it("takes keys outside the sections from the side with the newer top-level stamp", () => {
    const local = { schemaVersion: 2, updatedAt: T1, futureField: "old" } as PluginSettings;
    const remote = { schemaVersion: 2, updatedAt: T2, futureField: "new" } as PluginSettings;
    for (const s of both(local, remote)) expect((s as unknown as { futureField: string }).futureField).toBe("new");
  });

  it("is order-independent and idempotent for stamped sections", () => {
    const a: PluginSettings = { schemaVersion: 2, updatedAt: T2, ui: { locale: "en", updatedAt: T2 }, srs: { dailyNew: 1, updatedAt: T1 } };
    const b: PluginSettings = { schemaVersion: 2, updatedAt: T3, ui: { locale: "zh-TW", updatedAt: T1 }, srs: { dailyNew: 2, updatedAt: T3 } };
    const [ab, ba] = both(a, b);
    expect(ab).toEqual(ba);
    expect(ab?.ui?.locale).toBe("en");
    expect(ab?.srs?.dailyNew).toBe(2);
    expect(merge(withSettings(ab!), withSettings(b)).settings).toEqual(ab);
  });

  it("end to end: two VocabStores edit different sections, then sync both ways", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const shared: VocabData = { schemaVersion: 2, settings: { schemaVersion: 2, updatedAt: T1 }, entries: [] };
      const mac = new VocabStore(structuredClone(shared), async () => {});
      const iphone = new VocabStore(structuredClone(shared), async () => {});

      vi.setSystemTime(new Date(T2));
      await mac.updateSettings((s) => (s.srs = { ...resolveSrsSettings(s.srs), dailyNew: 50 }));
      vi.setSystemTime(new Date(T3));
      await iphone.updateSettings((s) => (s.ai.enabled = true));

      const onMac = merge(structuredClone(mac.vocabData), structuredClone(iphone.vocabData)).settings;
      const onIphone = merge(structuredClone(iphone.vocabData), structuredClone(mac.vocabData)).settings;
      for (const s of [onMac, onIphone]) {
        expect(s?.srs?.dailyNew).toBe(50);
        expect(s?.ai?.enabled).toBe(true);
      }
      expect(onMac).toEqual(onIphone);
    } finally {
      vi.useRealTimers();
    }
  });
});
