import { describe, expect, it } from "vitest";
import type { StoragePort } from "../../../src/core/ports";
import { NoteImports } from "../../../src/services/wordlists/NoteImports";

function memoryStorage(initial: Record<string, unknown> = {}) {
  const shards: Record<string, unknown> = { ...initial };
  const storage: StoragePort = {
    readShard: async <T>(name: string) => (shards[name] as T) ?? null,
    writeShard: async (name, data) => void (shards[name] = JSON.parse(JSON.stringify(data))),
    backup: async () => {},
  };
  return { storage, shards };
}

describe("NoteImports", () => {
  it("persists, renames and forgets imported notes", async () => {
    const { storage, shards } = memoryStorage({ imports: { notes: { "a.md": "t0" } } });
    const imports = new NoteImports(storage);
    await imports.load();
    expect(imports.has("a.md")).toBe(true);

    await imports.mark("b.md", "t1");
    await imports.rename("a.md", "dir/a.md");
    expect(shards.imports).toEqual({ notes: { "b.md": "t1", "dir/a.md": "t0" } });

    await imports.forget("b.md");
    expect(imports.has("b.md")).toBe(false);
  });

  it("unions with the disk copy on reload", async () => {
    const { storage, shards } = memoryStorage();
    const imports = new NoteImports(storage);
    await imports.load();
    await imports.mark("local.md", "t1");
    shards.imports = { notes: { "remote.md": "t2" } };
    await imports.load();
    expect(imports.has("local.md") && imports.has("remote.md")).toBe(true);
  });
});
