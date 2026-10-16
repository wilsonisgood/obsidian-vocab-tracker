// Daily diary types (1016 #9–#14). Pure data; no I/O.

export type DiaryKind = "diary" | "quote" | "place";
export interface DiaryArticle { path: string; title: string; headings: string[] }
export type DiaryPointKind = "new-word" | "review-word" | "grammar-wrong" | "grammar-right" | "trivia";
export interface DiaryPoint { kind: DiaryPointKind; label: string; day: string }
export interface DiaryMaterial { day: string; articles: DiaryArticle[]; points: DiaryPoint[] }
// sources = article titles + point labels
export interface DiaryRecent { day: string; kind: DiaryKind; sources: string[] }

export interface DiaryFileInput {
  day: string;
  kind: DiaryKind;
  articles: DiaryArticle[];
  sources: string[];
  quote?: { text: string; author: string };
  place?: string;
  paragraphs: string[];
  labels: { subtitleFrom: string; disclaimer: string };
}
