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

  constructor(private owner: Component) {}

  // Call at the start of every full redraw: unloads the previous draw's
  // chat panels (their event subscriptions) before new ones are made.
  beginRender(): void {
    if (this.scope) this.owner.removeChild(this.scope);
    this.scope = this.owner.addChild(new Component());
  }

  // Owner of everything rendered in the current draw.
  get component(): Component {
    if (!this.scope) this.beginRender();
    return this.scope as Component;
  }
}
