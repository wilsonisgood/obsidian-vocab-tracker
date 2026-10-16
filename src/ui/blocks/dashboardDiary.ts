import { MarkdownRenderChild, Notice, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";

// 「今天的日記」卡片 (第十九波 D2b, 1016 #9): the newest diary (date + first
// two lines) linking to it, plus 寫今天的／重寫今天的.
export function renderDiaryCard(plugin: VocabTrackerPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const card = el.createDiv({ cls: "vt-dash-diary" });
  const child = new MarkdownRenderChild(card);
  ctx.addChild(child);
  let alive = true;
  child.register(() => (alive = false));

  const draw = async () => {
    const svc = plugin.diary;
    const latest = await svc.latest();
    if (!alive) return;
    card.empty();
    card.createDiv({ cls: "vt-dash-diary-title", text: t("dashboard.diary.title") });
    const status = svc.status();
    if (latest) {
      const link = card.createEl("a", { cls: "vt-dash-diary-link", text: latest.day });
      link.onclick = (ev) => {
        ev.preventDefault();
        void plugin.app.workspace.openLinkText(latest.path, "", false);
      };
      for (const l of latest.lines) card.createDiv({ cls: "vt-dash-diary-line", text: l });
    } else {
      card.createDiv({ cls: "vt-dash-diary-line", text: t("dashboard.diary.none") });
    }
    const reason =
      status === "no-ai" ? "dashboard.diary.reason.noAi" : status === "off" ? "dashboard.diary.reason.off" : status === "failed" ? "dashboard.diary.reason.failed" : null;
    if (reason) card.createDiv({ cls: "vt-dash-diary-reason", text: t(reason) });

    const today = svc.today();
    const wroteToday = plugin.app.vault.getAbstractFileByPath(svc.pathOf(today)) !== null;
    const writing = status === "writing";
    const btn = card.createEl("button", {
      cls: "vt-dash-diary-btn",
      text: t(writing ? "dashboard.diary.writing" : wroteToday ? "dashboard.diary.rewrite" : "dashboard.diary.write"),
    });
    btn.disabled = writing;
    btn.onclick = () => {
      void svc.write(today, { overwrite: wroteToday }).then((r) => {
        if (r === "written") new Notice(t("dashboard.diary.written", { day: today }));
      });
    };
  };

  void draw();
  child.register(plugin.diary.onChange(() => void draw()));
}
