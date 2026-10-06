import { MarkdownRenderChild, setIcon, type MarkdownPostProcessorContext, type MarkdownSectionInformation } from "obsidian";
import { t } from "../../core/i18n";
import { shouldSplitList, splitListItems } from "../../core/text/listItems";
import type { SectionRef } from "../../services/anchors/ParagraphAnchorService";
import type { ParagraphIndex } from "../../services/anchors/ParagraphIndex";

// Reading-mode paragraph badges (規劃書 06 §9.5, design D1): `✦ n` beside
// a paragraph that has discussions, a `✦` that only shows on hover beside
// one that doesn't (always shown, smaller, on mobile). Clicking opens the
// paragraph's discussion in the sidebar — on iPhone it's the bottom sheet
// instead (main.ts routes it through WordSurfaces).
//
// The post-processor only does an O(1) ParagraphIndex lookup — no vault
// reads. The badge is appended to the section's own element, next to its
// <p>/<ul>/<blockquote>, never into the paragraph's text: the exam-word
// underliner (examHighlight.ts) wraps text nodes in span.vt-exam-word and
// mustn't see the badge, nor the badge it.
//
// Live badges are tracked per note so a count change (a question asked,
// a sync) updates them in place, without re-rendering the reading view.
//
// Obsidian's reading mode renders a whole list as one section — one
// post-processor call, one `getSectionInfo(el)` spanning every item — even
// after a long list is split into separate discussion anchors
// (services/anchors/sections.ts, §5.1 feedback). So when that split
// applies here too, this draws one badge per top-level `<li>` instead of
// one for the whole `<ul>`/`<ol>`, using the section's own line math
// (core/text/listItems.ts, the same rule noteSections uses) to work out
// which lines — and which SectionRef to open — each `<li>` corresponds to.

export const BADGE_CLS = "vt-pbadge";
export const BADGE_HOST_CLS = "vt-pbadge-host";

// Section elements that get a badge: paragraphs, lists and quotes (§5.1).
// Callouts render as <div class="callout">, headings/code/tables have their
// own tags, so the first child's tag is enough.
const ANCHORABLE_TAGS = new Set(["P", "UL", "OL", "BLOCKQUOTE"]);

export function isAnchorableTag(tagName: string | undefined): boolean {
  return !!tagName && ANCHORABLE_TAGS.has(tagName.toUpperCase());
}

// getSectionInfo hands every section of a note the whole note's text. Split
// it once per note render instead of once per section (which would make a
// long note quadratic); `===` on the same string object is a pointer check.
export class SectionLines {
  private text: string | null = null;
  private lines: string[] = [];

  slice(info: Pick<MarkdownSectionInformation, "text" | "lineStart" | "lineEnd">): string {
    if (info.text !== this.text) {
      this.text = info.text;
      this.lines = info.text.replace(/\r\n?/g, "\n").split("\n");
    }
    return this.lines.slice(info.lineStart, info.lineEnd + 1).join("\n");
  }
}

export interface ParagraphBadgeDeps {
  index: Pick<ParagraphIndex, "count" | "events">;
  // Open (or start) this paragraph's discussion in the sidebar (on iPhone
  // the bottom sheet).
  onOpen(ref: SectionRef): void;
  // Show the hover-only `✦` on paragraphs without discussions. main.ts
  // passes "AI is enabled", so users who don't use AI see no new chrome.
  showGhost(): boolean;
}

interface BadgeHandle {
  ref: SectionRef;
  host: HTMLElement;
  badge: HTMLElement | null;
}

export type BadgeState = { kind: "count"; count: number } | { kind: "ghost"; quiet: boolean };

// What a section's badge should look like. "quiet" ghosts stay hidden even
// on hover; they only appear while a discussion is being rebound
// (body.vt-rebinding), so any paragraph can be picked.
export function badgeState(count: number, showGhost: boolean): BadgeState {
  return count > 0 ? { kind: "count", count } : { kind: "ghost", quiet: !showGhost };
}

export class ParagraphBadges {
  private live = new Map<string, Set<BadgeHandle>>();
  private lines = new SectionLines();

  constructor(private deps: ParagraphBadgeDeps) {}

  // Keeps live badges in sync with the index. Returns the unsubscribe.
  attach(): () => void {
    return this.deps.index.events.on("paragraph-index:change", ({ paths }) => this.refresh(paths));
  }

  // Re-draws the live badges of these notes (all notes when omitted), e.g.
  // after the AI on/off switch changes whether ghosts show.
  refresh(paths?: readonly string[]): void {
    const targets = paths ?? [...this.live.keys()];
    for (const path of targets) {
      for (const h of this.live.get(path) ?? []) this.draw(h);
    }
  }

  // registerMarkdownPostProcessor(badges.process)
  readonly process = (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    const first = el.firstElementChild;
    if (!isAnchorableTag(first?.tagName)) return;
    const info = ctx.getSectionInfo(el);
    if (!info) return;
    const text = this.lines.slice(info);
    const handles = this.handlesFor(ctx.sourcePath, el, first, info.lineStart, info.lineEnd, text);
    for (const handle of handles) {
      this.draw(handle);
      this.track(handle);
    }

    // Unloaded when reading view drops or re-renders this section.
    const child = new MarkdownRenderChild(el);
    child.register(() => handles.forEach((h) => this.untrack(h)));
    ctx.addChild(child);
  };

  // One handle per top-level `<li>` when this list was split (see class
  // comment); otherwise the usual single handle for the whole section
  // element. Falls back to the whole list if the DOM's `<li>` count
  // doesn't match the split — e.g. a task-list item rendered with extra
  // wrapper elements — rather than guessing at a mismatched mapping.
  private handlesFor(
    path: string,
    el: HTMLElement,
    first: Element | null | undefined,
    lineStart: number,
    lineEnd: number,
    text: string
  ): BadgeHandle[] {
    const whole = (): BadgeHandle[] => [{ ref: { path, lineStart, lineEnd, text }, host: el, badge: null }];
    const tag = first?.tagName?.toUpperCase();
    if (tag !== "UL" && tag !== "OL") return whole();
    const lines = text.split("\n");
    if (!shouldSplitList(lines)) return whole();
    const items = splitListItems(lines, lineStart);
    const lis = Array.from(first?.children ?? []).filter((c) => c.tagName?.toUpperCase() === "LI");
    if (lis.length !== items.length) return whole();
    return items.map((item, i) => ({
      ref: { path, lineStart: item.lineStart, lineEnd: item.lineEnd, text: item.text },
      host: lis[i] as unknown as HTMLElement,
      badge: null,
    }));
  }

  private track(h: BadgeHandle): void {
    let set = this.live.get(h.ref.path);
    if (!set) {
      set = new Set();
      this.live.set(h.ref.path, set);
    }
    set.add(h);
  }

  private untrack(h: BadgeHandle): void {
    const set = this.live.get(h.ref.path);
    if (!set) return;
    set.delete(h);
    if (!set.size) this.live.delete(h.ref.path);
  }

  private draw(h: BadgeHandle): void {
    const state = badgeState(this.deps.index.count(h.ref.path, h.ref.text), this.deps.showGhost());
    let badge = h.badge;
    if (!badge) {
      h.host.addClass(BADGE_HOST_CLS);
      badge = h.badge = h.host.createSpan({ cls: BADGE_CLS });
      badge.setAttr("role", "button");
      badge.setAttr("tabindex", "0");
      const open = (e: Event) => {
        e.preventDefault();
        // Keeps main.ts's reading-mode word click (document listener) from
        // opening its "add word" menu too.
        e.stopPropagation();
        this.deps.onOpen(h.ref);
      };
      badge.addEventListener("click", open);
      badge.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open(e);
      });
      setIcon(badge.createSpan({ cls: "vt-pbadge-icon" }), "sparkles");
      badge.createSpan({ cls: "vt-pbadge-count" });
    }
    const countEl = badge.querySelector<HTMLElement>(".vt-pbadge-count");
    badge.toggleClass("has-count", state.kind === "count");
    badge.toggleClass("is-ghost", state.kind === "ghost");
    badge.toggleClass("is-quiet", state.kind === "ghost" && state.quiet);
    countEl?.setText(state.kind === "count" ? String(state.count) : "");
    const label = state.kind === "count" ? t("paragraph.badge.count", { n: state.count }) : t("paragraph.badge.open");
    badge.setAttr("aria-label", label);
  }
}
