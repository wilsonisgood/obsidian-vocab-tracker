import { t } from "../../core/i18n";
import type { BreakdownPart, WordBreakdown } from "../../core/model/morpheme";

// Word-breakdown strand (規劃書 09 §7, w9-rules.md「strand（DU）」): shared
// by the vocab-dna block, the Galaxy node detail (GB) and the word page
// header (WP) — every caller gets the same colored blocks for free.

const TYPE_LABEL: Record<BreakdownPart["type"], string> = {
  prefix: "字首",
  root: "字根",
  suffix: "字尾",
  inflection: "詞形變化",
};

export interface StrandOptions {
  // Only parts with a morphemeId become buttons (inflection parts never
  // do, even with this set — they're not a morpheme record to jump to).
  onPart?(part: BreakdownPart): void;
}

export function renderStrand(parent: HTMLElement, b: WordBreakdown, opts?: StrandOptions): HTMLElement {
  const strand = parent.createDiv({ cls: "vt-dna-strand" });
  strand.setAttr("aria-label", `${b.word} 拆解`);
  if (b.status === "none" || b.parts.length === 0) {
    strand.createDiv({ cls: "vt-dna-strand-empty", text: t("dna.strand.none") });
    return strand;
  }
  for (const part of b.parts) {
    const clickable = !!opts?.onPart && part.type !== "inflection" && !!part.morphemeId;
    const base = clickable
      ? strand.createEl("button", { cls: ["vt-dna-base", `t-${part.type}`], attr: { type: "button" } })
      : strand.createDiv({ cls: ["vt-dna-base", `t-${part.type}`] });
    base.createSpan({ cls: "vt-dna-base-text", text: part.text });
    const meaning = part.meaningZh ? `${TYPE_LABEL[part.type]} · ${part.meaningZh}` : TYPE_LABEL[part.type];
    base.createSpan({ cls: "vt-dna-base-meaning", text: meaning });
    if (clickable) base.addEventListener("click", () => opts!.onPart!(part));
  }
  return strand;
}
