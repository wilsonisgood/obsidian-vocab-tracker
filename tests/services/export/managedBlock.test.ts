import { describe, expect, it } from "vitest";
import {
  applyManagedBlocks,
  beginMarker,
  buildManagedFile,
  endMarker,
  findManagedBlock,
  renderSection,
  replaceManagedBlock,
  type ManagedSection,
} from "../../../src/services/export/managedBlock";

const B = (name: string) => `%% vt:begin ${name} %%`;
const E = (name: string) => `%% vt:end ${name} %%`;

// The core promise (規劃書 06 §8.2): text outside the markers never
// changes. If the block was found, everything up to and including the
// begin line and everything from the end line on is byte-identical;
// otherwise the original text is an untouched prefix of the result.
function expectOnlyBlockChanged(before: string, after: string, name: string): void {
  const range = findManagedBlock(before, name);
  if (range) {
    expect(after.slice(0, range.contentStart)).toBe(before.slice(0, range.contentStart));
    const tail = before.slice(range.contentEnd);
    expect(after.endsWith(tail)).toBe(true);
  } else {
    expect(after.startsWith(before)).toBe(true);
  }
}

function contentOf(text: string, name: string): string | null {
  const r = findManagedBlock(text, name);
  return r ? text.slice(r.contentStart, r.contentEnd) : null;
}

const sec = (name: string, body: string): ManagedSection => ({ name, body });

describe("markers", () => {
  it("formats begin and end markers", () => {
    expect(beginMarker("families")).toBe("%% vt:begin families %%");
    expect(endMarker("families")).toBe("%% vt:end families %%");
  });

  it.each(["", "Families", "has space", "a_b", "-lead", "x%%"])("rejects invalid name %j", (name) => {
    expect(() => beginMarker(name)).toThrow();
    expect(() => replaceManagedBlock("", sec(name, "x"))).toThrow();
  });

  it("renders a section with its markers", () => {
    expect(renderSection(sec("a", "one\ntwo"))).toBe(`${B("a")}\none\ntwo\n${E("a")}`);
    expect(renderSection(sec("a", ""))).toBe(`${B("a")}\n${E("a")}`);
    expect(renderSection(sec("a", "x"), "\r\n")).toBe(`${B("a")}\r\nx\r\n${E("a")}`);
  });
});

describe("replaceManagedBlock — markers present", () => {
  const doc = [
    "---",
    "vocab-tracker: word",
    "---",
    "```vocab-word",
    "```",
    B("families"),
    "## 字族",
    "old",
    E("families"),
    "",
    "my own notes",
    "",
  ].join("\n");

  it("replaces only the lines between the markers", () => {
    const out = replaceManagedBlock(doc, sec("families", "## 字族\nnew line 1\nnew line 2"));
    expect(out).toBe(doc.replace("## 字族\nold\n", "## 字族\nnew line 1\nnew line 2\n"));
    expectOnlyBlockChanged(doc, out, "families");
  });

  it("returns the very same string when nothing changed", () => {
    const out = replaceManagedBlock(doc, sec("families", "## 字族\nold"));
    expect(out).toBe(doc);
  });

  it("is idempotent", () => {
    const once = replaceManagedBlock(doc, sec("families", "X"));
    expect(replaceManagedBlock(once, sec("families", "X"))).toBe(once);
  });

  it("an empty body leaves the markers on adjacent lines", () => {
    const out = replaceManagedBlock(doc, sec("families", ""));
    expect(out).toContain(`${B("families")}\n${E("families")}\n`);
    expectOnlyBlockChanged(doc, out, "families");
    // And it can be filled again afterwards.
    expect(contentOf(replaceManagedBlock(out, sec("families", "back")), "families")).toBe("back\n");
  });

  it("replaces an initially empty block", () => {
    const text = `intro\n${B("a")}\n${E("a")}\noutro`;
    expect(replaceManagedBlock(text, sec("a", "x"))).toBe(`intro\n${B("a")}\nx\n${E("a")}\noutro`);
  });

  it("works when the end marker is the last line without a newline", () => {
    const text = `notes\n${B("a")}\nold\n${E("a")}`;
    const out = replaceManagedBlock(text, sec("a", "new"));
    expect(out).toBe(`notes\n${B("a")}\nnew\n${E("a")}`);
  });

  it("works when the begin marker is the first line", () => {
    const text = `${B("a")}\nold\n${E("a")}\nrest`;
    expect(replaceManagedBlock(text, sec("a", "new"))).toBe(`${B("a")}\nnew\n${E("a")}\nrest`);
  });

  it("accepts markers with extra spaces or indentation and keeps them as written", () => {
    const text = `x\n  %%  vt:begin a  %%  \nold\n\t%% vt:end a %%\ny`;
    const out = replaceManagedBlock(text, sec("a", "new"));
    expect(out).toBe(`x\n  %%  vt:begin a  %%  \nnew\n\t%% vt:end a %%\ny`);
  });

  it("does not treat a marker in the middle of a line as a marker", () => {
    const text = `see %% vt:begin a %% here\nand %% vt:end a %% there\n`;
    const out = replaceManagedBlock(text, sec("a", "x"));
    expect(out.startsWith(text)).toBe(true);
    expect(out).toBe(`${text}\n${B("a")}\nx\n${E("a")}\n`);
  });

  it("does not confuse names that share a prefix", () => {
    const text = `${B("family")}\nf\n${E("family")}\n${B("families")}\nfs\n${E("families")}\n`;
    const out = replaceManagedBlock(text, sec("families", "NEW"));
    expect(contentOf(out, "family")).toBe("f\n");
    expect(contentOf(out, "families")).toBe("NEW\n");
  });

  it("keeps other sections intact", () => {
    const text = `${B("a")}\n1\n${E("a")}\nuser\n${B("b")}\n2\n${E("b")}\n`;
    const out = replaceManagedBlock(text, sec("b", "two"));
    expect(out).toBe(`${B("a")}\n1\n${E("a")}\nuser\n${B("b")}\ntwo\n${E("b")}\n`);
  });

  it("drops text the user typed *inside* a block (that part is managed)", () => {
    const text = `${B("a")}\ngenerated\nuser typed here\n${E("a")}\nsafe\n`;
    const out = replaceManagedBlock(text, sec("a", "regenerated"));
    expect(out).toBe(`${B("a")}\nregenerated\n${E("a")}\nsafe\n`);
  });

  it("ignores code fences — markers are line-based everywhere", () => {
    // An answer that stopped mid code block must not hide the end marker.
    const text = `${B("a")}\n\`\`\`js\nunclosed\n${E("a")}\nnotes\n`;
    const out = replaceManagedBlock(text, sec("a", "fixed"));
    expect(out).toBe(`${B("a")}\nfixed\n${E("a")}\nnotes\n`);
  });
});

describe("replaceManagedBlock — markers missing", () => {
  it("appends the section after a file that ends with a newline, separated by a blank line", () => {
    const text = "# My page\n\nnotes\n";
    const out = replaceManagedBlock(text, sec("a", "x"));
    expect(out).toBe(`# My page\n\nnotes\n\n${B("a")}\nx\n${E("a")}\n`);
    expectOnlyBlockChanged(text, out, "a");
  });

  it("appends after a file with no trailing newline without touching its last line", () => {
    const text = "notes without newline";
    const out = replaceManagedBlock(text, sec("a", "x"));
    expect(out).toBe(`notes without newline\n\n${B("a")}\nx\n${E("a")}\n`);
    expect(out.startsWith(text)).toBe(true);
  });

  it("doesn't add another blank line when the file already ends with one", () => {
    const text = "notes\n\n";
    expect(replaceManagedBlock(text, sec("a", "x"))).toBe(`notes\n\n${B("a")}\nx\n${E("a")}\n`);
  });

  it("treats a whitespace-only last line as blank", () => {
    const text = "notes\n  \n";
    expect(replaceManagedBlock(text, sec("a", "x"))).toBe(`notes\n  \n${B("a")}\nx\n${E("a")}\n`);
  });

  it("writes just the section into an empty file", () => {
    expect(replaceManagedBlock("", sec("a", "x"))).toBe(`${B("a")}\nx\n${E("a")}\n`);
  });

  it("begin marker without end: appends a fresh block, leaves the orphan alone", () => {
    const text = `${B("a")}\nold generated\n\nmy precious notes\nmore notes\n`;
    const out = replaceManagedBlock(text, sec("a", "new"));
    expect(out.startsWith(text)).toBe(true);
    expect(out).toBe(`${text}\n${B("a")}\nnew\n${E("a")}\n`);

    // Next export: the end marker must pair with the *appended* begin, not
    // the orphan — otherwise it would swallow the notes in between.
    const again = replaceManagedBlock(out, sec("a", "newer"));
    expect(again).toBe(`${text}\n${B("a")}\nnewer\n${E("a")}\n`);
    expect(again).toContain("my precious notes\nmore notes\n");
  });

  it("end marker without begin: appends a fresh block, leaves the orphan alone", () => {
    const text = `old generated\n${E("a")}\nmy notes\n`;
    const out = replaceManagedBlock(text, sec("a", "new"));
    expect(out).toBe(`${text}\n${B("a")}\nnew\n${E("a")}\n`);
    const again = replaceManagedBlock(out, sec("a", "newer"));
    expect(again).toBe(`${text}\n${B("a")}\nnewer\n${E("a")}\n`);
  });

  it("end before begin (swapped by hand) counts as missing", () => {
    const text = `${E("a")}\nnotes\n${B("a")}\nmore notes\n`;
    const out = replaceManagedBlock(text, sec("a", "x"));
    expect(out.startsWith(text)).toBe(true);
    expect(replaceManagedBlock(out, sec("a", "y"))).toBe(`${text}\n${B("a")}\ny\n${E("a")}\n`);
  });

  it("a marker for a different section doesn't count", () => {
    const text = `${B("b")}\nb\n${E("b")}\n`;
    const out = replaceManagedBlock(text, sec("a", "x"));
    expect(out).toBe(`${text}\n${B("a")}\nx\n${E("a")}\n`);
  });
});

describe("replaceManagedBlock — duplicates", () => {
  it("only the first complete pair is replaced; a pasted copy stays as it is", () => {
    const text = `${B("a")}\n1\n${E("a")}\nnotes\n${B("a")}\ncopy\n${E("a")}\n`;
    const out = replaceManagedBlock(text, sec("a", "new"));
    expect(out).toBe(`${B("a")}\nnew\n${E("a")}\nnotes\n${B("a")}\ncopy\n${E("a")}\n`);
  });

  it("two begins then one end: pairs with the nearer begin", () => {
    const text = `${B("a")}\nnotes between\n${B("a")}\nold\n${E("a")}\ntail\n`;
    const out = replaceManagedBlock(text, sec("a", "new"));
    expect(out).toBe(`${B("a")}\nnotes between\n${B("a")}\nnew\n${E("a")}\ntail\n`);
    expectOnlyBlockChanged(text, out, "a");
  });

  it("one begin then two ends: uses the first end, later text untouched", () => {
    const text = `${B("a")}\nold\n${E("a")}\nnotes\n${E("a")}\ntail\n`;
    const out = replaceManagedBlock(text, sec("a", "new"));
    expect(out).toBe(`${B("a")}\nnew\n${E("a")}\nnotes\n${E("a")}\ntail\n`);
  });
});

describe("replaceManagedBlock — line endings and encoding", () => {
  it("keeps a CRLF file CRLF, outside text byte-identical", () => {
    const text = `# T\r\n\r\n${B("a")}\r\nold\r\n${E("a")}\r\nnotes\r\n`;
    const out = replaceManagedBlock(text, sec("a", "one\ntwo"));
    expect(out).toBe(`# T\r\n\r\n${B("a")}\r\none\r\ntwo\r\n${E("a")}\r\nnotes\r\n`);
    expectOnlyBlockChanged(text, out, "a");
    expect(out.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  it("appends to a CRLF file with CRLF", () => {
    const text = "notes\r\n";
    expect(replaceManagedBlock(text, sec("a", "x"))).toBe(`notes\r\n\r\n${B("a")}\r\nx\r\n${E("a")}\r\n`);
  });

  it("appends to a CRLF file without trailing newline", () => {
    const text = "line1\r\nline2";
    expect(replaceManagedBlock(text, sec("a", "x"))).toBe(`line1\r\nline2\r\n\r\n${B("a")}\r\nx\r\n${E("a")}\r\n`);
  });

  it("normalizes a body's own line breaks to the file's", () => {
    const text = `${B("a")}\nold\n${E("a")}\n`;
    expect(replaceManagedBlock(text, sec("a", "x\r\ny\rz"))).toBe(`${B("a")}\nx\ny\nz\n${E("a")}\n`);
  });

  it("mixed line endings: the block follows its begin marker's, the rest is untouched", () => {
    const text = `a\r\nb\n${B("x")}\r\nold\n${E("x")}\nc\r\n`;
    const out = replaceManagedBlock(text, sec("x", "1\n2"));
    expect(out).toBe(`a\r\nb\n${B("x")}\r\n1\r\n2\r\n${E("x")}\nc\r\n`);
  });

  it("keeps a byte-order mark", () => {
    const text = `\uFEFF${B("a")}\nold\n${E("a")}\n`;
    const out = replaceManagedBlock(text, sec("a", "new"));
    expect(out).toBe(`\uFEFF${B("a")}\nnew\n${E("a")}\n`);
  });

  it("does not trim the user's trailing whitespace or blank lines", () => {
    const text = `${B("a")}\nold\n${E("a")}\n  trailing  \n\n\n`;
    expect(replaceManagedBlock(text, sec("a", "new"))).toBe(`${B("a")}\nnew\n${E("a")}\n  trailing  \n\n\n`);
  });
});

describe("replaceManagedBlock — generated content can't break the markers", () => {
  it("escapes body lines that look like markers", () => {
    const text = `${B("a")}\nold\n${E("a")}\nnotes\n`;
    const body = `quote:\n${E("a")}\n  %% vt:begin b %%\nend`;
    const out = replaceManagedBlock(text, sec("a", body));
    expect(contentOf(out, "a")).toBe(`quote:\n\\${E("a")}\n  \\%% vt:begin b %%\nend\n`);
    // The next export still finds exactly one block and the notes survive.
    const again = replaceManagedBlock(out, sec("a", "clean"));
    expect(again).toBe(`${B("a")}\nclean\n${E("a")}\nnotes\n`);
  });

  it("leaves marker-like text inside a line alone", () => {
    const text = `${B("a")}\n${E("a")}\n`;
    const out = replaceManagedBlock(text, sec("a", "use %% vt:end a %% to close"));
    expect(contentOf(out, "a")).toBe("use %% vt:end a %% to close\n");
  });
});

describe("applyManagedBlocks", () => {
  it("replaces present sections and appends missing ones in order", () => {
    const text = `head\n${B("b")}\nold b\n${E("b")}\nuser\n`;
    const out = applyManagedBlocks(text, [sec("a", "A"), sec("b", "B"), sec("c", "C")]);
    expect(out).toBe(`head\n${B("b")}\nB\n${E("b")}\nuser\n\n${B("a")}\nA\n${E("a")}\n\n${B("c")}\nC\n${E("c")}\n`);
  });

  it("is stable when applied repeatedly", () => {
    const sections = [sec("a", "A"), sec("b", "B")];
    const once = applyManagedBlocks("notes", sections);
    expect(applyManagedBlocks(once, sections)).toBe(once);
  });
});

describe("buildManagedFile", () => {
  it("joins head, sections and tail with blank lines", () => {
    const out = buildManagedFile("---\nk: v\n---", [sec("a", "A"), sec("b", "")], "%% notes %%\n");
    expect(out).toBe(`---\nk: v\n---\n\n${B("a")}\nA\n${E("a")}\n\n${B("b")}\n${E("b")}\n\n%% notes %%\n`);
  });

  it("without a tail ends with one newline", () => {
    expect(buildManagedFile("", [sec("a", "A")])).toBe(`${B("a")}\nA\n${E("a")}\n`);
  });

  it("round-trips: updating a freshly built file only touches block contents", () => {
    const built = buildManagedFile("head", [sec("a", "A"), sec("b", "B")], "tail");
    const withNotes = `${built}my notes\n`;
    const out = applyManagedBlocks(withNotes, [sec("a", "A2"), sec("b", "B2")]);
    expect(out).toBe(`head\n\n${B("a")}\nA2\n${E("a")}\n\n${B("b")}\nB2\n${E("b")}\n\ntail\nmy notes\n`);
  });
});

// Many generated documents: user text, blank lines, complete and broken
// marker pairs, LF/CRLF, with or without a trailing newline. Whatever the
// shape, the invariant must hold and a second export must find the block.
describe("replaceManagedBlock — generated documents", () => {
  function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  const pieces = [
    () => "user line",
    () => "",
    () => "  indented user text  ",
    () => "```",
    () => "%% a normal comment %%",
    () => B("a"),
    () => E("a"),
    () => B("b"),
    () => E("b"),
    () => `not a marker ${B("a")}`,
    () => "---",
    () => "中文筆記",
  ];

  it("never changes text outside the block across 2,000 shapes", () => {
    const rand = rng(42);
    for (let i = 0; i < 2000; i++) {
      const n = Math.floor(rand() * 12);
      const lines: string[] = [];
      for (let j = 0; j < n; j++) lines.push(pieces[Math.floor(rand() * pieces.length)]());
      const eol = rand() < 0.3 ? "\r\n" : "\n";
      let text = lines.join(eol);
      if (rand() < 0.5 && text) text += eol;

      const body = rand() < 0.2 ? "" : `generated ${i}\nline two`;
      const out = replaceManagedBlock(text, sec("a", body));
      expectOnlyBlockChanged(text, out, "a");

      const expected = body ? `generated ${i}${eol === "\r\n" ? "\r\n" : "\n"}line two` : "";
      const content = contentOf(out, "a");
      expect(content).not.toBeNull();
      // Content uses the begin line's EOL; compare ignoring that.
      expect(content!.replace(/\r\n/g, "\n")).toBe(expected.replace(/\r\n/g, "\n") + (body ? "\n" : ""));

      // A second export with new content: still only the block changes,
      // and section "b" (if any) is untouched.
      const again = replaceManagedBlock(out, sec("a", "second"));
      expectOnlyBlockChanged(out, again, "a");
      // (Unless the user moved block "a" inside block "b" — then b's
      // content includes a's lines, which is expected.)
      const ra = findManagedBlock(out, "a")!;
      const rb = findManagedBlock(out, "b");
      const nested = rb && ra.contentStart > rb.contentStart && ra.contentStart <= rb.contentEnd;
      if (!nested) expect(contentOf(again, "b")).toBe(contentOf(out, "b"));
      expect(replaceManagedBlock(again, sec("a", "second"))).toBe(again);
    }
  });
});
