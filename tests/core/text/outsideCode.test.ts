import { describe, expect, it } from "vitest";
import { replaceOutsideCode, wrapOutsideCode } from "../../../src/core/text/outsideCode";

describe("replaceOutsideCode", () => {
  it("replaces matches outside inline code spans", () => {
    const out = replaceOutsideCode("foo bar foo", /foo/g, "X");
    expect(out).toBe("X bar X");
  });

  it("leaves inline code spans untouched", () => {
    const out = replaceOutsideCode("foo `foo` foo", /foo/g, "X");
    expect(out).toBe("X `foo` X");
  });

  it("leaves fenced code blocks untouched", () => {
    const content = ["foo", "```", "foo", "```", "foo"].join("\n");
    const out = replaceOutsideCode(content, /foo/g, "X");
    expect(out).toBe(["X", "```", "foo", "```", "X"].join("\n"));
  });

  it("treats ~~~ as a fence too", () => {
    const content = ["foo", "~~~", "foo", "~~~", "foo"].join("\n");
    const out = replaceOutsideCode(content, /foo/g, "X");
    expect(out).toBe(["X", "~~~", "foo", "~~~", "X"].join("\n"));
  });
});

describe("wrapOutsideCode", () => {
  it("wraps matches in == highlight == markers", () => {
    expect(wrapOutsideCode("a cat sat", /cat/g)).toBe("a ==cat== sat");
  });
});
