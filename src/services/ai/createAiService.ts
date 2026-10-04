import type {
  DeviceStatePort,
  FetchPort,
  NetworkPort,
  RequestPort,
  SecretPort,
  StoragePort,
} from "../../core/ports";
import type { VocabStore } from "../../core/store/VocabStore";
import { AiService } from "./AiService";
import { ApiKeys } from "./keys";
import { UsageTracker } from "./usage";

export interface AiPorts {
  storage: StoragePort;
  fetch: FetchPort;
  request: RequestPort;
  device: DeviceStatePort;
  secrets: SecretPort;
  network: NetworkPort;
}

// Random per-device id for usage bucketing (services/ai/usage.ts). Lives in
// device-local state, so each device keeps its own id across restarts.
function deviceId(device: DeviceStatePort): () => string {
  return () => {
    let id = device.get("ai.deviceId");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      device.set("ai.deviceId", id);
    }
    return id;
  };
}

// Wiring kept out of main.ts so the composition root stays a few lines.
export function createAiService(store: VocabStore, ports: AiPorts): { ai: AiService; keys: ApiKeys } {
  const keys = new ApiKeys(ports.secrets, () => store.settings, (m) => store.updateSettings(m));
  const ai = new AiService({
    settings: () => store.settings,
    keys,
    usage: new UsageTracker(ports.storage, deviceId(ports.device)),
    fetch: ports.fetch,
    request: ports.request,
    device: ports.device,
    network: ports.network,
  });
  return { ai, keys };
}
