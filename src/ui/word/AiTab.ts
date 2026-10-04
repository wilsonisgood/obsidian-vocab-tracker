import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import { wordThreadId, type Turn } from "../../core/model/thread";
import { wordCustom } from "../../services/ai/tasks/word";
import { findWordSource } from "../../services/threads/wordInput";
import { ChatPanel } from "../chat/ChatPanel";
import type { KitAction } from "../kit/emptyState";
import { openPluginSettings } from "../kit/openSettings";
import type { WordUi } from "./wordUi";

// The word card's ✦ AI tab (design D3/D4): the word's discussion thread.
export function renderWordAiTab(plugin: VocabTrackerPlugin, container: HTMLElement, entry: VocabEntry, ui: WordUi): void {
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

  ui.component.addChild(
    new ChatPanel(container, {
      app: plugin.app,
      threads: plugin.threads,
      ai: plugin.ai,
      selection: plugin.selection,
      threadId: wordThreadId(entry.id),
      surface: "word",
      customTaskId: wordCustom.id,
      sourcePath: entry.source?.path ?? "",
      placeholder: t("chat.placeholder.word", { word: entry.word }),
      state: ui.chat,
      send: (req) => plugin.threads.askWord(entry, req),
      retry: (turnId) => plugin.threads.retryWord(entry, turnId),
      turnActions: pinAction,
      origin: findWordSource(entry, plugin.notes).then((s) =>
        s ? t("chat.meta.origin", { n: s.paragraphNumber }) : undefined
      ),
      onOpenSettings: () => openPluginSettings(plugin.app, plugin.manifest.id),
    })
  );
}
