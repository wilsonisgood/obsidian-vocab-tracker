import { describe, expect, it } from "vitest";
import { maskSecret, TracingTransport, type HttpTrace } from "../../../src/services/ai/transport/tracing";
import { readAll } from "../../../src/services/ai/transport/types";
import { errorResponse, FakeTransport, response } from "./fakes";

const signal = new AbortController().signal;
const req = {
  url: "https://example.test/v1/chat/completions",
  method: "POST" as const,
  headers: { "content-type": "application/json", authorization: "Bearer sk-abcdefghijklmnop1234" },
  body: '{"model":"m"}',
};

describe("maskSecret", () => {
  it("keeps the Bearer prefix, the ends of the key and its length", () => {
    expect(maskSecret("Bearer sk-abcdefghijklmnop1234")).toBe("Bearer sk-abc…1234 [23]");
  });

  it("hides short secrets entirely", () => {
    expect(maskSecret("short")).toBe("… [5]");
  });
});

describe("TracingTransport", () => {
  it("records the masked request and the full error response", async () => {
    const traces: HttpTrace[] = [];
    const inner = new FakeTransport(() => errorResponse(400, { error: { message: "API key not valid" } }));
    const res = await new TracingTransport(inner, traces).send(req, signal);
    await readAll(res.chunks);

    // The real key still goes out on the wire.
    expect(inner.requests[0].headers.authorization).toBe(req.headers.authorization);
    expect(traces).toHaveLength(1);
    expect(traces[0].request.headers.authorization).toBe("Bearer sk-abc…1234 [23]");
    expect(traces[0].request.body).toBe(req.body);
    expect(traces[0].response?.status).toBe(400);
    expect(traces[0].response?.body).toContain("API key not valid");
  });

  it("captures the body as the consumer reads it, without changing it", async () => {
    const traces: HttpTrace[] = [];
    const inner = new FakeTransport(() => response("data: a\n\ndata: b\n\n", { chunkSize: 3 }));
    const res = await new TracingTransport(inner, traces).send(req, signal);
    expect(await readAll(res.chunks)).toBe("data: a\n\ndata: b\n\n");
    expect(traces[0].response?.body).toBe("data: a\n\ndata: b\n\n");
  });

  it("records the error when no response arrives", async () => {
    const traces: HttpTrace[] = [];
    const inner = new FakeTransport(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(new TracingTransport(inner, traces).send(req, signal)).rejects.toThrow("Failed to fetch");
    expect(traces[0].response).toBeUndefined();
    expect(traces[0].error).toBe("TypeError: Failed to fetch");
  });
});
