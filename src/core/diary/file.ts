import { renderDiaryBody } from "./segment";
import type { DiaryArticle, DiaryFileInput } from "./types";

// Full diary md (1016 #9). Pure.

function wikilink(a: DiaryArticle): string {
  const target = a.path.replace(/\.md$/i, "");
  const base = target.split("/").pop() ?? target;
  return a.title && a.title !== base ? `[[${target}|${a.title}]]` : `[[${target}]]`;
}

export function renderDiaryFile(i: DiaryFileInput): string {
  const fm = [
    "---",
    "vocab-tracker: diary",
    `vocab-tracker-id: diary-${i.day}`,
    `diary-kind: ${i.kind}`,
    i.sources.length ? "diary-sources:" : "diary-sources: []",
    ...i.sources.map((s) => `  - ${JSON.stringify(s)}`),
    "---",
  ].join("\n");
  const links = i.articles.map(wikilink).join("、");
  const from = i.labels.subtitleFrom ? `${i.labels.subtitleFrom} ` : "";
  const subtitle = `<small>${i.day}${links ? ` · ${from}${links}` : ""}</small>`;
  const parts = [fm, subtitle];
  if (i.kind === "quote" && i.quote) parts.push(`> "${i.quote.text}" — ${i.quote.author}`);
  const body = renderDiaryBody(i.paragraphs);
  if (body) parts.push(body);
  if (i.kind === "quote") parts.push(`<small>${i.labels.disclaimer}</small>`);
  return `${parts.join("\n\n")}\n`;
}
