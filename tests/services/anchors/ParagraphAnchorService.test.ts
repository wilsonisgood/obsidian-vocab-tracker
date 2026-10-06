import { describe, expect, it, vi } from "vitest";
import { paragraphHash } from "../../../src/core/text/hash";
import {
  AnchorError,
  ParagraphAnchorService,
  resolveIn,
  type ParagraphAnchor,
  type SectionRef,
} from "../../../src/services/anchors/ParagraphAnchorService";
import type { AnchorMode } from "../../../src/core/ports";
import { sectionText } from "../../../src/services/anchors/sections";
import { idSource, MemoryVault } from "./fakes";

const PATH = "eng/Speech.md";
const NOTE = [
  "# Speech", // 0
  "", // 1
  "Hi. Hello. Hi.", // 2
  "", // 3
  "Last time I was in a stadium this size,", // 4
  "I was wearing a ==glittery== leotard.", // 5
  "", // 6
  "The end.", // 7
].join("\n");

function ref(content: string, lineStart: number, lineEnd: number, path = PATH): SectionRef {
  return { path, lineStart, lineEnd, text: sectionText(content, lineStart, lineEnd) };
}

function setup(mode: AnchorMode = "block", files: Record<string, string> = { [PATH]: NOTE }, ...ids: string[]) {
  const vault = new MemoryVault(files);
  const anchors = new ParagraphAnchorService({ vault, mode: () => mode, random: idSource(...(ids.length ? ids : ["k3x9q2"])) });
  return { vault, anchors };
}

describe("ParagraphAnchorService.create — block mode", () => {
  it("writes ^vt-xxxxxx at the end of the paragraph's last line", async () => {
    const { vault, anchors } = setup();
    const a = await anchors.create(ref(NOTE, 4, 5));
    expect(a).toEqual({
      kind: "paragraph",
      path: PATH,
      blockId: "vt-k3x9q2",
      hash: paragraphHash("Last time I was in a stadium this size,\nI was wearing a glittery leotard."),
      snapshot: "Last time I was in a stadium this size,\nI was wearing a glittery leotard.",
    });
    expect(vault.files.get(PATH)?.split("\n")[5]).toBe("I was wearing a ==glittery== leotard. ^vt-k3x9q2");
    expect(vault.writes).toEqual([PATH]);
  });

  it("skips ids already used anywhere in the vault", async () => {
    const { anchors, vault } = setup("block", { [PATH]: NOTE, "other.md": "Taken. ^vt-aaaaaa" }, "aaaaaa", "bbbbbb");
    expect((await anchors.create(ref(NOTE, 2, 2))).blockId).toBe("vt-bbbbbb");
    expect(vault.files.get("other.md")).toBe("Taken. ^vt-aaaaaa");
  });

  it("reuses a block id the paragraph already has and writes nothing", async () => {
    const note = NOTE.replace("Hi. Hello. Hi.", "Hi. Hello. Hi. ^greeting");
    const { anchors, vault } = setup("block", { [PATH]: note });
    expect((await anchors.create(ref(note, 2, 2))).blockId).toBe("greeting");
    expect(vault.writes).toEqual([]);
  });

  it("finds the paragraph again when the note changed before the write", async () => {
    const { anchors, vault } = setup();
    vault.beforeProcess = (p) => vault.files.set(p, `New first line.\n\n${vault.files.get(p)}`);
    const a = await anchors.create(ref(NOTE, 4, 5));
    const lines = vault.files.get(PATH)?.split("\n") ?? [];
    expect(lines[7]).toBe("I was wearing a ==glittery== leotard. ^vt-k3x9q2");
    expect(a.blockId).toBe("vt-k3x9q2");
  });

  it("finds the paragraph by text when the UI's line range is stale", async () => {
    const { anchors, vault } = setup();
    const stale = { ...ref(NOTE, 4, 5), lineStart: 9, lineEnd: 10 };
    expect((await anchors.create(stale)).blockId).toBe("vt-k3x9q2");
    expect(vault.files.get(PATH)).toContain("leotard. ^vt-k3x9q2");
  });

  it("falls back to a hash anchor when the write fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { anchors, vault } = setup();
    vault.failProcess = true;
    const a = await anchors.create(ref(NOTE, 2, 2));
    expect(a.blockId).toBeUndefined();
    expect(a.hash).toBe(paragraphHash("Hi. Hello. Hi."));
    expect(vault.files.get(PATH)).toBe(NOTE);
    warn.mockRestore();
  });

  it("rejects missing notes, vanished paragraphs and non-paragraph sections", async () => {
    const { anchors } = setup();
    await expect(anchors.create({ ...ref(NOTE, 2, 2), path: "gone.md" })).rejects.toMatchObject({ code: "missing-file" });
    await expect(anchors.create({ path: PATH, lineStart: 2, lineEnd: 2, text: "Not in the note." })).rejects.toBeInstanceOf(
      AnchorError
    );
    await expect(anchors.create(ref(NOTE, 0, 0))).rejects.toMatchObject({ code: "not-anchorable" });
  });
});

describe("ParagraphAnchorService.create — list items (§5.1 feedback)", () => {
  const LIST_NOTE = [
    "# Speech", // 0
    "", // 1
    `* ${"x".repeat(130)}`, // 2 — long item, item 0
    `  - a nested detail`, // 3 — sub-item of item 0
    `* ${"y".repeat(130)}`, // 4 — long item, item 1
  ].join("\n");

  it("writes the block id on the item's own line, not a nested sub-item", async () => {
    const { vault, anchors } = setup("block", { [PATH]: LIST_NOTE });
    const a = await anchors.create(ref(LIST_NOTE, 2, 3));
    const lines = vault.files.get(PATH)?.split("\n") ?? [];
    // Line 2 (the item itself) gets the id, line 3 (its sub-item) doesn't.
    expect(lines[2]).toBe(`* ${"x".repeat(130)} ^vt-k3x9q2`);
    expect(lines[3]).toBe("  - a nested detail");
    expect(a.blockId).toBe("vt-k3x9q2");
  });

  it("doesn't re-anchor an item that already ends in a block id before its sub-item", async () => {
    const note = LIST_NOTE.replace(`* ${"x".repeat(130)}`, `* ${"x".repeat(130)} ^mine`);
    const { anchors, vault } = setup("block", { [PATH]: note });
    const a = await anchors.create(ref(note, 2, 3));
    expect(a.blockId).toBe("mine");
    expect(vault.writes).toEqual([]);
  });
});

describe("ParagraphAnchorService — backward compatibility with a pre-split whole-list anchor (§5.1 feedback point 5)", () => {
  const items = [`* ${"a".repeat(130)}`, `* ${"b".repeat(130)}`, `* ${"c".repeat(130)}`];
  const NOTE_LIST = ["# Speech", "", ...items].join("\n");

  it("a block id once written at the whole list's last line now lands on the last item (reasonable, not missing)", async () => {
    const withId = NOTE_LIST + " ^vt-old001";
    const anchor: ParagraphAnchor = {
      kind: "paragraph",
      path: PATH,
      blockId: "vt-old001",
      hash: paragraphHash(items.join("\n")), // the hash the old (unsplit) anchor was made with
      snapshot: items.join("\n"),
    };
    const r = resolveIn(withId, anchor);
    expect(r).toMatchObject({ status: "found", via: "blockId" });
    if (r.status === "found") expect(r.section.lineStart).toBe(4); // the last item, not the whole list
  });

  it("a hash anchor made against the whole (unsplit) list still resolves, against the first item", () => {
    const anchor: ParagraphAnchor = {
      kind: "paragraph",
      path: PATH,
      hash: paragraphHash(items.join("\n")),
      snapshot: items.join("\n"),
    };
    const r = resolveIn(NOTE_LIST, anchor);
    expect(r).toMatchObject({ status: "found", via: "hash" });
    if (r.status === "found") expect(r.section.lineStart).toBe(2); // the first item
  });
});

describe("ParagraphAnchorService.create — hash mode", () => {
  it("never touches the note", async () => {
    const { anchors, vault } = setup("hash");
    const a = await anchors.create(ref(NOTE, 4, 5));
    expect(a.blockId).toBeUndefined();
    expect(a.hash).toHaveLength(12);
    expect(vault.writes).toEqual([]);
  });
});

describe("resolve: blockId → hash → orphan", () => {
  it("follows a block id when the paragraph moved and was edited", async () => {
    const { anchors, vault } = setup();
    const a = await anchors.create(ref(NOTE, 4, 5));
    const moved = (vault.files.get(PATH) ?? "")
      .replace("# Speech\n\n", "# Speech\n\nA brand new opening paragraph.\n\n")
      .replace("stadium this size", "stadium of this size");
    vault.files.set(PATH, moved);
    const r = await anchors.resolve(a);
    expect(r).toMatchObject({ status: "found", via: "blockId", edited: true });
    if (r.status === "found") expect(r.section.lineStart).toBe(6);
  });

  it("hash mode: found while the text is unchanged, orphaned once it changes", async () => {
    const { anchors, vault } = setup("hash");
    const a = await anchors.create(ref(NOTE, 4, 5));
    // Moving it and adding highlight marks doesn't matter…
    vault.files.set(PATH, `Intro.\n\n${NOTE.replace("stadium", "==stadium==")}`);
    expect(await anchors.resolve(a)).toMatchObject({ status: "found", via: "hash", edited: false });
    // …changing a word does.
    vault.files.set(PATH, NOTE.replace("leotard", "costume"));
    expect(await anchors.resolve(a)).toEqual({ status: "orphan", reason: "missing-paragraph" });
  });

  it("falls back to the hash when the block id was deleted", async () => {
    const { anchors, vault } = setup();
    const a = await anchors.create(ref(NOTE, 2, 2));
    vault.files.set(PATH, (vault.files.get(PATH) ?? "").replace(" ^vt-k3x9q2", ""));
    expect(await anchors.resolve(a)).toMatchObject({ status: "found", via: "hash", edited: false });
  });

  it("is orphaned when the note is deleted", async () => {
    const { anchors, vault } = setup();
    const a = await anchors.create(ref(NOTE, 2, 2));
    vault.files.delete(PATH);
    expect(await anchors.resolve(a)).toEqual({ status: "orphan", reason: "missing-file" });
  });

  it("resolveIn is pure and reports edits against the snapshot", () => {
    const anchor: ParagraphAnchor = { kind: "paragraph", path: PATH, blockId: "p1", hash: "000000000000", snapshot: "Old text." };
    const r = resolveIn("New text. ^p1", anchor);
    expect(r).toMatchObject({ status: "found", via: "blockId", edited: true });
    expect(resolveIn("Old ==text==. ^p1", anchor)).toMatchObject({ edited: false });
  });
});
