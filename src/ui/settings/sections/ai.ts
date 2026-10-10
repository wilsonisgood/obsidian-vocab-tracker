import { Setting } from "obsidian";
import { t } from "../../../core/i18n";
import type { ProviderId } from "../../../core/model/settings";
import { isAiError } from "../../../services/ai/errors";
import { PROVIDERS, providerDef } from "../../../services/ai/providers/registry";
import type { HttpTrace } from "../../../services/ai/transport/tracing";
import { aiErrorText } from "../../kit/aiState";
import { inlineNote } from "../../kit/inlineNote";
import { parseNonNegativeInt, type SettingsContext, type SettingsSection } from "../SettingsTab";
import { renderTraces } from "../traceView";

// AI settings (規劃書 06 §6.6, design D6): master toggle, provider, key,
// models, 測試連線, monthly budget, usage. Provider-specific fields are
// driven by the provider registry, so a new provider needs no UI change.

const fmt = (n: number) => n.toLocaleString();

function renderProviderFields(el: HTMLElement, ctx: SettingsContext, id: ProviderId): void {
  const def = providerDef(id);
  const cfg = () => ctx.store.settings.ai.providers[id];
  const update = (mutate: (c: ReturnType<typeof cfg>) => void) => ctx.store.updateSettings((s) => mutate(s.ai.providers[id]));

  // API key — password field; storage location disclosed in the description.
  const keyDesc = [t(ctx.keys.usesSecretStorage ? "settings.ai.key.descSecret" : "settings.ai.key.descData")];
  if (def.key === "optional") keyDesc.unshift(t("settings.ai.key.optional"));
  new Setting(el)
    .setName(t("settings.ai.key.name"))
    .setDesc(keyDesc.join(" "))
    .addText((text) => {
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
      text.setPlaceholder(id === "anthropic" ? "sk-ant-…" : "sk-…").setValue(ctx.keys.get(id));
      text.onChange((v) => void ctx.keys.set(id, v));
    });

  if (def.editableBaseUrl) {
    const baseUrl = new Setting(el).setName(t("settings.ai.baseUrl.name")).setDesc(t("settings.ai.baseUrl.desc"));
    // Input on its own row, preset buttons on the next (1010 #S4); see settings.css.
    baseUrl.settingEl.addClass("vt-settings-baseurl");
    baseUrl.addText((text) => {
      text.inputEl.addClass("vt-settings-wide");
      text.setPlaceholder("https://…/v1").setValue(cfg().baseUrl);
      text.onChange((v) => void update((c) => (c.baseUrl = v.trim())));
    });
    for (const preset of def.baseUrlPresets ?? []) {
      baseUrl.addButton((b) =>
        b.setButtonText(preset.label).onClick(async () => {
          await update((c) => (c.baseUrl = preset.url));
          ctx.redisplay();
        })
      );
    }
  }

  // One model for every AI feature (1010 #S3); stored in smartModel.
  const modelSetting = new Setting(el).setName(t("settings.ai.model.name")).setDesc(t("settings.ai.model.desc"));
  const options = def.models?.smart;
  if (options) {
    // Keep a model chosen elsewhere (newer plugin version, synced device)
    // selectable instead of silently snapping to the first option.
    const cur = cfg().smartModel || cfg().fastModel;
    const all = options.includes(cur) || !cur ? options : [...options, cur];
    modelSetting.addDropdown((d) => {
      for (const m of all) d.addOption(m, m);
      d.setValue(cur || all[0]).onChange((v) => void update((c) => (c.smartModel = v)));
    });
  } else {
    modelSetting.addText((text) =>
      text
        .setPlaceholder(t("settings.ai.model.placeholder"))
        .setValue(cfg().smartModel || cfg().fastModel)
        .onChange((v) => void update((c) => (c.smartModel = v.trim())))
    );
  }

  // 測試連線 — the M3 acceptance check (Claude and Ollama both succeed).
  const testSetting = new Setting(el).setName(t("settings.ai.test.name")).setDesc(t("settings.ai.test.desc"));
  const result = el.createDiv({ cls: "vt-settings-test-result" });
  const trace = el.createDiv();
  testSetting.addButton((b) => {
    b.setButtonText(t("settings.ai.test.button")).onClick(async () => {
      result.empty();
      trace.empty();
      result.removeClass("is-ok", "is-error");
      if (!cfg().smartModel && !cfg().fastModel) {
        result.setText(t("settings.ai.test.noModel"));
        result.addClass("is-error");
        return;
      }
      b.setDisabled(true).setButtonText(t("settings.ai.test.running"));
      const traces: HttpTrace[] = [];
      let failed = false;
      try {
        const r = await ctx.ai.testConnection(id, undefined, traces);
        result.setText(
          t("settings.ai.test.ok", {
            models: r.models.join("、"),
            transport: t(r.transport === "fetch" ? "settings.ai.test.fetch" : "settings.ai.test.requestUrl"),
            ms: r.latencyMs,
          })
        );
        result.addClass("is-ok");
      } catch (e) {
        failed = true;
        result.setText(isAiError(e) ? aiErrorText(e) : String(e));
        result.addClass("is-error");
      } finally {
        // Opened on failure: the response body is what explains the error.
        renderTraces(trace, traces, failed);
        b.setDisabled(false).setButtonText(t("settings.ai.test.button"));
      }
    });
  });
}

export const aiSection: SettingsSection = {
  id: "ai",
  title: "settings.section.ai",
  render(el, ctx) {
    const ai = () => ctx.store.settings.ai;

    new Setting(el)
      .setName(t("settings.ai.enabled.name"))
      .setDesc(t("settings.ai.enabled.desc"))
      .addToggle((tg) =>
        tg.setValue(ai().enabled).onChange(async (v) => {
          await ctx.store.updateSettings((s) => (s.ai.enabled = v));
          // The reading-view ✦ only shows on hover while AI is on.
          ctx.onAiEnabledChanged?.();
        })
      );

    new Setting(el)
      .setName(t("settings.ai.provider.name"))
      .setDesc(t("settings.ai.provider.desc"))
      .addDropdown((d) => {
        for (const p of PROVIDERS) d.addOption(p.id, t(p.label));
        d.setValue(ai().provider).onChange(async (v) => {
          await ctx.store.updateSettings((s) => (s.ai.provider = v as ProviderId));
          ctx.redisplay();
        });
      });

    renderProviderFields(el, ctx, ai().provider);

    new Setting(el)
      .setName(t("settings.ai.budget.name"))
      .setDesc(t("settings.ai.budget.desc"))
      .addText((text) => {
        text.inputEl.inputMode = "numeric";
        text.setPlaceholder("0").setValue(ai().monthlyTokenBudget ? String(ai().monthlyTokenBudget) : "");
        text.onChange((v) => {
          const n = v.trim() === "" ? 0 : parseNonNegativeInt(v);
          if (n !== null) void ctx.store.updateSettings((s) => (s.ai.monthlyTokenBudget = n));
        });
      });

    new Setting(el)
      .setName(t("settings.ai.dnaDailyBatches.name"))
      .addText((text) => {
        text.inputEl.inputMode = "numeric";
        text.setPlaceholder("10").setValue(String(ai().dnaDailyBatches ?? 10));
        text.onChange((v) => {
          const n = v.trim() === "" ? 10 : parseNonNegativeInt(v);
          if (n !== null) void ctx.store.updateSettings((s) => (s.ai.dnaDailyBatches = n));
        });
      });

    const usage = new Setting(el).setName(t("settings.ai.usage.name")).setDesc("…");
    ctx.ai
      .usageSummary()
      .then((u) => {
        const desc = createFragment((f) => {
          f.createDiv({ text: t("settings.ai.usage.value", { month: fmt(u.monthWeighted), today: fmt(u.today.input + u.today.output) }) });
          f.createDiv({
            cls: "vt-settings-muted",
            text: t("settings.ai.usage.detail", {
              input: fmt(u.month.input),
              output: fmt(u.month.output),
              cacheRead: fmt(u.month.cacheRead),
              cacheWrite: fmt(u.month.cacheWrite),
              requests: fmt(u.month.requests),
            }),
          });
        });
        usage.setDesc(desc);
      })
      .catch(() => usage.setDesc("—"));

    el.appendChild(inlineNote({ tone: "info", text: t("settings.ai.privacy") }));
  },
};
