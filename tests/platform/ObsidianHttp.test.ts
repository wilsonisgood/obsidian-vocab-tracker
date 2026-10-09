import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestUrl = vi.fn();
vi.mock("obsidian", () => ({ Platform: { isMobile: false }, requestUrl: (o: unknown) => requestUrl(o) }));

import { HTTP_TIMEOUT_MS, ObsidianHttp } from "../../src/platform/ObsidianHttp";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  requestUrl.mockReset();
});

describe("ObsidianHttp.get", () => {
  it("returns the response when it comes in time", async () => {
    requestUrl.mockResolvedValue({ status: 200, json: { ok: true } });
    const res = await new ObsidianHttp().get("https://example.com");
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
  });

  it("gives up on a request that hangs, so the caller can fall back", async () => {
    requestUrl.mockReturnValue(new Promise(() => {}));
    const got = new ObsidianHttp().get("https://example.com");
    const check = expect(got).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(HTTP_TIMEOUT_MS);
    await check;
  });
});
