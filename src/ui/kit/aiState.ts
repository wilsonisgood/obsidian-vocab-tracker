import { t, type I18nKey } from "../../core/i18n";
import type { AiStatus } from "../../services/ai/AiService";
import { AiError, type AiErrorCode } from "../../services/ai/errors";
import { emptyState } from "./emptyState";
import { inlineNote } from "./inlineNote";

// Maps AI states and errors to UI (規劃書 06 §6.5): D6 for disabled / no
// key, D7 for offline, everything else as a message on the failed bubble.

export function aiErrorKey(code: AiErrorCode): I18nKey {
  return `ai.error.${code}` as I18nKey;
}

// For auth/bad_request the provider's own message is the useful part
// ("model: claude-nope not found"), so it's appended.
export function aiErrorText(e: AiError | AiErrorCode): string {
  const code = typeof e === "string" ? e : e.code;
  const base = t(aiErrorKey(code));
  if (typeof e !== "string" && (code === "bad_request" || code === "auth") && e.message && e.message !== code) {
    return `${base}（${e.message}）`;
  }
  return base;
}

// Renders the gate for a non-ready status into `parent` and returns true,
// or returns false (rendering nothing) when AI is ready.
export function renderAiGate(parent: HTMLElement, status: AiStatus, opts: { onOpenSettings: () => void }): boolean {
  if (status === "ready") return false;
  if (status === "offline") {
    parent.appendChild(inlineNote({ tone: "offline", text: t("ai.gate.offline") }));
    return true;
  }
  const disabled = status === "disabled";
  parent.appendChild(
    emptyState({
      icon: disabled ? "sparkles" : "key-round",
      title: t(disabled ? "ai.gate.disabled.title" : "ai.gate.noKey.title"),
      body: t(disabled ? "ai.gate.disabled.body" : "ai.gate.noKey.body"),
      action: { label: t("ai.action.openSettings"), icon: "settings", onClick: opts.onOpenSettings },
    })
  );
  return true;
}
