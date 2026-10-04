import { t } from "../../core/i18n";
import { MAX_BODY_CHARS, type HttpTrace } from "../../services/ai/transport/tracing";

// 測試連線's "請求與回應" panel: the raw exchange as plain text, so it can
// be read on screen or copied into a bug report as-is.

function prettyBody(body: string | undefined): string {
  if (!body) return "";
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export function formatTrace(trace: HttpTrace): string {
  const { request: req, response: res } = trace;
  const ms = trace.ms ?? 0;
  const lines = [`${req.method} ${req.url}`];
  for (const [k, v] of Object.entries(req.headers)) lines.push(`${k}: ${v}`);
  if (req.body) lines.push("", prettyBody(req.body));
  lines.push("");
  if (res) {
    lines.push(t("settings.ai.test.response", { mode: res.mode, ms }), `HTTP ${res.status}`);
    for (const [k, v] of Object.entries(res.headers)) lines.push(`${k}: ${v}`);
    lines.push("", prettyBody(res.body) || t("settings.ai.test.emptyBody"));
    if (res.body.length >= MAX_BODY_CHARS) lines.push(t("settings.ai.test.truncated", { n: MAX_BODY_CHARS }));
  } else {
    lines.push(t("settings.ai.test.noResponse", { ms }), trace.error ?? "");
  }
  return lines.join("\n");
}

export function renderTraces(parent: HTMLElement, traces: HttpTrace[], open: boolean): void {
  if (traces.length === 0) return;
  const text = traces.map(formatTrace).join("\n\n════════\n\n");
  const details = parent.createEl("details", { cls: "vt-settings-trace" });
  details.open = open;
  const summary = details.createEl("summary", { text: t("settings.ai.test.details", { n: traces.length }) });
  const copy = summary.createEl("button", { cls: "vt-settings-trace-copy", text: t("settings.ai.test.copy") });
  copy.addEventListener("click", (ev) => {
    // Inside <summary>, a click would also toggle the panel.
    ev.preventDefault();
    void navigator.clipboard.writeText(text).then(() => copy.setText(t("settings.ai.test.copied")));
  });
  details.createEl("pre", { text });
}
