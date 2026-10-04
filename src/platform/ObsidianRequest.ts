import { requestUrl } from "obsidian";
import type { RawHttpRequest, RequestPort } from "../core/ports";

// Non-streaming, CORS-free HTTP for the AI fallback path. `throw: false` so
// 4xx/5xx come back as responses the provider can classify (auth, 429…);
// only genuine network failures reject.
export class ObsidianRequest implements RequestPort {
  async request(req: RawHttpRequest) {
    const res = await requestUrl({
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: req.body,
      contentType: req.headers["content-type"],
      throw: false,
    });
    return { status: res.status, headers: res.headers ?? {}, text: res.text };
  }
}
