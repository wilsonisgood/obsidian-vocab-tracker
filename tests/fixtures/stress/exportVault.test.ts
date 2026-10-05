import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildStressFixture } from "./index";

// Writes the stress fixture out as an Obsidian vault, for measuring §1.3 in
// the real app (task K's manual checklist). Skipped unless asked for:
//
//   VT_STRESS_VAULT=<an empty or new folder> npx vitest run tests/fixtures/stress/exportVault.test.ts
//
// Then build the plugin, copy main.js / styles.css / manifest.json into
// <vault>/.obsidian/plugins/vocab-tracker/, open the folder as a vault in
// Obsidian and turn community plugins on. A folder that isn't empty is
// refused, so this can never write into a real vault.

const target = process.env.VT_STRESS_VAULT;

describe.skipIf(!target)("export the stress fixture as a vault", () => {
  it("writes the notes, the word lists and the plugin's data", () => {
    const root = resolve(target as string);
    if (existsSync(root)) expect(readdirSync(root), `${root} must be empty`).toEqual([]);
    const fx = buildStressFixture();
    const write = (rel: string, text: string) => {
      const path = join(root, rel);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    };
    for (const n of fx.notes) write(n.path, n.text);
    for (const w of fx.wordlists) write(w.path, w.text);
    const plugin = ".obsidian/plugins/vocab-tracker";
    write(`${plugin}/data.json`, JSON.stringify(fx.data()));
    write(`${plugin}/store/threads.json`, JSON.stringify(fx.threadsShard()));
    write(`${plugin}/store/learn.json`, JSON.stringify(fx.learnShard()));
    write(`${plugin}/store/imports.json`, JSON.stringify({ notes: Object.fromEntries(fx.notes.map((n) => [n.path, fx.now.toISOString()])) }));
    write(".obsidian/community-plugins.json", JSON.stringify(["vocab-tracker"]));
    process.stderr.write(`\n[stress] vault written to ${root}: ${fx.notes.length} notes, ${fx.liveEntries.length} words, ${fx.threads.length} threads\n`);
  });
});
