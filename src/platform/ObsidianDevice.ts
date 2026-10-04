import type { App } from "obsidian";
import type { DeviceStatePort, NetworkPort, SecretPort } from "../core/ports";

// Device-local adapters for the AI service. None of these write into the
// vault, so nothing here travels with sync.

const LS_PREFIX = "vocab-tracker:";

export class ObsidianDeviceState implements DeviceStatePort {
  constructor(private app: App) {}

  // app.loadLocalStorage/saveLocalStorage (1.8.7+) scope keys per vault;
  // older apps fall back to plain localStorage with a plugin prefix.
  get(key: string): string | null {
    if (typeof this.app.loadLocalStorage === "function") {
      const v: unknown = this.app.loadLocalStorage(LS_PREFIX + key);
      return typeof v === "string" ? v : null;
    }
    try {
      return window.localStorage.getItem(LS_PREFIX + key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string | null): void {
    if (typeof this.app.saveLocalStorage === "function") {
      this.app.saveLocalStorage(LS_PREFIX + key, value);
      return;
    }
    try {
      if (value === null) window.localStorage.removeItem(LS_PREFIX + key);
      else window.localStorage.setItem(LS_PREFIX + key, value);
    } catch {
      // storage unavailable (private mode etc.) — state just isn't remembered
    }
  }
}

// Obsidian SecretStorage (1.11.4+); unavailable on older apps, where API
// keys stay in plugin settings (services/ai/keys.ts).
export class ObsidianSecrets implements SecretPort {
  constructor(private app: App) {}

  get available(): boolean {
    const s = (this.app as Partial<App>).secretStorage;
    return !!s && typeof s.getSecret === "function";
  }

  get(id: string): string | null {
    return this.available ? this.app.secretStorage.getSecret(id) : null;
  }

  set(id: string, value: string): void {
    if (this.available) this.app.secretStorage.setSecret(id, value);
  }
}

export class BrowserNetwork implements NetworkPort {
  isOnline(): boolean {
    // navigator.onLine only reliably reports "definitely offline"; a true
    // value can still mean a captive portal — request errors cover that.
    return typeof navigator === "undefined" ? true : navigator.onLine !== false;
  }
}
