import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { GRAMMAR_TOPICS } from "../../src/core/grammar/catalog";
import { layoutOf, mappedTopics, parseVisual, LAYOUT_KINDS } from "../../src/grammar-visual";
import { sentencePieces } from "../../src/grammar-visual/kit/dom";

const ROOT = resolve(__dirname, "../../src/grammar-visual");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("grammar-visual 是獨立模組", () => {
  it("只 import 自己資料夾裡的檔案", () => {
    const bad: string[] = [];
    for (const f of files(ROOT)) {
      for (const m of readFileSync(f, "utf8").matchAll(/from\s+"([^"]+)"/g)) {
        const spec = m[1];
        if (!spec.startsWith(".")) bad.push(`${relative(ROOT, f)}: ${spec}`);
        else if (relative(ROOT, resolve(dirname(f), spec)).startsWith("..")) bad.push(`${relative(ROOT, f)}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("主題 → 版面", () => {
  it("文法目錄的每個主題都對到一種版面，沒有多的", () => {
    const ids = GRAMMAR_TOPICS.map((t) => t.id);
    expect(ids.filter((id) => !layoutOf(id))).toEqual([]);
    expect(mappedTopics().filter((id) => !ids.includes(id))).toEqual([]);
    expect(mappedTopics().length).toBe(ids.length);
  });
  it("十四種版面都至少有一個主題", () => {
    const used = new Set(GRAMMAR_TOPICS.map((t) => layoutOf(t.id)));
    expect(LAYOUT_KINDS.filter((k) => !used.has(k))).toEqual([]);
  });
});

describe("parseVisual", () => {
  it("不認得的 kind、不是物件都回 null", () => {
    expect(parseVisual(null)).toBeNull();
    expect(parseVisual([])).toBeNull();
    expect(parseVisual({ kind: "nope" })).toBeNull();
  });
});

describe("sentencePieces", () => {
  it("依序找標記，找不到的略過", () => {
    const p = sentencePieces({
      text: "Although it rained, we went hiking.",
      marks: [
        { text: "Although", tone: "accent" },
        { text: "missing", tone: "muted" },
        { text: "hiking", tone: "amber" },
      ],
    });
    expect(p.map((x) => [x.text, x.tone])).toEqual([
      ["Although", "accent"],
      [" it rained, we went ", null],
      ["hiking", "amber"],
      [".", null],
    ]);
  });
});

describe("renderGrammarVisual", () => {
  it("版面畫失敗時退回文字說明", async () => {
    const { draw } = await import("./support");
    const host = draw({ kind: "timeline", sentence: { text: "x", marks: [] }, explain: "說明文字", events: null as never, ref: { at: 0, label: "現在" } });
    expect(host.textContent).toContain("說明文字");
  });
});
