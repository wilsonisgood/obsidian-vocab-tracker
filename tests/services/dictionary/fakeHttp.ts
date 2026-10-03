import type { HttpPort, HttpResponse } from "../../../src/core/ports";

export class FakeHttpPort implements HttpPort {
  constructor(private router: (url: string) => HttpResponse | Promise<HttpResponse>) {}

  encodeQueryParam(text: string): string {
    return encodeURIComponent(text);
  }

  async get(url: string): Promise<HttpResponse> {
    return this.router(url);
  }
}

export function jsonResponse(status: number, json: unknown): HttpResponse {
  return {
    status,
    get json() {
      return json;
    },
  };
}

export function throwingResponse(message: string): HttpResponse {
  return {
    status: 200,
    get json(): unknown {
      throw new Error(message);
    },
  };
}
