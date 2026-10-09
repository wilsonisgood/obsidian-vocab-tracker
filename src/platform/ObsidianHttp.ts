import { Platform, requestUrl } from "obsidian";
import type { HttpPort, HttpResponse } from "../core/ports";

// requestUrl has no timeout of its own: a stalled dictionary/translate
// source would otherwise hold its caller (and any fallback after it) for as
// long as the OS lets the request hang. The request itself can't be
// aborted; we just stop waiting, and callers treat it like any failure.
export const HTTP_TIMEOUT_MS = 8000;

export class ObsidianHttp implements HttpPort {
  encodeQueryParam(text: string): string {
    return Platform.isMobile ? text : encodeURIComponent(text);
  }

  async get(url: string): Promise<HttpResponse> {
    const res = await withTimeout(requestUrl({ url, throw: false }), HTTP_TIMEOUT_MS);
    return {
      status: res.status,
      get json() {
        return res.json;
      },
    };
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
