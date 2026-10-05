import { Notice, setIcon } from "obsidian";
import { getLocale } from "../../core/i18n";
import { aiDebugOf, aiDebugReport, type AiDebugInfo } from "../../services/ai/errors";
import { inlineNote } from "./inlineNote";

// The failure box of the learning blocks (字族樹, 動詞用法; 1005 回饋 #4-2):
// the error line as before, and — when the AI's answer couldn't be read —
// a folded 「除錯資訊」 with the prompt that was sent and the model's raw
// answer, plus 「複製」 for a bug report or a screenshot. API keys never
// appear: they're not part of the prompt, and the text went through
// redactSecrets when the error was made (services/ai/errors.ts).

// Temporary strings until they move to core/i18n (`ai.debug.*`).
const L = {
  "zh-TW": {
    summary: "除錯資訊：送給 AI 的內容與 AI 的原始回答",
    prompt: "送給 AI 的 prompt",
    output: "AI 的原始輸出",
    empty: "（沒有內容）",
    copy: "複製",
    copied: "已複製除錯資訊",
    copyFailed: "無法複製，請直接選取文字",
    hint: "回報問題時可以附上這段（不含 API key）。",
  },
  en: {
    summary: "Debug info: what was sent to the AI and its raw answer",
    prompt: "Prompt sent to the AI",
    output: "Raw AI output",
    empty: "(empty)",
    copy: "Copy",
    copied: "Debug info copied",
    copyFailed: "Couldn't copy — select the text instead",
    hint: "Attach this when reporting a problem (no API key in it).",
  },
} as const;

export type AiDebugKey = keyof (typeof L)["en"];

export function debugText(key: AiDebugKey): string {
  return (L[getLocale()] ?? L.en)[key];
}

export function debugReportText(d: AiDebugInfo): string {
  return aiDebugReport(d, { prompt: debugText("prompt"), output: debugText("output"), empty: debugText("empty") });
}

// Error line + (for unreadable answers) the folded debug box. `text` is
// the message to show (learnErrorText); `error` is the thrown value.
export function aiErrorBox(opts: { text: string; error?: unknown }): HTMLElement {
  const box = createDiv({ cls: "vt-ai-error-box" });
  box.appendChild(inlineNote({ tone: "error", text: opts.text }));
  const debug = aiDebugOf(opts.error);
  if (debug) box.appendChild(aiDebugDetails(debug));
  return box;
}

export function aiDebugDetails(d: AiDebugInfo): HTMLElement {
  const details = createEl("details", { cls: "vt-ai-debug" });
  const summary = details.createEl("summary", { cls: "vt-ai-debug-summary" });
  setIcon(summary.createSpan({ cls: "vt-ai-debug-icon" }), "bug");
  summary.createSpan({ text: debugText("summary") });

  const bar = details.createDiv({ cls: "vt-ai-debug-bar" });
  bar.createSpan({ cls: "vt-ai-debug-hint", text: debugText("hint") });
  const copy = bar.createEl("button", { cls: "vt-btn vt-ai-debug-copy", attr: { type: "button" } });
  setIcon(copy.createSpan({ cls: "vt-btn-icon" }), "copy");
  copy.createSpan({ text: debugText("copy") });
  copy.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void copyText(debugReportText(d));
  });

  const meta = [d.taskId, d.model, d.stop && `stop: ${d.stop}`, d.reason].filter(Boolean).join(" · ");
  if (meta) details.createDiv({ cls: "vt-ai-debug-meta", text: meta });
  section(details, debugText("prompt"), d.prompt);
  section(details, debugText("output"), d.output);
  return details;
}

function section(parent: HTMLElement, label: string, text: string): void {
  parent.createDiv({ cls: "vt-ai-debug-label", text: label });
  parent.createEl("pre", { cls: "vt-ai-debug-pre", text: text || debugText("empty") });
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    new Notice(debugText("copied"));
  } catch {
    new Notice(debugText("copyFailed"));
  }
}
