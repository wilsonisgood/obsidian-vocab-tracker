import { describe, expect, it } from "vitest";
import { findBlockLine } from "../../../src/core/text/blockId";
import { normalizeParagraph, paragraphHash } from "../../../src/core/text/hash";
import { resolveIn, type AnchorResolution, type ParagraphAnchor } from "../../../src/services/anchors/ParagraphAnchorService";
import { noteIndex } from "../../../src/services/anchors/noteIndex";
import { isAnchorable, mergedListSections, noteSections, sectionAt } from "../../../src/services/anchors/sections";
import { buildStressFixture } from "../../fixtures/stress";

// resolveIn now shares one index per note text (M8 perf, task K). It must
// answer exactly what the per-call version did.

function reference(content: string, anchor: ParagraphAnchor): AnchorResolution {
  const sections = noteSections(content);
  const found = (via: "blockId" | "hash", section: (typeof sections)[number]): AnchorResolution => ({
    status: "found",
    via,
    section,
    content,
    edited: normalizeParagraph(section.text) !== normalizeParagraph(anchor.snapshot),
  });
  if (anchor.blockId) {
    const line = findBlockLine(content, anchor.blockId);
    const section = line >= 0 ? sectionAt(sections, line) : undefined;
    if (section) return found("blockId", section);
  }
  const bySnapshot = sections.find((s) => isAnchorable(s.type) && paragraphHash(s.text) === anchor.hash);
  if (bySnapshot) return found("hash", bySnapshot);
  const byGroup = mergedListSections(sections).find((g) => paragraphHash(g.text) === anchor.hash);
  if (byGroup) return found("hash", byGroup.section);
  return { status: "orphan", reason: "missing-paragraph" };
}

const fx = buildStressFixture();
const paragraphs = fx.threads.filter((t) => t.anchor.kind === "paragraph").map((t) => t.anchor as ParagraphAnchor);
const textOf = (path: string) => fx.notes.find((n) => n.path === path)!.text;

describe("resolveIn with the shared note index", () => {
  it("matches the per-call resolution for every anchor in the stress fixture", () => {
    for (const anchor of paragraphs) {
      const content = textOf(anchor.path);
      expect(resolveIn(content, anchor)).toEqual(reference(content, anchor));
    }
  });

  it("matches it when block ids are gone (hash fallback) and when text changed (orphans)", () => {
    for (const anchor of paragraphs.slice(0, 40)) {
      const stripped = textOf(anchor.path).replace(/ \^vt-[0-9a-z]{6}/g, "");
      expect(resolveIn(stripped, anchor)).toEqual(reference(stripped, anchor));
      const edited = stripped.replace(/[aeiou]/g, "x");
      expect(resolveIn(edited, anchor)).toEqual(reference(edited, anchor));
    }
  });

  it("takes the first line when a block id appears twice", () => {
    const content = "First one. ^dup\n\nSecond one. ^dup";
    const anchor: ParagraphAnchor = { kind: "paragraph", path: "a.md", blockId: "dup", hash: "x", snapshot: "First one." };
    expect(resolveIn(content, anchor)).toEqual(reference(content, anchor));
    expect(resolveIn(content, anchor)).toMatchObject({ status: "found", section: { lineStart: 0 } });
  });

  it("follows the note when its text changes", () => {
    const anchor: ParagraphAnchor = { kind: "paragraph", path: "a.md", blockId: "vt-aaaaaa", hash: paragraphHash("Hello."), snapshot: "Hello." };
    expect(resolveIn("Hello. ^vt-aaaaaa", anchor)).toMatchObject({ status: "found", via: "blockId" });
    expect(resolveIn("Intro.\n\nHello.", anchor)).toMatchObject({ status: "found", via: "hash", section: { lineStart: 2 } });
    expect(resolveIn("Bye.", anchor)).toEqual({ status: "orphan", reason: "missing-paragraph" });
  });

  it("falls back to a merged list group's hash when an old whole-list anchor no longer matches any single item (§5.1 feedback point 5)", () => {
    const items = [`* ${"a".repeat(130)}`, `* ${"b".repeat(130)}`, `* ${"c".repeat(130)}`];
    const content = ["# Speech", "", ...items].join("\n");
    const anchor: ParagraphAnchor = { kind: "paragraph", path: "a.md", hash: paragraphHash(items.join("\n")), snapshot: items.join("\n") };
    expect(resolveIn(content, anchor)).toEqual(reference(content, anchor));
    const r = resolveIn(content, anchor);
    expect(r).toMatchObject({ status: "found", via: "hash", section: { lineStart: 2 } });
  });

  it("hands out copies, so a caller can't change the shared index", () => {
    const content = textOf(fx.article.path);
    const anchor = paragraphs.find((a) => a.path === fx.article.path)!;
    const first = resolveIn(content, anchor);
    if (first.status !== "found") throw new Error("expected found");
    first.section.text = "changed";
    expect(resolveIn(content, anchor)).toEqual(reference(content, anchor));
    expect(noteIndex(content).sections.some((s) => s.text === "changed")).toBe(false);
  });
});
