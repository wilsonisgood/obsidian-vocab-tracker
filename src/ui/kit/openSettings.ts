import type { App } from "obsidian";

// Opens Settings on this plugin's tab (D6 「開啟設定」). app.setting isn't in
// the public typings, so every step is guarded — worst case nothing opens.
export function openPluginSettings(app: App, pluginId: string): void {
  const setting = (app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
  setting?.open?.();
  setting?.openTabById?.(pluginId);
}
