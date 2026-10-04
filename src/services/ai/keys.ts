import type { ProviderId, ResolvedSettings } from "../../core/model/settings";
import type { SecretPort } from "../../core/ports";

// Where API keys live (規劃書 06 §6.6). On Obsidian 1.11.4+ keys go into the
// app's SecretStorage, so they are never written to data.json (and so never
// ride along with vault sync or a shared plugin folder). Older apps fall
// back to the plugin settings, which the settings page discloses.
export class ApiKeys {
  constructor(
    private secrets: SecretPort,
    private settings: () => ResolvedSettings,
    private updateSettings: (mutate: (s: ResolvedSettings) => void) => Promise<void>
  ) {}

  static secretId(provider: ProviderId): string {
    // SecretStorage IDs: lowercase alphanumerics and dashes only.
    return `vocab-tracker-${provider}`;
  }

  get usesSecretStorage(): boolean {
    return this.secrets.available;
  }

  get(provider: ProviderId): string {
    if (this.secrets.available) {
      const secret = this.secrets.get(ApiKeys.secretId(provider));
      if (secret) return secret;
    }
    // Also covers a key saved before upgrading Obsidian to a version with
    // SecretStorage — it keeps working until the user re-enters it.
    return this.settings().ai.providers[provider].apiKey;
  }

  async set(provider: ProviderId, key: string): Promise<void> {
    const trimmed = key.trim();
    if (this.secrets.available) {
      this.secrets.set(ApiKeys.secretId(provider), trimmed);
      // Move any legacy plaintext copy out of data.json.
      if (this.settings().ai.providers[provider].apiKey) {
        await this.updateSettings((s) => {
          s.ai.providers[provider].apiKey = "";
        });
      }
      return;
    }
    await this.updateSettings((s) => {
      s.ai.providers[provider].apiKey = trimmed;
    });
  }
}
