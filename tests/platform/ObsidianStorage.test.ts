import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../perf/support/obsidian"));

import { ObsidianStorage } from "../../src/platform/ObsidianStorage";
import { FakeApp, PLUGIN_DIR, pluginFile } from "../perf/support/app";

function storage() {
  const app = new FakeApp();
  let data: unknown = { schemaVersion: 2, entries: [] };
  const plugin = {
    app,
    manifest: { dir: PLUGIN_DIR },
    loadData: async () => data,
    saveData: async (d: unknown) => void (data = d),
  };
  return { app, storage: new ObsidianStorage(plugin as never) };
}

describe("ObsidianStorage — backups", () => {
  it("writes, lists and reads backups in the plugin's backup/ folder", async () => {
    const { app, storage: s } = storage();
    expect(await s.listBackups()).toEqual([]);
    const path = await s.writeBackup("full-x-manual.json", { a: 1 });
    expect(path).toBe(`${PLUGIN_DIR}/backup/full-x-manual.json`);
    expect(s.backupFolder).toBe(`${PLUGIN_DIR}/backup`);
    app.vault.adapter.files.set(`${PLUGIN_DIR}/backup/notes.txt`, "x");
    expect(await s.listBackups()).toEqual(["full-x-manual.json"]);
    expect(await s.readBackup("full-x-manual.json")).toEqual({ a: 1 });
    expect(await s.readBackup("missing.json")).toBeNull();
  });

  it("keeps writing the migration backup under its old name", async () => {
    const { storage: s } = storage();
    await s.backup("data", { entries: [] });
    expect((await s.listBackups())[0]).toMatch(/^data-v1-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d+Z\.json$/);
  });

  it("refuses names that would leave the folder", async () => {
    const { storage: s } = storage();
    await expect(s.readBackup("../data.json")).rejects.toThrow();
    await expect(s.writeBackup("../../x.json", {})).rejects.toThrow();
  });

  it("reads data.json and every store shard, unknown and unparsable ones included", async () => {
    const { app, storage: s } = storage();
    app.vault.adapter.files.set(pluginFile("store/threads.json"), JSON.stringify({ threads: [] }));
    app.vault.adapter.files.set(pluginFile("store/future.json"), JSON.stringify({ x: 1 }));
    app.vault.adapter.files.set(pluginFile("store/broken.json"), "{oops");
    app.vault.adapter.dirs.add(`${PLUGIN_DIR}/store`);
    expect(await s.readAllShards()).toEqual({
      data: { schemaVersion: 2, entries: [] },
      threads: { threads: [] },
      future: { x: 1 },
      broken: "{oops",
    });
  });
});
