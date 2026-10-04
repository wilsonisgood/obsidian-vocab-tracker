import type { App } from "obsidian";
import type { StoragePort } from "../core/ports";
import type { AiPorts } from "../services/ai/createAiService";
import { BrowserFetch } from "./BrowserFetch";
import { BrowserNetwork, ObsidianDeviceState, ObsidianSecrets } from "./ObsidianDevice";
import { ObsidianRequest } from "./ObsidianRequest";

// Obsidian implementations of every port the AI service needs.
export function createAiPorts(app: App, storage: StoragePort): AiPorts {
  return {
    storage,
    fetch: new BrowserFetch(),
    request: new ObsidianRequest(),
    device: new ObsidianDeviceState(app),
    secrets: new ObsidianSecrets(app),
    network: new BrowserNetwork(),
  };
}
