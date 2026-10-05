import { setIcon, type Component } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
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

// ── Learned words → their card ────────────────────────────────────

// A chip for a word that's in the vocab list (字族樹, 動詞用法, 冷知識)
// opens the word's card in the sidebar. The host (main.ts) provides it;
// the blocks never reach into the plugin for it.
export interface WordLinkHost {
  openWordCard?(entry: VocabEntry): unknown;
}

// The host's opener, if it has one (until it does, chips stay plain).
export function wordOpener(host: object): ((entry: VocabEntry) => void) | undefined {
  const open = (host as WordLinkHost).openWordCard;
  return typeof open === "function" ? (entry) => void open.call(host, entry) : undefined;
}

// `entry` set and an opener there: a <button> that opens the word;
// otherwise the plain <span> it always was.
export function wordChip(
  parent: HTMLElement,
  host: object,
  entry: VocabEntry | undefined,
  cls: string | string[]
): HTMLElement {
  const open = entry ? wordOpener(host) : undefined;
  if (!entry || !open) return parent.createSpan({ cls });
  const el = parent.createEl("button", { cls, attr: { type: "button", title: t("learn.openWord", { word: entry.word }) } });
  el.addClass("is-link");
  el.addEventListener("click", () => open(entry));
  return el;
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
