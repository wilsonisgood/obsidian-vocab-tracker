import type { VocabEntry } from "../../core/model/entry";
import { TypedEmitter } from "../../core/events";

// 規劃書 10 §2.1：字族樹／Word DNA 頁面 ↔ 側欄「本篇」的匯流排（1007-2 #8 #10
// #13 #14）。blocks publish、sidebar 讀；兩邊都只 import 這個檔案。

export type PageKind = "families" | "dna";

export interface PageWord {
  word: string;
  zh: string;
  emoji: string;
  // 單字庫裡有（不論有沒有 like）；undefined＝還沒加入的建議字。
  entryId?: string;
  // 只有 DNA：這個字是因為哪個字素被放進這一類（側欄小標籤，#13）。
  morpheme?: { id: string; label: string };
}

export interface PageGroup {
  // families: `family:<familyId>`；dna: `dna:prefix` | `dna:root` | `dna:suffix`
  key: string;
  title: string;
  words: PageWord[]; // 頁面上的順序；分層、去重由側欄做
}

export interface PageContext {
  kind: PageKind;
  sourcePath: string; // 入口檔路徑（字族樹.md／Word DNA.md）
  groups: PageGroup[];
  activeGroupKey: string | null;
  // 頁面 → 側欄（1009 #8）：要側欄捲到並閃一下的字（小寫）。點星系的建議字節點時帶上。
  focusWord?: string;
  // 側欄 → 頁面（#14）：點了某一類裡單字庫有的字。
  selectWord(groupKey: string, word: PageWord): void;
  // 側欄灰色建議字的 ♡（#8、1009 #6）：加入並 like，回傳新的 entry。
  addWord(groupKey: string, word: PageWord): Promise<VocabEntry | undefined>;
}

interface Events {
  changed: PageContext | null;
}

export class PageContextHub {
  readonly events = new TypedEmitter<Events>();
  private ctx: PageContext | null = null;
  private owner: object | null = null;
  private sig = "";

  // 同一個 owner 重複 publish 內容沒變時不 emit（block 每次 render 都會呼叫）。
  publish(owner: object, ctx: PageContext): void {
    const sig = pageContextSig(ctx);
    const same = this.owner === owner && this.sig === sig;
    this.ctx = ctx;
    this.owner = owner;
    this.sig = sig;
    if (!same) this.events.emit("changed", ctx);
  }

  clear(owner: object): void {
    if (this.owner !== owner) return;
    this.ctx = null;
    this.owner = null;
    this.sig = "";
    this.events.emit("changed", null);
  }

  current(): PageContext | null {
    return this.ctx;
  }

  // 側欄用：前景的檔案就是這個頁面時才回傳。
  for(path: string | null): PageContext | null {
    return path && this.ctx?.sourcePath === path ? this.ctx : null;
  }
}

export function pageContextSig(ctx: PageContext): string {
  return JSON.stringify([
    ctx.kind,
    ctx.sourcePath,
    ctx.activeGroupKey,
    ctx.focusWord ?? "",
    ctx.groups.map((g) => [g.key, g.title, g.words.map((w) => [w.word, w.entryId ?? "", w.morpheme?.id ?? "", w.zh, w.emoji])]),
  ]);
}
