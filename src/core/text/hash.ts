// Paragraph fingerprints for hash-mode anchors (規劃書 06 §5.1):
// hash = sha1(normalize(text)).slice(0, 12).
//
// SHA-1 is implemented here in plain TypeScript rather than taken from a
// port: core/** can't import node:crypto or obsidian, and WebCrypto's
// crypto.subtle.digest is async — the reading-mode post-processor looks
// paragraph hashes up synchronously (§9.5), so an async digest would force
// every badge render through a promise. Paragraphs are short, so a
// synchronous pure-TS digest is cheap and gives identical output on
// desktop, iOS and in vitest.

export const PARAGRAPH_HASH_LENGTH = 12;

// UTF-8 bytes of a JS string; a lone surrogate becomes U+FFFD, matching
// TextEncoder.
function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      } else {
        c = 0xfffd;
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      c = 0xfffd;
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

// SHA-1 (FIPS 180-4) of the UTF-8 encoding of `text`, as 40 hex digits.
export function sha1(text: string): string {
  const bytes = utf8Bytes(text);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  for (let s = 24; s >= 0; s -= 8) bytes.push((hi >>> s) & 0xff);
  for (let s = 24; s >= 0; s -= 8) bytes.push((bitLen >>> s) & 0xff);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Int32Array(80);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
}

// What a paragraph "says", independent of edits that don't change the
// text the reader sees: this plugin's ==highlight== marks (added whenever
// a word is captured), a trailing ^block-id (added by block-mode anchors
// or the user), line endings, Unicode composition and runs of whitespace.
export function normalizeParagraph(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/(^|\s)\^[A-Za-z0-9-]+\s*$/, "")
    .replace(/==([^=\n]+)==/g, "$1")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

export function paragraphHash(text: string): string {
  return sha1(normalizeParagraph(text)).slice(0, PARAGRAPH_HASH_LENGTH);
}
