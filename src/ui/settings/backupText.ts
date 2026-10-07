import { joinWords, t, type I18nKey } from "../../core/i18n";
import type { BackupSummary } from "../../services/backup/format";
import type { BackupItem, RestorePreview } from "../../services/backup/BackupService";

// Wording for the 備份與還原 section and its confirmation (no DOM, so it
// is unit-tested on its own).

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Local time, "2026/10/05 14:30".
export function backupTime(iso: string | null): string {
  if (!iso) return t("settings.backup.noTime");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("settings.backup.noTime");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const REASON: Record<BackupItem["reason"], I18nKey> = {
  manual: "settings.backup.reason.manual",
  "before-restore": "settings.backup.reason.before-restore",
  migration: "settings.backup.reason.migration",
  unknown: "settings.backup.reason.unknown",
};

export function backupTitle(item: BackupItem): string {
  if (item.kind === "unreadable") return `${backupTime(item.createdAt)} · ${item.name}`;
  return `${backupTime(item.createdAt)} · ${t(REASON[item.reason])}`;
}

// 「120 個單字 · 8 串討論（34 題）· 5 個字族…」; parts the backup doesn't
// have are left out (a words-only backup shows just the word count).
export function summaryText(s: BackupSummary): string {
  const parts = [t("settings.backup.summary.words", { n: s.words })];
  if (s.threads !== undefined) parts.push(t("settings.backup.summary.threads", { n: s.threads, q: s.questions ?? 0 }));
  if (s.families !== undefined) parts.push(t("settings.backup.summary.families", { n: s.families }));
  if (s.trivia !== undefined) parts.push(t("settings.backup.summary.trivia", { n: s.trivia }));
  if (s.morphemes !== undefined) parts.push(t("settings.backup.summary.morphemes", { n: s.morphemes }));
  if (s.reviews !== undefined) parts.push(t("settings.backup.summary.reviews", { n: s.reviews }));
  return parts.join(" · ");
}

export function backupDesc(item: BackupItem): string {
  return item.summary ? summaryText(item.summary) : t("settings.backup.unreadable");
}

export interface PreviewText {
  // 「會發生的事」 bullets.
  what: string[];
  // Records added after the backup (kept unless the box is ticked); null
  // when there are none, so the checkbox isn't shown.
  extras: string | null;
}

export function previewText(p: RestorePreview): PreviewText {
  const c = p.counts;
  const what: string[] = [];
  if (c.words.changed || c.words.revived) {
    what.push(t("backup.restore.words", { changed: c.words.changed, revived: c.words.revived }));
  }
  const threads = c.threads.changed + c.threads.revived;
  if (threads || c.questions.revived) {
    what.push(t("backup.restore.threads", { n: threads, q: c.questions.revived }));
  }
  const families = c.families.changed + c.families.revived;
  const trivia = c.trivia.changed + c.trivia.revived;
  if (families || trivia) what.push(t("backup.restore.learn", { families, trivia }));
  if (c.reviewsAdded) what.push(t("backup.restore.reviews", { n: c.reviewsAdded }));
  if (!what.length) what.push(t("backup.restore.same"));
  if (p.missing.length) {
    const parts = p.missing.map((m) => t(`backup.restore.part.${m}`));
    what.push(t("backup.restore.missing", { parts: joinWords(parts) }));
  }
  what.push(t("backup.restore.settings"));

  const learn = c.families.extra + c.trivia.extra;
  const anyExtra = c.words.extra || c.questions.extra || c.threads.extra || learn;
  const extras = anyExtra
    ? t("backup.restore.extras.desc", { words: c.words.extra, questions: c.questions.extra, learn })
    : null;
  return { what, extras };
}

export function deviceLines(): string[] {
  return [
    t("backup.restore.devices.sync"),
    t("backup.restore.devices.unsynced"),
    t("backup.restore.devices.after"),
    t("backup.restore.devices.tip"),
  ];
}
