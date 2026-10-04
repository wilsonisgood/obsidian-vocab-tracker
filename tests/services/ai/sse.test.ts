import { describe, expect, it } from "vitest";
import { parseSse, SseParser, type SseEvent } from "../../../src/services/ai/transport/sse";
import { chunk, fixture } from "./fakes";

function parseAll(parts: string[]): SseEvent[] {
  const p = new SseParser();
  const out: SseEvent[] = [];
  for (const part of parts) out.push(...p.push(part));
  out.push(...p.end());
  return out;
}

describe("SseParser", () => {
  it("parses event + data pairs", () => {
    expect(parseAll(["event: ping\ndata: {}\n\n"])).toEqual([{ event: "ping", data: "{}" }]);
  });

  it("joins multi-line data with \\n", () => {
    expect(parseAll(["data: line one\ndata: line two\n\n"])).toEqual([{ data: "line one\nline two" }]);
  });

  it("ignores comment / keep-alive lines", () => {
    expect(parseAll([": keep-alive\n\ndata: x\n\n"])).toEqual([{ data: "x" }]);
  });

  it("strips exactly one leading space after the colon", () => {
    expect(parseAll(["data:  two spaces\n\ndata:none\n\n"])).toEqual([{ data: " two spaces" }, { data: "none" }]);
  });

  it("handles CRLF and lone CR line endings", () => {
    expect(parseAll(["data: a\r\n\r\ndata: b\r\rdata: c\n\n"])).toEqual([{ data: "a" }, { data: "b" }, { data: "c" }]);
  });

  it("does not treat a CR at a chunk boundary as an extra blank line", () => {
    expect(parseAll(["data: a\r", "\ndata: b\r", "\n\r", "\n"])).toEqual([{ data: "a\nb" }]);
  });

  it("flushes a final event without a trailing blank line", () => {
    expect(parseAll(["data: last"])).toEqual([{ data: "last" }]);
  });

  it("passes [DONE] through as data", () => {
    expect(parseAll(["data: [DONE]\n\n"])).toEqual([{ data: "[DONE]" }]);
  });

  for (const name of ["anthropic-basic.txt", "openai-basic.txt", "ollama-basic.txt", "anthropic-midstream-error.txt"]) {
    it(`gives identical events for ${name} regardless of chunk boundaries`, () => {
      const text = fixture(name);
      const whole = parseAll([text]);
      expect(whole.length).toBeGreaterThan(2);
      for (const size of [1, 2, 3, 7, 64]) {
        expect(parseAll(chunk(text, size))).toEqual(whole);
      }
      // Same stream with CRLF line endings.
      expect(parseAll(chunk(text.replace(/\n/g, "\r\n"), 5))).toEqual(whole);
    });
  }

  it("parseSse works over an async iterable", async () => {
    async function* gen() {
      yield "data: a\n";
      yield "\ndata: b\n\n";
    }
    const out: SseEvent[] = [];
    for await (const ev of parseSse(gen())) out.push(ev);
    expect(out).toEqual([{ data: "a" }, { data: "b" }]);
  });
});
