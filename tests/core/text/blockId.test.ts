import { describe, expect, it } from "vitest";
import {
  blockIdsIn,
  findBlockLine,
  newBlockId,
  trailingBlockId,
  VT_BLOCK_ID_RE,
  withBlockId,
} from "../../../src/core/text/blockId";

describe("trailingBlockId", () => {
  it("reads the id at the end of a line or block", () => {
    expect(trailingBlockId("Some text. ^vt-abc123")).toBe("vt-abc123");
    expect(trailingBlockId("Some text. ^My-Id-2  ")).toBe("My-Id-2");
    expect(trailingBlockId("line one\nline two ^x1\n")).toBe("x1");
    expect(trailingBlockId("^alone")).toBe("alone");
    expect(trailingBlockId("- item ^li\r")).toBe("li");
  });

  it("ignores carets that aren't block ids", () => {
    expect(trailingBlockId("2^10")).toBeNull();
    expect(trailingBlockId("a ^b c")).toBeNull();
    expect(trailingBlockId("a ^under_score")).toBeNull();
    expect(trailingBlockId("plain")).toBeNull();
  });
});

describe("blockIdsIn / findBlockLine", () => {
  const NOTE = "# T\n\nFirst. ^one\n\n- a\n- b ^two\n\nNo id here.";
  it("lists every block id and finds its line", () => {
    expect([...blockIdsIn(NOTE)]).toEqual(["one", "two"]);
    expect(findBlockLine(NOTE, "two")).toBe(5);
    expect(findBlockLine(NOTE, "three")).toBe(-1);
  });
});

describe("newBlockId", () => {
  it("is vt- plus 6 base36 characters", () => {
    for (let i = 0; i < 50; i++) expect(newBlockId(() => false)).toMatch(VT_BLOCK_ID_RE);
  });

  it("is deterministic for a given random source, and retries taken ids", () => {
    const seq = [0, 0, 0, 0, 0, 0, 0.999, 0.5, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const random = () => seq[i++ % seq.length];
    expect(newBlockId((id) => id === "vt-000000", random)).toBe("vt-ziiiii");
  });

  it("gives up when every candidate is taken", () => {
    expect(() => newBlockId(() => true, () => 0, 5)).toThrow();
  });
});

describe("withBlockId", () => {
  it("appends to the given line only", () => {
    expect(withBlockId("a\nb\nc", 1, "vt-aaaaaa")).toBe("a\nb ^vt-aaaaaa\nc");
  });

  it("drops trailing spaces and keeps CRLF line endings", () => {
    expect(withBlockId("a  \r\nb\r\n", 0, "x")).toBe("a ^x\r\nb\r\n");
  });

  it("rejects a line outside the note", () => {
    expect(() => withBlockId("a", 3, "x")).toThrow(RangeError);
  });
});
