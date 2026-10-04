import { describe, expect, it } from "vitest";
import { UsageTracker, weightedTokens } from "../../../src/services/ai/usage";
import { MemoryStorage } from "./fakes";

const u = (input: number, output: number, cacheRead = 0, cacheWrite = 0) => ({ input, output, cacheRead, cacheWrite });

describe("UsageTracker", () => {
  it("records per local day and sums the month across devices", async () => {
    const storage = new MemoryStorage();
    let now = new Date(2026, 9, 3, 23, 50);
    const mac = new UsageTracker(storage, () => "mac", () => now);
    const phone = new UsageTracker(storage, () => "phone", () => now);

    await mac.record(u(100, 50));
    await phone.record(u(10, 5, 1000));
    now = new Date(2026, 9, 4, 0, 10);
    await mac.record(u(1, 1));

    const s = await mac.summary();
    expect(s.today).toEqual({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0, requests: 1 });
    expect(s.month).toEqual({ input: 111, output: 56, cacheRead: 1000, cacheWrite: 0, requests: 3 });
    expect(s.monthWeighted).toBe(111 + 56 + 100);
    expect(Object.keys((storage.shards.get("usage") as { devices: object }).devices)).toEqual(["mac", "phone"]);
  });

  it("doesn't lose records when two finish at once", async () => {
    const storage = new MemoryStorage();
    const t = new UsageTracker(storage, () => "d", () => new Date(2026, 0, 1));
    await Promise.all([t.record(u(1, 1)), t.record(u(2, 2)), t.record(u(3, 3))]);
    expect((await t.summary()).today.requests).toBe(3);
  });

  it("ignores last month in the monthly total", async () => {
    const storage = new MemoryStorage();
    let now = new Date(2026, 8, 30);
    const t = new UsageTracker(storage, () => "d", () => now);
    await t.record(u(500, 500));
    now = new Date(2026, 9, 1);
    expect((await t.summary()).monthWeighted).toBe(0);
  });

  it("throws budget once the weighted month total reaches the limit", async () => {
    const storage = new MemoryStorage();
    const t = new UsageTracker(storage, () => "d", () => new Date(2026, 9, 4));
    await t.assertWithinBudget(100);
    await t.record(u(60, 40));
    await expect(t.assertWithinBudget(100)).rejects.toMatchObject({ code: "budget" });
    await expect(t.assertWithinBudget(0)).resolves.toBeUndefined();
  });

  it("weights cache reads at 1/10", () => {
    expect(weightedTokens({ input: 10, output: 20, cacheRead: 30_000, cacheWrite: 5 })).toBe(3035);
  });

  it("recovers from a corrupt shard", async () => {
    const storage = new MemoryStorage();
    storage.shards.set("usage", { nonsense: true });
    const t = new UsageTracker(storage, () => "d", () => new Date(2026, 0, 1));
    await t.record(u(1, 1));
    expect((await t.summary()).today.requests).toBe(1);
  });
});
