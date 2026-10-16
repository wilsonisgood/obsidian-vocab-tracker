import { describe, expect, it } from "vitest";
import { renderDiaryFile } from "../../../src/core/diary/file";
import type { DiaryFileInput } from "../../../src/core/diary/types";

const base: DiaryFileInput = {
  day: "2026-10-15",
  kind: "diary",
  articles: [
    { path: "Reading/Coral Reefs.md", title: "Coral Reefs", headings: [] },
    { path: "The Silk Road.md", title: "The Silk Road", headings: [] },
  ],
  sources: ["Coral Reefs", "The Silk Road", "ephemeral"],
  paragraphs: ["Today I read about the **ephemeral** beauty of reefs at dawn."],
  labels: { subtitleFrom: "", disclaimer: "出處由 AI 提供，可能有誤" },
};

describe("renderDiaryFile", () => {
  it("diary: frontmatter, subtitle with wikilinks, body, no disclaimer", () => {
    const md = renderDiaryFile(base);
    expect(md.startsWith("---\nvocab-tracker: diary\nvocab-tracker-id: diary-2026-10-15\ndiary-kind: diary\ndiary-sources:\n  - \"Coral Reefs\"")).toBe(true);
    expect(md).toContain("<small>2026-10-15 · [[Reading/Coral Reefs]]、[[The Silk Road]]</small>");
    expect(md).toContain("## Today I read about the ephemeral beauty…");
    expect(md).not.toContain("出處由 AI");
  });
  it("quote: quote under subtitle, disclaimer at the end", () => {
    const md = renderDiaryFile({ ...base, kind: "quote", quote: { text: "Be here now.", author: "Ram Dass" } });
    expect(md.indexOf("<small>2026")).toBeLessThan(md.indexOf('> "Be here now." — Ram Dass'));
    expect(md.trimEnd().endsWith("<small>出處由 AI 提供，可能有誤</small>")).toBe(true);
  });
  it("place without articles: no links; empty sources array; alias when title differs", () => {
    const md = renderDiaryFile({ ...base, kind: "place", place: "Santorini", articles: [], sources: [] });
    expect(md).toContain("diary-sources: []");
    expect(md).toContain("<small>2026-10-15</small>");
    expect(renderDiaryFile({ ...base, articles: [{ path: "a.md", title: "Other", headings: [] }], labels: { ...base.labels, subtitleFrom: "from" } })).toContain("from [[a|Other]]");
  });
});
