import type { Component } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import type { DictionaryResult } from "../../core/model/dictionary";
import type { VocabEntry } from "../../core/model/entry";
import { wordThreadId, type Turn } from "../../core/model/thread";
import type { WordContext } from "../../core/model/word-context";
import { wordCustom } from "../../services/ai/tasks/word";
import { findWordSource } from "../../services/threads/wordInput";
import type { ChatSend } from "../chat/ChatPanel";
import { ChatPanel } from "../chat/ChatPanel";
import type { KitAction } from "../kit/emptyState";
import { openPluginSettings } from "../kit/openSettings";
import { promotePreview, type PreviewHost } from "./previewEntry";
import type { WordUi } from "./wordUi";

// 1009-2 #1: a preview card's AI tab — `entry` is still the draft
// (previewEntry.ts's draftEntry()). Switching to this tab never adds
// anything; the first question does, via `send` below. `refresh` is the
// same callback WordRow.ts's renderVocabRow caller was given — calling
// it swaps this card for the real entry (same as ♥'s own promotion).
export interface WordAiPreview {
  ctx: Partial<WordContext>;
  dict: DictionaryResult | null;
  refresh(): void;
}

// What buildPreviewSend needs beyond promotePreview's own PreviewHost —
// kept separate from renderWordAiTab so it's unit-testable with a plain
// fake instead of a real ChatPanel/Obsidian Component (vitest runs in
// node, no DOM — AGENT.md §5a.2).
export interface PreviewAskHost extends PreviewHost {
  threads: { askWord(entry: VocabEntry, req: ChatSend): Promise<void> };
}

// 1009-2 #1: the AI tab's first question on a preview card — promotes it
// for real (same add+like as ♥) *before* asking, then hands the card
// over to the real entry exactly like ParagraphThreadPane.ts's
// sendDraft()/threadStarted do for a paragraph's first question — except
// the real entry's thread id is known up front here (deterministic from
// its id), so there's no need to wait for a thread:upsert event first.
export function buildPreviewSend(
  host: PreviewAskHost,
  draftWord: string,
  draftThreadId: string,
  ui: WordUi,
  preview: WordAiPreview
): (req: ChatSend) => Promise<void> {
  return async (req) => {
    const added = await promotePreview(host, draftWord, preview.ctx, preview.dict);
    if (ui.chat.focused === draftThreadId) ui.chat.focused = wordThreadId(added.id);
    ui.tabs.set(added.id, "ai");
    preview.refresh();
    await host.threads.askWord(added, req);
  };
}

// The word card's ✦ AI tab (design D3/D4): the word's discussion thread.
// `scope` is this row's own child Component (WordUi.rowScope, Wave 7 R
// 規格 #10) — the ChatPanel is a child of it, not of `ui.component`
// directly, so a self-redraw that tears down just this row (switching
// tabs, editing a field, …) unloads this ChatPanel instead of leaking it
// until the next full redraw.
export function renderWordAiTab(
  plugin: VocabTrackerPlugin,
  container: HTMLElement,
  entry: VocabEntry,
  ui: WordUi,
  scope: Component,
  preview?: WordAiPreview
): void {
  const pinAction = (turn: Turn): KitAction[] => {
    const pinned = !!turn.pinnedToGrammar;
    return [
      {
        label: t(pinned ? "chat.action.unpin" : "chat.action.pin"),
        icon: pinned ? "pin-off" : "pin",
        onClick: () => void plugin.threads.setPinned(entry, turn.id, !pinned),
      },
    ];
  };

  const draftThreadId = wordThreadId(entry.id);

  const send = preview
    ? buildPreviewSend(plugin, entry.word, draftThreadId, ui, preview)
    : (req: ChatSend) => plugin.threads.askWord(entry, req);

  scope.addChild(
    new ChatPanel(container, {
      app: plugin.app,
      threads: plugin.threads,
      ai: plugin.ai,
      selection: plugin.selection,
      threadId: draftThreadId,
      surface: "word",
      customTaskId: wordCustom.id,
      sourcePath: entry.source?.path ?? "",
      placeholder: t("chat.placeholder.word", { word: entry.word }),
      state: ui.chat,
      send,
      retry: (turnId) => plugin.threads.retryWord(entry, turnId),
      turnActions: pinAction,
      origin: findWordSource(entry, plugin.notes).then((s) =>
        s ? t("chat.meta.origin", { n: s.paragraphNumber }) : undefined
      ),
      onOpenSettings: () => openPluginSettings(plugin.app, plugin.manifest.id),
    })
  );
}
