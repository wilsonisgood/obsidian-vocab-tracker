import { describe, expect, it } from "vitest";
import { editFrontmatter, readFrontmatter } from "../../../src/services/export/frontmatter";
import { aiNoteOwner, claimAiNote, retargetAiNote } from "../../../src/services/export/renderers/aiNote";

describe("readFrontmatter", () => {
  it("reads top-level fields, unquoting JSON and single-quoted strings", () => {
    const text = "---\nvocab-tracker: ai-note\nvocab-tracker-id: \"a/Notes.md\"\nsource: '[[it''s]]'\ntags:\n  - x\n---\nbody: not frontmatter\n";
    expect(readFrontmatter(text)).toEqual({ "vocab-tracker": "ai-note", "vocab-tracker-id": "a/Notes.md", source: "[[it's]]", tags: "" });
  });

  it("is null without frontmatter, and handles an empty one and CRLF", () => {
    expect(readFrontmatter("# Title\n---\nk: v\n---\n")).toBeNull();
    expect(readFrontmatter("---\nk: v\n")).toBeNull(); // never closed
    expect(readFrontmatter("---\n---\nbody")).toEqual({});
    expect(readFrontmatter("---\r\nk: v\r\n---\r\n")).toEqual({ k: "v" });
  });
});

describe("editFrontmatter", () => {
  const text = "---\nvocab-tracker: ai-note\naliases: [x]\nsource: \"[[a/Notes]]\"\n---\n\nsource: \"[[a/Notes]]\" in the body\n";

  it("replaces only the given keys' lines", () => {
    expect(editFrontmatter(text, { source: "[[c/Notes]]" })).toBe(text.replace('source: "[[a/Notes]]"\n---', 'source: "[[c/Notes]]"\n---'));
  });

  it("adds missing keys after the named key, or at the end", () => {
    expect(editFrontmatter(text, { "vocab-tracker-id": "a/Notes.md" }, { add: true, after: "vocab-tracker" })).toBe(
      text.replace("ai-note\n", 'ai-note\nvocab-tracker-id: "a/Notes.md"\n')
    );
    expect(editFrontmatter(text, { k: "v" }, { add: true })).toBe(text.replace("]]\"\n---", ']]"\nk: v\n---'));
    expect(editFrontmatter(text, { k: "v" })).toBe(text);
  });

  it("never adds frontmatter to a note without one", () => {
    expect(editFrontmatter("just text\n", { k: "v" }, { add: true })).toBe("just text\n");
  });

  it("replaces a block list value with the key", () => {
    expect(editFrontmatter("---\nsource:\n  - a\n  - b\nk: v\n---\n", { source: "s" })).toBe("---\nsource: s\nk: v\n---\n");
  });

  it("keeps CRLF line breaks", () => {
    expect(editFrontmatter("---\r\nk: v\r\n---\r\nbody\r\n", { k: "w", n: "1" }, { add: true })).toBe(
      '---\r\nk: w\r\nn: "1"\r\n---\r\nbody\r\n'
    );
  });
});

describe("aiNoteOwner", () => {
  const note = (fm: string) => `---\n${fm}\n---\nbody\n`;

  it("goes by the id when there is one", () => {
    expect(aiNoteOwner(note('vocab-tracker: ai-note\nvocab-tracker-id: "a/Notes.md"\nsource: "[[b/Notes]]"'), "a/Notes.md")).toBe("id");
    expect(aiNoteOwner(note('vocab-tracker: ai-note\nvocab-tracker-id: "b/Notes.md"\nsource: "[[a/Notes]]"'), "a/Notes.md")).toBe("other");
  });

  it("an older note without an id goes by its source link", () => {
    expect(aiNoteOwner(note('vocab-tracker: ai-note\nsource: "[[a/Notes]]"'), "a/Notes.md")).toBe("source");
    expect(aiNoteOwner(note('vocab-tracker: ai-note\nsource: "[[a/Notes|Notes]]"'), "a/Notes.md")).toBe("source");
    expect(aiNoteOwner(note('vocab-tracker: ai-note\nsource: "[[b/Notes]]"'), "a/Notes.md")).toBe("other");
    // A bare name could be any same-name article: only trusted during a rename.
    expect(aiNoteOwner(note('vocab-tracker: ai-note\nsource: "[[Notes]]"'), "a/Notes.md")).toBe("other");
    expect(aiNoteOwner(note('vocab-tracker: ai-note\nsource: "[[New]]"'), "a/Notes.md", "a/New.md")).toBe("source");
  });

  it("a note that says nothing is unclaimed; another kind of note isn't ours", () => {
    expect(aiNoteOwner("my own text\n", "a/Notes.md")).toBe("unclaimed");
    expect(aiNoteOwner(note("aliases: [x]"), "a/Notes.md")).toBe("unclaimed");
    expect(aiNoteOwner(note("vocab-tracker: word\nvocab-tracker-id: a/Notes.md"), "a/Notes.md")).toBe("other");
  });
});

describe("claimAiNote / retargetAiNote", () => {
  it("claim adds the id (and the kind when missing) without touching other lines", () => {
    expect(claimAiNote('---\nvocab-tracker: ai-note\nsource: "[[a/Notes]]"\n---\nbody\n', "a/Notes.md")).toBe(
      '---\nvocab-tracker: ai-note\nvocab-tracker-id: "a/Notes.md"\nsource: "[[a/Notes]]"\n---\nbody\n'
    );
    expect(claimAiNote("---\naliases: [x]\n---\nbody\n", "a/Notes.md")).toBe(
      '---\naliases: [x]\nvocab-tracker: ai-note\nvocab-tracker-id: "a/Notes.md"\n---\nbody\n'
    );
    expect(claimAiNote("body\n", "a/Notes.md")).toBe("body\n");
  });

  it("retarget points the id and an existing source at the new path", () => {
    const before = '---\nvocab-tracker: ai-note\nvocab-tracker-id: "a/Notes.md"\nsource: "[[a/Notes]]"\n---\n![[a/Notes#^vt-1]]\n';
    expect(retargetAiNote(before, "c/New.md")).toBe(
      '---\nvocab-tracker: ai-note\nvocab-tracker-id: "c/New.md"\nsource: "[[c/New]]"\n---\n![[a/Notes#^vt-1]]\n'
    );
    // No source line: none is added.
    expect(retargetAiNote('---\nvocab-tracker: ai-note\nvocab-tracker-id: "a/Notes.md"\n---\n', "c/New.md")).toBe(
      '---\nvocab-tracker: ai-note\nvocab-tracker-id: "c/New.md"\n---\n'
    );
  });
});
