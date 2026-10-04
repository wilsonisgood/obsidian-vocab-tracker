import { describe, expect, it } from "vitest";
import { withSettingsDefaults, type ResolvedSettings } from "../../../src/core/model/settings";
import { ApiKeys } from "../../../src/services/ai/keys";
import { MemorySecrets } from "./fakes";

function setup(secretsAvailable: boolean) {
  const settings: ResolvedSettings = withSettingsDefaults({ schemaVersion: 2 });
  const secrets = new MemorySecrets(secretsAvailable);
  const keys = new ApiKeys(secrets, () => settings, async (m) => m(settings));
  return { settings, secrets, keys };
}

describe("ApiKeys", () => {
  it("stores keys in SecretStorage when available, never in settings", async () => {
    const { settings, secrets, keys } = setup(true);
    await keys.set("anthropic", "  sk-ant-1  ");
    expect(secrets.get("vocab-tracker-anthropic")).toBe("sk-ant-1");
    expect(settings.ai.providers.anthropic.apiKey).toBe("");
    expect(keys.get("anthropic")).toBe("sk-ant-1");
  });

  it("moves a legacy plaintext key out of settings", async () => {
    const { settings, keys } = setup(true);
    settings.ai.providers.anthropic.apiKey = "old";
    expect(keys.get("anthropic")).toBe("old");
    await keys.set("anthropic", "new");
    expect(settings.ai.providers.anthropic.apiKey).toBe("");
    expect(keys.get("anthropic")).toBe("new");
  });

  it("falls back to settings on Obsidian versions without SecretStorage", async () => {
    const { settings, secrets, keys } = setup(false);
    await keys.set("openai-compatible", "sk-o");
    expect(settings.ai.providers["openai-compatible"].apiKey).toBe("sk-o");
    expect(secrets.map.size).toBe(0);
    expect(keys.get("openai-compatible")).toBe("sk-o");
  });
});
