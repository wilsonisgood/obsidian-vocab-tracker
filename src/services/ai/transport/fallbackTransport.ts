import type { DeviceStatePort, NetworkPort, RawHttpRequest } from "../../../core/ports";
import { AiError, isAiError } from "../errors";
import type { AiTransport, TransportResponse } from "./types";

// fetch first (streams); if it fails before any HTTP response arrives — a
// TypeError, which is how browsers report a CORS block — retry the same
// request through requestUrl (規劃書 06 §6.2). Once requestUrl has worked
// for a provider on this device, that's remembered in device-local state so
// later requests skip the doomed fetch. It's only remembered after the
// fallback actually got a response: if both fail the server is simply
// unreachable, and pinning the fallback would lose streaming for nothing.
export class FallbackTransport implements AiTransport {
  constructor(
    private providerId: string,
    private primary: AiTransport,
    private fallback: AiTransport,
    private device: DeviceStatePort,
    private network: NetworkPort
  ) {}

  private get memoryKey(): string {
    return `ai.transport.${this.providerId}`;
  }

  get usesFallback(): boolean {
    return this.device.get(this.memoryKey) === "requestUrl";
  }

  // Called by "測試連線" so a fixed setup (e.g. OLLAMA_ORIGINS now set, or a
  // different base URL) gets streaming back instead of staying pinned.
  resetMemory(): void {
    this.device.set(this.memoryKey, null);
  }

  async send(req: RawHttpRequest, signal: AbortSignal): Promise<TransportResponse> {
    if (!this.network.isOnline()) throw new AiError("offline");

    if (!this.usesFallback) {
      try {
        return await this.primary.send(req, signal);
      } catch (e) {
        if (signal.aborted) throw new AiError("aborted", undefined, { cause: e });
        if (isAiError(e)) throw e;
        if (!(e instanceof TypeError)) throw new AiError("network", String(e), { cause: e });
        if (!this.network.isOnline()) throw new AiError("offline", undefined, { cause: e });
      }
      const res = await this.sendFallback(req, signal);
      this.device.set(this.memoryKey, "requestUrl");
      return res;
    }
    return this.sendFallback(req, signal);
  }

  private async sendFallback(req: RawHttpRequest, signal: AbortSignal): Promise<TransportResponse> {
    try {
      return await this.fallback.send(req, signal);
    } catch (e) {
      if (signal.aborted) throw new AiError("aborted", undefined, { cause: e });
      if (isAiError(e)) throw e;
      if (!this.network.isOnline()) throw new AiError("offline", undefined, { cause: e });
      throw new AiError("network", e instanceof Error ? e.message : String(e), { cause: e });
    }
  }
}
