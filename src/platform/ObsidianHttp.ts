import { Platform, requestUrl } from "obsidian";
import type { HttpPort, HttpResponse } from "../core/ports";

export class ObsidianHttp implements HttpPort {
  encodeQueryParam(text: string): string {
    return Platform.isMobile ? text : encodeURIComponent(text);
  }

  async get(url: string): Promise<HttpResponse> {
    const res = await requestUrl({ url, throw: false });
    return {
      status: res.status,
      get json() {
        return res.json;
      },
    };
  }
}
