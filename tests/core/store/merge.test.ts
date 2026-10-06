import { describe, expect, it, vi } from "vitest";
import { merge } from "../../../src/core/store/merge";
import { VocabStore } from "../../../src/core/store/VocabStore";
import type { VocabData, VocabEntry } from "../../../src/core/model/entry";
import { defaultAiSettings, defaultLearnerProfile, type PluginSettings } from "../../../src/core/model/settings";
import { resolveSrsSettings } from "../../../src/core/model/srs";
import { resolveWordlistSettings } from "../../../src/core/model/wordlists";

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

  it("carries the liked field along with whichever whole entry wins (Wave 7 F)", () => {
    // merge.ts picks by newer updatedAt/rev on the *whole* entry object
    // (pickNewer), so a newly added `liked` field needs no special-casing
    // here — this just confirms that still holds.
    const olderLiked = makeEntry({ id: "1", liked: true, updatedAt: "2026-01-01T00:00:00.000Z" });
    const newerUnliked = makeEntry({ id: "1", liked: false, updatedAt: "2026-01-02T00:00:00.000Z" });

    expect(merge(data([olderLiked]), data([newerUnliked])).entries[0].liked).toBe(false);
    expect(merge(data([newerUnliked]), data([olderLiked])).entries[0].liked).toBe(false);
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
    // `older` changed ui last (T3), learner earlier (T1).
    const older: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T3,
      ui: { locale: "en", updatedAt: T3 },
      learner: { ...defaultLearnerProfile(), level: "A2", updatedAt: T1 },
    };
    const newer: PluginSettings = { schemaVersion: 2, updatedAt: T2, learner: { ...defaultLearnerProfile(), level: "C1", updatedAt: T2 } };
    // Goes by the section's own stamp, not the top-level one.
    for (const s of both(older, newer)) expect(s?.learner?.level).toBe("C1");
  });

  it("breaks an exact tie with different content the same way on both devices", () => {
    const a: PluginSettings = { schemaVersion: 2, updatedAt: T1, ui: { locale: "en", updatedAt: T1 } };
    const b: PluginSettings = { schemaVersion: 2, updatedAt: T1, ui: { locale: "zh-TW", updatedAt: T1 } };
    const [ab, ba] = both(a, b);
    expect(ab).toEqual(ba);
    expect([a.ui, b.ui]).toContainEqual(ab?.ui);
  });

  it("breaks an equal-time tie by the newer top-level stamp before comparing values", () => {
    // Neither learner copy is stamped and neither side has an old-version
    // edit, so their own times tie. The fingerprint alone would keep the
    // default ("zh-TW" sorts after "bilingual"); the newer copy should win.
    const edited: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T2,
      srs: { dailyNew: 1, updatedAt: T2 },
      learner: { ...defaultLearnerProfile(), answerLanguage: "bilingual" },
    };
    const stale: PluginSettings = { schemaVersion: 2, updatedAt: T1, ui: { locale: "en", updatedAt: T1 }, learner: defaultLearnerProfile() };
    for (const s of both(edited, stale)) expect(s?.learner).toEqual(edited.learner);
    // A copy with no top-level stamp at all counts as oldest.
    const fresh: PluginSettings = { schemaVersion: 2, learner: defaultLearnerProfile() };
    for (const s of both(edited, fresh)) expect(s?.learner).toEqual(edited.learner);
  });

  it("keeps the newer stamp when both copies have the same content", () => {
    const a: PluginSettings = { schemaVersion: 2, updatedAt: T1, ui: { locale: "en", updatedAt: T1 } };
    const b: PluginSettings = { schemaVersion: 2, updatedAt: T2, ui: { updatedAt: T2, locale: "en" } };
    for (const s of both(a, b)) expect(s?.ui).toEqual(b.ui);
  });

  it("treats an unstamped section as older than any stamped one", () => {
    // `unstamped` was written by this version (its top-level stamp matches
    // its srs stamp), so its unstamped ai section was simply never edited.
    const unstamped: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T3,
      srs: { dailyNew: 1, updatedAt: T3 },
      ai: { ...defaultAiSettings(), monthlyTokenBudget: 5 },
    };
    const stamped: PluginSettings = { schemaVersion: 2, updatedAt: T1, ai: { ...defaultAiSettings(), monthlyTokenBudget: 9, updatedAt: T1 } };
    for (const s of both(unstamped, stamped)) expect(s?.ai?.monthlyTokenBudget).toBe(9);
  });

  it("treats an unparseable stamp as the oldest", () => {
    const garbled: PluginSettings = { schemaVersion: 2, updatedAt: "not a date", learner: { ...defaultLearnerProfile(), level: "A1", updatedAt: "not a date" } };
    const valid: PluginSettings = { schemaVersion: 2, updatedAt: T1, learner: { ...defaultLearnerProfile(), level: "B2", updatedAt: T1 } };
    for (const s of both(garbled, valid)) {
      expect(s?.learner?.level).toBe("B2");
      expect(s?.updatedAt).toBe(T1);
    }
  });

  it("converges when the top-level stamps tie and no section is stamped", () => {
    const a = { schemaVersion: 2, updatedAt: T1, futureField: "a", learner: { ...defaultLearnerProfile(), level: "A1" } } as PluginSettings;
    const b = { schemaVersion: 2, updatedAt: T1, futureField: "b", learner: { ...defaultLearnerProfile(), level: "C1" } } as PluginSettings;
    const [ab, ba] = both(a, b);
    expect(ab).toEqual(ba);
    expect(["A1", "C1"]).toContain(ab?.learner?.level);
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

  it("merges the files section on its own stamp, independently of the others", () => {
    // Mac moved the plugin's notes; the iPhone later changed its AI budget.
    const mac: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T2,
      files: { folder: "英文/vocab", wordsFolder: "words", updatedAt: T2 },
      ai: { ...defaultAiSettings(), monthlyTokenBudget: 1, updatedAt: T1 },
    };
    const iphone: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T3,
      files: { folder: "vocab-list", updatedAt: T1 },
      ai: { ...defaultAiSettings(), monthlyTokenBudget: 9, updatedAt: T3 },
    };
    for (const s of both(mac, iphone)) {
      expect(s?.files).toEqual(mac.files);
      expect(s?.ai?.monthlyTokenBudget).toBe(9);
    }
  });

  it("merges the paragraph anchors section on its own stamp", () => {
    // Mac turned on hash mode; the iPhone later changed its locale.
    const mac: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T2,
      anchors: { mode: "hash", blockIdNoticeSeen: true, updatedAt: T2 },
      ui: { locale: "en", updatedAt: T1 },
    };
    const iphone: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T3,
      anchors: { mode: "block", blockIdNoticeSeen: false, updatedAt: T1 },
      ui: { locale: "zh-TW", updatedAt: T3 },
    };
    for (const s of both(mac, iphone)) {
      expect(s?.anchors).toEqual(mac.anchors);
      expect(s?.ui?.locale).toBe("zh-TW");
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

  describe("a device still on an older plugin version", () => {
    const T4 = "2026-10-04T00:00:00.000Z";
    // Written by this version: every section stamped, top-level = newest.
    const shared: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T1,
      ai: { ...defaultAiSettings(), updatedAt: T1 },
      srs: { retention: 0.9, dailyNew: 20, updatedAt: T1 },
      wordlists: { ...resolveWordlistSettings(undefined), updatedAt: T1 },
    };
    // What the pre-section-stamp updateSettings did: mutate, bump the
    // top-level stamp only.
    const oldVersionEdit = (s: PluginSettings, at: string, mutate: (s: PluginSettings) => void) => {
      const copy = structuredClone(s);
      mutate(copy);
      copy.updatedAt = at;
      return copy;
    };

    it("keeps an in-place edit to a section that still carries an older stamp", () => {
      const old = oldVersionEdit(shared, T3, (s) => (s.ai!.enabled = true));
      for (const s of both(shared, old)) {
        expect(s?.ai?.enabled).toBe(true);
        expect(s?.ai?.updatedAt).toBe(T3);
      }
    });

    it("keeps an srs edit rebuilt through resolveSrsSettings (stamp dropped)", () => {
      const old = oldVersionEdit(shared, T3, (s) => (s.srs = { ...resolveSrsSettings(s.srs), dailyNew: 50 }));
      expect(old.srs?.updatedAt).toBeUndefined();
      for (const s of both(shared, old)) {
        expect(s?.srs).toEqual({ retention: 0.9, dailyNew: 50, updatedAt: T3 });
        expect(s?.ai).toEqual(shared.ai);
      }
    });

    it("keeps a wordlists edit rebuilt through resolveWordlistSettings (stamp dropped)", () => {
      const old = oldVersionEdit(shared, T3, (s) => (s.wordlists = { ...resolveWordlistSettings(s.wordlists), tags: { "exam/TOEFL": { enabled: false } } }));
      for (const s of both(shared, old)) expect(s?.wordlists?.tags).toEqual({ "exam/TOEFL": { enabled: false } });
    });

    it("still lets a later edit on this version win, and keeps both sides' sections", () => {
      const old = oldVersionEdit(shared, T3, (s) => (s.srs = { ...resolveSrsSettings(s.srs), dailyNew: 50 }));
      const fresh: PluginSettings = { ...structuredClone(shared), updatedAt: T4, ai: { ...defaultAiSettings(), enabled: true, updatedAt: T4 } };
      for (const s of both(old, fresh)) {
        expect(s?.srs?.dailyNew).toBe(50);
        expect(s?.ai?.enabled).toBe(true);
        expect(s?.updatedAt).toBe(T4);
      }
    });

    it("keeps the old version's edit newer after later merges", () => {
      const old = oldVersionEdit(shared, T3, (s) => (s.srs = { ...resolveSrsSettings(s.srs), dailyNew: 50 }));
      const merged = merge(withSettings(shared), withSettings(old)).settings!;
      // A third copy whose srs edit (T2) happened before the old version's.
      const third: PluginSettings = { ...structuredClone(shared), updatedAt: T2, srs: { retention: 0.9, dailyNew: 7, updatedAt: T2 } };
      for (const s of both(merged, third)) expect(s?.srs?.dailyNew).toBe(50);
    });

    it("raises nothing whose content matches the other side", () => {
      const noop = oldVersionEdit(shared, T3, () => {});
      for (const s of both(noop, shared)) {
        expect(s?.ai).toEqual(shared.ai);
        expect(s?.srs).toEqual(shared.srs);
        expect(s?.wordlists).toEqual(shared.wordlists);
      }
    });

    it("falls back to the whole-object rule for sections it can't tell apart", () => {
      // The old version can't say which section it edited, so every section
      // that differs counts as written at T3 — including one this version
      // edited at T2 that the old device hadn't seen yet (known trade-off).
      const old = oldVersionEdit(shared, T3, (s) => (s.ai!.enabled = true));
      const fresh: PluginSettings = { ...structuredClone(shared), updatedAt: T2, srs: { retention: 0.9, dailyNew: 7, updatedAt: T2 } };
      for (const s of both(old, fresh)) {
        expect(s?.ai?.enabled).toBe(true);
        expect(s?.srs?.dailyNew).toBe(20);
      }
    });

    it("is order-independent and idempotent", () => {
      const old = oldVersionEdit(shared, T3, (s) => {
        s.ai!.monthlyTokenBudget = 100;
        s.srs = { ...resolveSrsSettings(s.srs), dailyNew: 50 };
      });
      const fresh: PluginSettings = { ...structuredClone(shared), updatedAt: T2, learner: { ...defaultLearnerProfile(), level: "B1", updatedAt: T2 } };
      const [ab, ba] = both(old, fresh);
      expect(ab).toEqual(ba);
      expect(ab?.learner?.level).toBe("B1");
      expect(ab?.ai?.monthlyTokenBudget).toBe(100);
      expect(merge(withSettings(ab!), withSettings(old)).settings).toEqual(ab);
      expect(merge(withSettings(ab!), withSettings(fresh)).settings).toEqual(ab);
      expect(merge(withSettings(old), withSettings(ab!)).settings).toEqual(ab);
    });
  });

  describe("a copy last edited by an older version, then edited on this version", () => {
    const LEGACY = "2026-09-01T00:00:00.000Z";
    const AUG20 = "2026-08-20T00:00:00.000Z";
    const OCT1 = "2026-10-01T00:00:00.000Z";
    const OCT2 = "2026-10-02T00:00:00.000Z";
    const nurse = { ...defaultLearnerProfile(), answerLanguage: "bilingual" as const, level: "B2" as const, extra: "nurse" };

    // A real data.json from the old version: it persisted the resolved
    // ui/ai/learner (plus srs), bumped only the top-level stamp, and
    // stamped no section.
    const legacyMac = (): VocabData => ({
      schemaVersion: 2,
      settings: {
        schemaVersion: 2,
        updatedAt: LEGACY,
        ui: { locale: "auto" },
        ai: defaultAiSettings(),
        learner: { ...nurse },
        srs: { retention: 0.9, dailyNew: 20 },
      },
      entries: [],
    });

    async function at(iso: string, fn: () => Promise<void>): Promise<void> {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(iso));
      try {
        await fn();
      } finally {
        vi.useRealTimers();
      }
    }

    const syncBothWays = (a: VocabData, b: VocabData) => {
      const onA = merge(structuredClone(a), structuredClone(b)).settings;
      const onB = merge(structuredClone(b), structuredClone(a)).settings;
      expect(onA).toEqual(onB);
      return onA!;
    };

    // Mac upgrades and changes flashcard settings first thing.
    async function upgradedMac(): Promise<VocabStore> {
      const mac = new VocabStore(legacyMac(), async () => {});
      await at(OCT1, () => mac.updateSettings((s) => (s.srs = { ...resolveSrsSettings(s.srs), dailyNew: 40 })));
      return mac;
    }

    it("hands the old-version time down to the untouched sections", async () => {
      const s = (await upgradedMac()).vocabData.settings!;
      expect(s.updatedAt).toBe(OCT1);
      expect(s.srs).toEqual({ retention: 0.9, dailyNew: 40, updatedAt: OCT1 });
      expect(s.learner).toEqual({ ...nurse, updatedAt: LEGACY });
      expect(s.ai?.updatedAt).toBe(LEGACY);
      expect(s.ui?.updatedAt).toBe(LEGACY);
      expect(s.wordlists).toBeUndefined();
    });

    it("A: keeps the old-version learner over a brand-new device's defaults", async () => {
      const mac = await upgradedMac();
      // Fresh install: learner only filled in by the getter, never stamped.
      const fresh = new VocabStore({ schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] }, async () => {});
      expect(fresh.settings.learner).toEqual(defaultLearnerProfile());
      let s = syncBothWays(mac.vocabData, fresh.vocabData);
      expect(s.learner).toEqual({ ...nurse, updatedAt: LEGACY });
      expect(s.srs?.dailyNew).toBe(40);

      // Even when the new device's top-level stamp is the newer one (it
      // edited something else afterwards).
      await at(OCT2, () => fresh.updateSettings((x) => (x.ai.enabled = true)));
      s = syncBothWays(mac.vocabData, fresh.vocabData);
      expect(s.learner).toEqual({ ...nurse, updatedAt: LEGACY });
      expect(s.ai?.enabled).toBe(true);
      expect(s.srs?.dailyNew).toBe(40);
    });

    it("B: keeps the old-version learner (9/1) over another device's earlier edit (8/20)", async () => {
      const other = new VocabStore({ schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] }, async () => {});
      await at(AUG20, () => other.updateSettings((x) => (x.learner.level = "C1")));
      expect(other.vocabData.settings?.learner?.updatedAt).toBe(AUG20);
      const mac = await upgradedMac();
      const s = syncBothWays(mac.vocabData, other.vocabData);
      expect(s.learner).toEqual({ ...nurse, updatedAt: LEGACY });
      expect(s.srs?.dailyNew).toBe(40);
      expect(s.updatedAt).toBe(OCT1);
    });

    it("merges the untouched sections exactly as before the edit", async () => {
      const other = new VocabStore({ schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] }, async () => {});
      await at(AUG20, () =>
        other.updateSettings((x) => {
          x.learner.level = "C1";
          x.ui.locale = "en";
        })
      );
      await at(OCT2, () => other.updateSettings((x) => (x.ai.monthlyTokenBudget = 5)));
      const before = syncBothWays(legacyMac(), other.vocabData);
      const after = syncBothWays((await upgradedMac()).vocabData, other.vocabData);
      for (const key of ["ui", "ai", "learner"] as const) expect(after[key]).toEqual(before[key]);
      expect(after.ui?.locale).toBe("auto");
      expect(after.ai?.monthlyTokenBudget).toBe(5);
    });
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
