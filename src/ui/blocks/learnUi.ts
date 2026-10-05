import { setIcon, type Component } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { isAiError } from "../../services/ai/errors";
import { aiErrorText } from "../kit/aiState";
import { emptyState } from "../kit/emptyState";
import { inlineNote } from "../kit/inlineNote";
import { openPluginSettings } from "../kit/openSettings";

// Shared bits of the M7 learning blocks (vocab-families / -verbs / -trivia).

// The plugin's document-level reading-mode click handler would pop its
// 「Add <word> to Vocab Tracker」 menu on every click that lands on a
// block's text (the block sits inside .markdown-rendered), as in
// vocab-flashcards. Links still bubble so Obsidian can open them.
export function guardReadingClicks(owner: Component, root: HTMLElement): void {
  owner.registerDomEvent(root, "click", (e) => {
    if (e.target instanceof HTMLElement && e.target.closest("a")) return;
    e.stopPropagation();
  });
}

// AI errors get the shared wording (規劃書 06 §6.5); anything else its message.
export function learnErrorText(e: unknown): string {
  if (isAiError(e)) return aiErrorText(e);
  return e instanceof Error ? e.message : String(e);
}

export const isAbort = (e: unknown) => isAiError(e) && e.code === "aborted";

// D6/D7-style gate for the learning blocks: returns true (and renders) when
// AI can't be used right now.
export function renderLearnAiGate(parent: HTMLElement, plugin: VocabTrackerPlugin): boolean {
  const status = plugin.ai.status();
  if (status === "ready") return false;
  if (status === "offline") {
    parent.appendChild(inlineNote({ tone: "offline", text: t("learn.ai.offline") }));
    return true;
  }
  parent.appendChild(
    emptyState({
      icon: status === "disabled" ? "sparkles" : "key-round",
      title: t(status === "disabled" ? "learn.ai.disabled.title" : "learn.ai.noKey.title"),
      body: t("learn.ai.body"),
      action: {
        label: t("ai.action.openSettings"),
        icon: "settings",
        onClick: () => openPluginSettings(plugin.app, plugin.manifest.id),
      },
    })
  );
  return true;
}

// A button with an optional lucide icon; `cta` for the primary action.
export function learnButton(
  parent: HTMLElement,
  opts: { label: string; icon?: string; cta?: boolean; ghost?: boolean; onClick: () => void }
): HTMLButtonElement {
  const btn = parent.createEl("button", { cls: "vt-btn vt-learn-btn" });
  if (opts.cta) btn.addClass("mod-cta");
  if (opts.ghost) btn.addClass("is-ghost");
  if (opts.icon) setIcon(btn.createSpan({ cls: "vt-btn-icon" }), opts.icon);
  btn.createSpan({ text: opts.label });
  btn.addEventListener("click", opts.onClick);
  return btn;
}
