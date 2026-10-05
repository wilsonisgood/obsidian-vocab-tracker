import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../src/core/i18n";
import type { BackupItem, RestorePreview } from "../../../src/services/backup/BackupService";
import { backupDesc, backupTime, backupTitle, deviceLines, previewText, summaryText } from "../../../src/ui/settings/backupText";

afterEach(() => setLocale("en"));

const counts = (o: Partial<RestorePreview["counts"]> = {}): RestorePreview["counts"] => ({
  words: { changed: 0, revived: 0, extra: 0 },
  threads: { changed: 0, revived: 0, extra: 0 },
  questions: { changed: 0, revived: 0, extra: 0 },
  families: { changed: 0, revived: 0, extra: 0 },
  trivia: { changed: 0, revived: 0, extra: 0 },
  reviewsAdded: 0,
  ...o,
});

const item: BackupItem = {
  name: "full-2026-10-05T06-30-00.000Z-manual.json",
  path: ".obsidian/plugins/vocab-tracker/backup/full-2026-10-05T06-30-00.000Z-manual.json",
  kind: "full",
  createdAt: "2026-10-05T06:30:00.000Z",
  reason: "manual",
  summary: { words: 120, threads: 8, questions: 34, families: 5, trivia: 3, reviews: 410 },
};

function preview(c: RestorePreview["counts"], missing: RestorePreview["missing"] = []): RestorePreview {
  return { item, counts: c, missing, safetyFolder: ".obsidian/plugins/vocab-tracker/backup" };
}

describe("backup list wording", () => {
  it("shows the local time, the reason and what the backup holds", () => {
    setLocale("zh-TW");
    const d = new Date(item.createdAt!);
    expect(backupTime(item.createdAt)).toBe(
      `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:30`
    );
    expect(backupTitle(item)).toMatch(/ · 手動備份$/);
    expect(summaryText(item.summary!)).toBe("120 個單字 · 8 串討論（34 題） · 5 個字族 · 3 則冷知識收藏 · 410 筆複習紀錄");
    expect(summaryText({ words: 12 })).toBe("12 個單字");
    expect(backupDesc({ ...item, kind: "unreadable", summary: null })).toBe("無法讀取，不能還原。");
    expect(backupTime(null)).toBe("時間不明");
  });
});

describe("confirmation wording", () => {
  it("spells out each change, what the backup lacks, and that settings stay", () => {
    setLocale("zh-TW");
    const text = previewText(
      preview(
        counts({
          words: { changed: 2, revived: 1, extra: 3 },
          threads: { changed: 1, revived: 0, extra: 0 },
          questions: { changed: 0, revived: 2, extra: 4 },
          reviewsAdded: 5,
        }),
        ["learn"]
      )
    );
    expect(text.what).toEqual([
      "單字：2 個改回備份時的內容（釋義、等級、單字卡進度都會回到當時）；1 個已刪除的字會回來。",
      "討論串：1 串改回備份時的內容；2 題刪掉的問題會回來。",
      "複習紀錄：補回 5 筆（紀錄只會增加，不會刪除）。",
      "這個備份裡沒有字族和冷知識收藏，這些會維持現在的樣子。",
      "設定（AI、單字卡、考試字表…）和 AI 用量統計不會變。",
    ]);
    expect(text.extras).toBe("目前有、但備份裡沒有的：3 個單字、4 題討論、0 個字族／收藏。不勾選的話會保留。");
  });

  it("says when nothing would change, and hides the extras choice when there are none", () => {
    setLocale("zh-TW");
    const text = previewText(preview(counts(), ["threads", "learn", "reviews"]));
    expect(text.what[0]).toBe("目前的資料跟這個備份一樣，還原不會改變任何東西。");
    expect(text.what[1]).toBe("這個備份裡沒有討論串、字族和冷知識收藏、複習紀錄，這些會維持現在的樣子。");
    expect(text.extras).toBeNull();
  });

  it("explains what other devices will see", () => {
    setLocale("zh-TW");
    const lines = deviceLines();
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("其他裝置也會變成還原後的樣子");
    expect(lines[1]).toContain("以還原為準");
    expect(lines[2]).toContain("不會被這次還原蓋掉");
  });
});
