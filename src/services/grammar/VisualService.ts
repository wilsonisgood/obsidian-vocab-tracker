import { TypedEmitter } from "../../core/events";
import { topicById } from "../../core/grammar/catalog";
import { builtinVisual, type Visual } from "../../grammar-visual";
import { isAiError } from "../ai/errors";
import { grammarVisual } from "../ai/tasks/grammarVisual";
import type { LearnAi } from "../learn/ports";
import { runStructured } from "../learn/structured";

// 主題頁上的概念版面：先給內建的；按「換一個例句」才問 AI，結果只留在
// 這次開啟期間（不寫檔、不同步），關掉 Obsidian 就回到內建那份。

export interface VisualServiceEvents {
  "visual:change": { topicId: string };
}

export interface VisualServiceDeps {
  ai: LearnAi;
}

export const visualThreadId = (topicId: string): string => `grammar-visual:${topicId}`;

export class VisualService {
  readonly events = new TypedEmitter<VisualServiceEvents>();
  private generated = new Map<string, Visual>();
  // 每個主題看過的例句，下次請 AI 換一個。
  private seen = new Map<string, string[]>();
  private busy = new Set<string>();

  constructor(private deps: VisualServiceDeps) {}

  current(topicId: string): Visual | null {
    return this.generated.get(topicId) ?? builtinVisual(topicId);
  }

  isGenerated(topicId: string): boolean {
    return this.generated.has(topicId);
  }

  isBusy(topicId: string): boolean {
    return this.busy.has(topicId);
  }

  // 回到內建那份。
  reset(topicId: string): void {
    if (this.generated.delete(topicId)) this.events.emit("visual:change", { topicId });
  }

  async regenerate(topicId: string): Promise<Visual> {
    const topic = topicById(topicId);
    if (!topic) throw new Error(`Unknown grammar topic "${topicId}"`);
    if (this.busy.has(topicId)) throw new Error(`Already generating a visual for "${topicId}"`);
    const seen = this.seen.get(topicId) ?? [];
    const now = this.current(topicId);
    if (now && !seen.includes(now.sentence.text)) seen.push(now.sentence.text);
    this.seen.set(topicId, seen);
    this.busy.add(topicId);
    this.events.emit("visual:change", { topicId });
    try {
      const ask = () => runStructured(this.deps.ai, grammarVisual, { topic, avoid: seen }, { threadId: visualThreadId(topicId) });
      let value: Visual;
      try {
        ({ value } = await ask());
      } catch (e) {
        // 回答格式不對（AI 偶爾漏欄位、填錯型別）就自動再問一次；其他錯誤照常丟出。
        if (!isAiError(e) || e.code !== "bad_output") throw e;
        ({ value } = await ask());
      }
      this.generated.set(topicId, value);
      return value;
    } finally {
      this.busy.delete(topicId);
      this.events.emit("visual:change", { topicId });
    }
  }

  stop(topicId: string): void {
    this.deps.ai.cancel(visualThreadId(topicId));
  }
}
