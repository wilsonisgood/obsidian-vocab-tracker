import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeParagraph, PARAGRAPH_HASH_LENGTH, paragraphHash, sha1 } from "../../../src/core/text/hash";

const nodeSha1 = (s: string) => createHash("sha1").update(s, "utf8").digest("hex");

describe("sha1", () => {
  it("matches the FIPS 180 test vectors", () => {
    expect(sha1("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(sha1("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(sha1("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "84983e441c3bd26ebaae4aa1f95129e5e54670f1"
    );
  });

  it("matches node:crypto across padding boundaries", () => {
    for (let n = 0; n <= 200; n++) {
      const s = "x".repeat(n);
      expect(sha1(s), `length ${n}`).toBe(nodeSha1(s));
    }
  });

  it("hashes the UTF-8 bytes (CJK, emoji, combining marks)", () => {
    for (const s of ["閃亮的", "café", "café", "🎤 glittery ✨", "¶12 — “quoted”", "a".repeat(1000) + "中"]) {
      expect(sha1(s)).toBe(nodeSha1(s));
    }
  });

  it("replaces lone surrogates like TextEncoder does", () => {
    expect(sha1("a\ud800b")).toBe(sha1("a�b"));
    expect(sha1("\udc00")).toBe(sha1("�"));
  });
});

describe("normalizeParagraph / paragraphHash", () => {
  const P = "Last time I was in a stadium this size, I was wearing a glittery leotard.";

  it("ignores highlight marks, a trailing block id, whitespace and line endings", () => {
    const variants = [
      P,
      "Last time I was in a stadium this size, I was wearing a ==glittery== leotard.",
      `${P} ^vt-abc123`,
      `${P} ^my-own-id  `,
      "Last time I was in a stadium this size,\r\nI was wearing a glittery leotard.",
      `  Last time I was   in a stadium this size,\nI was wearing a glittery leotard.\n`,
    ];
    for (const v of variants) expect(paragraphHash(v), JSON.stringify(v)).toBe(paragraphHash(P));
  });

  it("is 12 hex characters of sha1(normalize(text))", () => {
    const h = paragraphHash(P);
    expect(h).toHaveLength(PARAGRAPH_HASH_LENGTH);
    expect(h).toBe(nodeSha1(normalizeParagraph(P)).slice(0, 12));
  });

  it("changes when the words change", () => {
    expect(paragraphHash(P.replace("glittery", "sparkly"))).not.toBe(paragraphHash(P));
    expect(paragraphHash(P.toUpperCase())).not.toBe(paragraphHash(P));
  });

  it("composes Unicode (NFC) so precomposed and combining forms agree", () => {
    expect(normalizeParagraph("café")).toBe("café");
  });

  it("keeps a caret that isn't a block id", () => {
    expect(normalizeParagraph("2^10 is 1024")).toBe("2^10 is 1024");
    expect(normalizeParagraph("x ^ y")).toBe("x ^ y");
  });
});
