import { describe, expect, it } from "vitest";
import type { RawHttpRequest } from "../../../src/core/ports";
import { FallbackTransport } from "../../../src/services/ai/transport/fallbackTransport";
import { RequestUrlTransport } from "../../../src/services/ai/transport/requestUrlTransport";
import { readAll, type AiTransport, type TransportResponse } from "../../../src/services/ai/transport/types";
import { FakeNetwork, MemoryDevice, response } from "./fakes";

const REQ: RawHttpRequest = { url: "http://x/v1/chat/completions", method: "POST", headers: {} };

class ScriptedTransport implements AiTransport {
  calls = 0;
  constructor(private impl: () => Promise<TransportResponse>) {}
  send(): Promise<TransportResponse> {
    this.calls++;
    return this.impl();
  }
}

const ok = (mode: "fetch" | "requestUrl") => new ScriptedTransport(async () => response("data: x\n\n", { mode }));
const corsFail = () => new ScriptedTransport(async () => Promise.reject(new TypeError("Failed to fetch")));

function setup(primary: ScriptedTransport, fallback: ScriptedTransport) {
  const device = new MemoryDevice();
  const network = new FakeNetwork();
  const t = new FallbackTransport("openai-compatible", primary, fallback, device, network);
  return { t, device, network };
}

describe("FallbackTransport", () => {
  it("uses fetch when it works and remembers nothing", async () => {
    const primary = ok("fetch");
    const fallback = ok("requestUrl");
    const { t, device } = setup(primary, fallback);
    const res = await t.send(REQ, new AbortController().signal);
    expect(res.mode).toBe("fetch");
    expect(fallback.calls).toBe(0);
    expect(device.map.size).toBe(0);
  });

  it("falls back on TypeError (CORS) and remembers it per provider", async () => {
    const primary = corsFail();
    const fallback = ok("requestUrl");
    const { t, device } = setup(primary, fallback);

    const first = await t.send(REQ, new AbortController().signal);
    expect(first.mode).toBe("requestUrl");
    expect(device.get("ai.transport.openai-compatible")).toBe("requestUrl");
    expect(t.usesFallback).toBe(true);

    // Second request skips fetch entirely.
    await t.send(REQ, new AbortController().signal);
    expect(primary.calls).toBe(1);
    expect(fallback.calls).toBe(2);
  });

  it("does not remember the fallback when it fails too (server unreachable)", async () => {
    const fallback = new ScriptedTransport(async () => Promise.reject(new Error("net::ERR_CONNECTION_REFUSED")));
    const { t, device } = setup(corsFail(), fallback);
    const err = await t.send(REQ, new AbortController().signal).catch((e) => e);
    expect(err.code).toBe("network");
    expect(device.map.size).toBe(0);
  });

  it("does not fall back on non-network errors", async () => {
    const primary = new ScriptedTransport(async () => Promise.reject(new SyntaxError("bad")));
    const fallback = ok("requestUrl");
    const { t } = setup(primary, fallback);
    const err = await t.send(REQ, new AbortController().signal).catch((e) => e);
    expect(err.code).toBe("network");
    expect(fallback.calls).toBe(0);
  });

  it("reports offline without sending anything", async () => {
    const primary = ok("fetch");
    const { t, network } = setup(primary, ok("requestUrl"));
    network.online = false;
    const err = await t.send(REQ, new AbortController().signal).catch((e) => e);
    expect(err.code).toBe("offline");
    expect(primary.calls).toBe(0);
  });

  it("maps an abort during fetch to aborted, not a fallback", async () => {
    const ctrl = new AbortController();
    const primary = new ScriptedTransport(async () => {
      ctrl.abort();
      throw new TypeError("The user aborted a request.");
    });
    const fallback = ok("requestUrl");
    const { t } = setup(primary, fallback);
    const err = await t.send(REQ, ctrl.signal).catch((e) => e);
    expect(err.code).toBe("aborted");
    expect(fallback.calls).toBe(0);
  });

  it("resetMemory brings streaming back", async () => {
    const { t, device } = setup(ok("fetch"), ok("requestUrl"));
    device.set("ai.transport.openai-compatible", "requestUrl");
    t.resetMemory();
    expect((await t.send(REQ, new AbortController().signal)).mode).toBe("fetch");
  });
});

describe("RequestUrlTransport", () => {
  it("returns the buffered body as one chunk with case-insensitive headers", async () => {
    const t = new RequestUrlTransport({
      request: async () => ({ status: 200, headers: { "Content-Type": "text/event-stream" }, text: "data: 1\n\n" }),
    });
    const res = await t.send(REQ, new AbortController().signal);
    expect(res.header("content-type")).toBe("text/event-stream");
    expect(await readAll(res.chunks)).toBe("data: 1\n\n");
    expect(res.mode).toBe("requestUrl");
  });

  it("rejects immediately on abort even though requestUrl can't be cancelled", async () => {
    const ctrl = new AbortController();
    const t = new RequestUrlTransport({ request: () => new Promise(() => undefined) });
    const pending = t.send(REQ, ctrl.signal);
    ctrl.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });
});
