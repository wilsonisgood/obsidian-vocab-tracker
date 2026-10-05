import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 規劃書 06 §9.1: every class is vt-prefixed; the old vocab-tracker-* aliases
// were removed in M8. The data / API identifiers that share the prefix stay.
const ALLOWED = new Set([
  "vocab-tracker-sidebar", // VOCAB_VIEW_TYPE (saved in users' workspace.json)
  "vocab-tracker-id", // frontmatter key on word pages / .ai.md notes
]);

function walk(dir: URL, exts: string[]): URL[] {
  const out: URL[] = [];
  for (const name of readdirSync(dir)) {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) out.push(...walk(new URL(`${name}/`, dir), exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(url);
  }
  return out;
}

const SRC = new URL("../../src/", import.meta.url);
const STYLES = new URL("../../src/styles/", import.meta.url);
const read = (u: URL) => readFileSync(u, "utf8");

describe("class names (06 §9.1)", () => {
  it("no stylesheet selects a legacy vocab-tracker-* class", () => {
    for (const file of walk(STYLES, [".css"])) {
      expect(read(file), file.pathname).not.toMatch(/\.vocab-tracker-/);
    }
  });

  it("UI code only uses vocab-tracker-* for data / API identifiers", () => {
    const files = [...walk(new URL("ui/", SRC), [".ts"]), new URL("../../main.ts", import.meta.url)];
    for (const file of files) {
      const names = read(file).match(/vocab-tracker-[a-z0-9-]+/g) ?? [];
      for (const n of names) expect(ALLOWED.has(n), `${file.pathname}: ${n}`).toBe(true);
    }
  });
});
