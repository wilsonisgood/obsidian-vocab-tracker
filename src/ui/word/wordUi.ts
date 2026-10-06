import { Component } from "obsidian";
import { createChatUiState, type ChatUiState } from "../chat/ChatPanel";

export type WordTab = "data" | "ai";

// View-memory UI state for word cards (規劃書 06 §9.4): which tab each
// card is on and the chat drafts — never saved, but kept across the host's
// full redraws. One per sidebar / dashboard block.
export class WordUi {
  readonly tabs = new Map<string, WordTab>();
  readonly chat: ChatUiState = createChatUiState();
  private scope: Component | null = null;
  // Each row's own child scope: its AI tab's ChatPanel, its tab-bar's
  // thread-count listener (規格 #10, Wave 7 R). Recreated every time that
  // row rebuilds itself — not just on a full beginRender() — so a row that
  // switches tabs/edits fields many times over (self-redraw, never calling
  // the host's full refresh) doesn't pile up ChatPanels or event listeners
  // that only a full redraw used to clean up.
  private rows = new Map<string, Component>();

  constructor(private owner: Component) {}

  // Call at the start of every full redraw: unloads the previous draw's
  // chat panels (their event subscriptions) before new ones are made.
  beginRender(): void {
    if (this.scope) this.owner.removeChild(this.scope);
    this.scope = this.owner.addChild(new Component());
    this.rows.clear();
  }

  // Owner of everything rendered in the current draw.
  get component(): Component {
    if (!this.scope) this.beginRender();
    return this.scope as Component;
  }

  // Tears down this row's previous scope (if any — unloading its old
  // ChatPanel/listeners) and returns a fresh child of `component` for this
  // build to register on. Call once per row build (WordRow.ts), before
  // anything that registers a listener or adds a ChatPanel.
  rowScope(entryId: string): Component {
    const prev = this.rows.get(entryId);
    if (prev) this.component.removeChild(prev);
    const next = this.component.addChild(new Component());
    this.rows.set(entryId, next);
    return next;
  }
}
