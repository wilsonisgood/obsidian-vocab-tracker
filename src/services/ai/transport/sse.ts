// Incremental Server-Sent Events parser (WHATWG "event stream" rules) shared
// by both providers and both transports: fetch hands it chunks as they
// arrive, requestUrl hands it the whole body as a single chunk — same code
// path either way.
//
// Handles what real streams actually do: events split at arbitrary byte
// boundaries (even mid-"data:"), CRLF / CR / LF line endings, multi-line
// `data:` fields, `:` comment/keep-alive lines, and a final event with no
// trailing blank line. `[DONE]` is passed through as ordinary data; the
// OpenAI provider is the one that knows it means "stop".

export interface SseEvent {
  event?: string;
  data: string;
  id?: string;
}

export class SseParser {
  private buffer = "";
  private dataLines: string[] = [];
  private eventName: string | undefined;
  private id: string | undefined;
  // A chunk ending in "\r" might be the first half of "\r\n"; hold it back.
  private pendingCR = false;

  push(chunk: string): SseEvent[] {
    let text = chunk;
    if (this.pendingCR) {
      if (text.startsWith("\n")) text = text.slice(1);
      this.pendingCR = false;
    }
    this.buffer += text;

    const out: SseEvent[] = [];
    for (;;) {
      const m = /\r\n|\r|\n/.exec(this.buffer);
      if (!m) break;
      // A lone trailing "\r" could still become "\r\n" — wait for more.
      if (m[0] === "\r" && m.index === this.buffer.length - 1) {
        this.pendingCR = true;
        const line = this.buffer.slice(0, m.index);
        this.buffer = "";
        this.handleLine(line, out);
        break;
      }
      const line = this.buffer.slice(0, m.index);
      this.buffer = this.buffer.slice(m.index + m[0].length);
      this.handleLine(line, out);
    }
    return out;
  }

  // Flushes a final event that wasn't followed by a blank line (common when
  // a non-streaming transport hands over a truncated body).
  end(): SseEvent[] {
    const out: SseEvent[] = [];
    if (this.buffer) {
      this.handleLine(this.buffer, out);
      this.buffer = "";
    }
    this.dispatch(out);
    return out;
  }

  private handleLine(line: string, out: SseEvent[]): void {
    if (line === "") {
      this.dispatch(out);
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.dataLines.push(value);
    else if (field === "event") this.eventName = value;
    else if (field === "id") this.id = value;
  }

  private dispatch(out: SseEvent[]): void {
    if (this.dataLines.length > 0) {
      const ev: SseEvent = { data: this.dataLines.join("\n") };
      if (this.eventName) ev.event = this.eventName;
      if (this.id !== undefined) ev.id = this.id;
      out.push(ev);
    }
    this.dataLines = [];
    this.eventName = undefined;
  }
}

export async function* parseSse(chunks: AsyncIterable<string>): AsyncGenerator<SseEvent> {
  const parser = new SseParser();
  for await (const chunk of chunks) {
    for (const ev of parser.push(chunk)) yield ev;
  }
  for (const ev of parser.end()) yield ev;
}
