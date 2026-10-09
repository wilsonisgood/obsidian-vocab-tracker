// (1009 #16) 極簡 CDP client —— 只用 Node 24 內建的 WebSocket／fetch，不加依賴
// （設計決定 7）。只做我們需要的三件事：Runtime.evaluate（操作 app）、
// Page.captureScreenshot（截圖）、Input.*（在 textarea 裡模擬打字）。
export interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export async function listTargets(port: number): Promise<CdpTarget[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json`);
  if (!res.ok) throw new Error(`CDP /json 回了 ${res.status}`);
  return (await res.json()) as CdpTarget[];
}

// Obsidian 啟動初期可能還沒掛出 page target，輪詢等它出現。
export async function waitForPageTarget(
  port: number,
  timeoutMs = 20000
): Promise<CdpTarget> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const targets = await listTargets(port);
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`等不到 CDP page target（port ${port}）：${String(lastErr)}`);
}

interface PendingEntry {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export class CdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingEntry>();
  private ready: Promise<void>;

  constructor(private wsUrl: string) {
    this.ready = new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", (ev) => reject(ev));
      ws.addEventListener("message", (ev) => this.onMessage(ev.data as string));
    });
  }

  private onMessage(raw: string) {
    let msg: { id?: number; result?: unknown; error?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg.id !== "number") return; // 事件通知，我們不需要
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
    else entry.resolve(msg.result);
  }

  async connect(): Promise<void> {
    await this.ready;
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.ws) throw new Error("CDP client 還沒 connect()");
    const id = this.nextId++;
    const ws = this.ws;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // 在 page 的 default execution context 跑一段 JS。expression 應該是一個會自己
  // return 值的 IIFE 或 async IIFE；回傳值用 JSON 安全的型別（字串／數字／布林／
  // plain object／array），CDP returnByValue 對 Map／DOM node 等複雜型別序列化
  // 不可靠。拋例外時把 exceptionDetails 轉成 Error。
  async evaluate<T = unknown>(expression: string, retries = 3): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await this.send<{
          result: { value?: T };
          exceptionDetails?: { exception?: { description?: string }; text?: string };
        }>("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.exceptionDetails) {
          const desc =
            result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
          throw new Error(`Runtime.evaluate 拋例外: ${desc}`);
        }
        return result.result.value as T;
      } catch (err) {
        // Obsidian 啟動初期這個 page target 會 navigate/reload 一次，剛好在這段
        // 時間送出的 Runtime.evaluate 會因為舊的 execution context 被丟掉而失敗
        // ——不是我們的程式邏輯錯，retry 幾次通常就過去了。
        const msg = String(err);
        if (attempt < retries && msg.includes("Execution context was destroyed")) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw err;
      }
    }
  }

  async screenshot(filePath: string): Promise<void> {
    const { data } = await this.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
    });
    const fs = await import("node:fs");
    fs.writeFileSync(filePath, Buffer.from(data, "base64"));
  }

  // 聚焦到某個 selector 的元素，再用 Input.insertText 打字（比逐字 dispatchKeyEvent
  // 可靠，且不用猜 keyCode；#4 的重現同時也用 dispatchKeyEvent 驗證 keydown 監聽器
  // 有沒有被呼叫到）。
  async focus(selector: string): Promise<void> {
    await this.evaluate(
      `(function(){ const el = document.querySelector(${JSON.stringify(selector)}); if(!el) throw new Error("selector not found: ${selector}"); el.focus(); return true; })()`
    );
  }

  async insertText(text: string): Promise<void> {
    await this.send("Input.insertText", { text });
  }

  async dispatchKeyEvent(params: Record<string, unknown>): Promise<void> {
    await this.send("Input.dispatchKeyEvent", params);
  }

  close(): void {
    this.ws?.close();
  }
}

export async function connectToPage(port: number): Promise<CdpClient> {
  const target = await waitForPageTarget(port);
  const client = new CdpClient(target.webSocketDebuggerUrl!);
  await client.connect();
  return client;
}
