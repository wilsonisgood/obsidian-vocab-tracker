import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../perf/support/obsidian"));

import type { VocabEntry } from "../../src/core/model/entry";
import type { VocabDataV1 } from "../../src/core/model/schemaV1";
import { DEFAULT_SRS_SETTINGS } from "../../src/core/model/srs";
import { isListed, type IsListedContext } from "../../src/core/model/like";
import { likeChipOn, resolveWordlistSettings, tagEnabled } from "../../src/core/model/wordlists";
import { buildStressFixture } from "../fixtures/stress";
import { PLUGIN_DIR, pluginFile, type FakeApp } from "../perf/support/app";
import type { FakeElement } from "../perf/support/dom";
import { bootPlugin, openSidebar, seedApp, type Booted } from "../perf/support/harness";

// 規劃書 06 §1.3「舊資料 100% 無損遷移（有自動備份，可回復）」, end to end:
// a pre-M1 data.json of 1,000 words goes through the real plugin's onload
// (ObsidianStorage → loadMigrated → backup → write-back), and then:
// - every v1 field of every word is still there, unchanged, in order;
// - the backup file holds the original data.json exactly;
// - restarting doesn't migrate (or back up) again;
// - restoring the backup by hand (copy it over data.json) gives the same
//   library again;
// - the migrated words work: listed in the sidebar, in the flashcard queue.
// The pure migration functions have their own unit tests in
// tests/core/migrations/.

const fx = buildStressFixture();
const booted: Booted[] = [];

afterEach(async () => {
  for (const b of booted.splice(0)) await b.unload();
});

// The v1 file as an upgrading user has it: the oldest entries lack
// definitionZh (fixture), one carries a field no version of this plugin
// knows (a hand edit / another tool), and the file has an extra top-level
// key.
function v1File(): VocabDataV1 & Record<string, unknown> {
  const v1 = fx.v1Data() as VocabDataV1 & Record<string, unknown>;
  (v1.entries[0] as unknown as Record<string, unknown>).myNote = "手寫的備註";
  v1.lastExport = "2025-12-01";
  return v1;
}

async function boot(data: unknown, app?: FakeApp): Promise<Booted> {
  // No note in front: a first open would auto-import exam words, which is
  // 規劃書 03's job, not the migration's.
  const opts = { data, threads: null, learn: null, activePath: null };
  const b = await bootPlugin(fx, opts, app ?? seedApp(fx, opts));
  booted.push(b);
  return b;
}

function backups(app: FakeApp): [string, string][] {
  return [...app.vault.adapter.files.entries()].filter(([p]) => p.startsWith(`${PLUGIN_DIR}/backup/`));
}

describe("v1 → current schema with 1,000 words", () => {
  it("keeps every v1 field of every word, unchanged and in order", async () => {
    const raw = v1File();
    const b = await boot(raw);
    const entries = b.plugin.store.vocabData.entries;

    expect(entries).toHaveLength(raw.entries.length);
    raw.entries.forEach((old, i) => {
      const now = entries[i] as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(old)) expect(now[key], `${old.id}.${key}`).toEqual(value);
    });
    // Oldest-shape entries stay without definitionZh (nothing invented).
    const noZh = raw.entries.filter((e) => !("definitionZh" in e));
    expect(noZh.length).toBeGreaterThan(0);
    for (const e of noZh) expect(entries.find((x) => x.id === e.id)?.definitionZh).toBeUndefined();
    // The unknown field survives.
    expect((entries[0] as unknown as Record<string, unknown>).myNote).toBe("手寫的備註");
  });

  it("adds the v2 record fields from the old data", async () => {
    const raw = v1File();
    const b = await boot(raw);
    const byId = new Map(raw.entries.map((e) => [e.id, e]));
    for (const e of b.plugin.store.vocabData.entries) {
      const old = byId.get(e.id)!;
      expect(e.lang).toBe("en");
      // rev 1 / updatedAt > createdAt, not 0 / equal: onload's one-time
      // backfillLiked (Wave 7 Y, 1006 #23) touches every migrated entry
      // right after migration to fill in `liked`, which is itself a v2
      // field from old data (a v1 library has no like concept at all).
      expect(e.rev).toBe(1);
      expect(typeof e.liked).toBe("boolean");
      expect(e.createdAt).toBe(new Date(old.added.replace(" ", "T")).toISOString());
      expect(new Date(e.updatedAt!).getTime()).toBeGreaterThanOrEqual(new Date(e.createdAt!).getTime());
      expect(e.deletedAt).toBeUndefined();
    }
    expect(b.plugin.store.vocabData.schemaVersion).toBe(2);
    // Settings come up with every default (AI off, FSRS defaults…).
    expect(b.plugin.store.settings.ai.enabled).toBe(false);
    expect(b.plugin.srs.settings()).toEqual(DEFAULT_SRS_SETTINGS);
  });

  it("backs up the original data.json once, byte-for-byte restorable", async () => {
    const raw = v1File();
    const b = await boot(raw);
    const files = backups(b.app);
    expect(files).toHaveLength(1);
    const [path, text] = files[0];
    expect(path).toMatch(/\/backup\/data-v1-.+\.json$/);
    // Everything the old file had, including keys the migration drops.
    expect(JSON.parse(text)).toEqual(raw);
    // data.json itself was rewritten in the new shape.
    const disk = JSON.parse(b.app.vault.adapter.files.get(pluginFile("data.json"))!);
    expect(disk.schemaVersion).toBe(2);
    expect(disk.entries).toHaveLength(raw.entries.length);
    // Top-level keys other than `entries` only live on in the backup: the
    // v1 → v2 step rebuilds the root. No released v1 wrote any (the root
    // was always { entries }), so nothing real is lost.
    expect(disk.lastExport).toBeUndefined();
  });

  it("doesn't migrate or back up again on the next start", async () => {
    const first = await boot(v1File());
    const before = structuredClone(first.plugin.store.vocabData.entries);
    await first.unload();
    booted.splice(booted.indexOf(first), 1);

    const second = await boot(undefined, first.app);
    expect(backups(second.app)).toHaveLength(1);
    expect(second.plugin.store.vocabData.entries).toEqual(before);
  });

  it("restoring the backup over data.json gives the same library back", async () => {
    // Drops the one stamp onload's backfillLiked (Wave 7 Y) sets from the
    // real wall clock — updatedAt/rev — so this only compares what a
    // restore actually promises to reproduce: the same words, same
    // decided `liked`. Two separate boots of the same v1 backup land
    // milliseconds apart in real time, so those two fields never match
    // byte-for-byte between them even though nothing meaningful differs.
    const stable = (entries: VocabEntry[]) => entries.map(({ updatedAt: _updatedAt, rev: _rev, ...rest }) => rest);

    const first = await boot(v1File());
    const migrated = stable(structuredClone(first.plugin.store.vocabData.entries));
    const [, backupText] = backups(first.app)[0];

    // The manual restore: the backup file copied over data.json.
    const restored = await boot(JSON.parse(backupText));
    expect(stable(restored.plugin.store.vocabData.entries)).toEqual(migrated);
  });

  it("migrated words are usable right away: listed and in the flashcard queue", async () => {
    const b = await boot(v1File());
    const view = await openSidebar(b, "all");
    for (let i = 0; i < 30; i++) await Promise.resolve();
    const root = view.containerEl.children[1] as unknown as FakeElement;
    // 1006report.md #7: the sidebar now only lists isListed words (亮著的
    // 考試標籤，或 like 過) — migrated v1 words carry no `liked` field, so
    // only the ones with a matching exam tag show here.
    const knownTags = b.plugin.wordlists.index.tags;
    const ctx: IsListedContext = {
      knownTags,
      isTagOn: (tag) => tagEnabled(resolveWordlistSettings(b.plugin.store.settings.wordlists), tag),
    likeOn: likeChipOn(resolveWordlistSettings(b.plugin.store.settings.wordlists)),
    };
    const listed = b.plugin.store.entries.filter((e) => isListed(e, ctx));
    expect(root.querySelectorAll(".vt-row")).toHaveLength(listed.length);

    // No SRS state yet: every word is a new card; the daily cap applies.
    await b.plugin.srs.ensureLoaded();
    const queue = b.plugin.srs.queue();
    expect(queue).toHaveLength(b.plugin.srs.settings().dailyNew);
    expect(queue.every((e: VocabEntry) => !e.srs)).toBe(true);
  });
});
