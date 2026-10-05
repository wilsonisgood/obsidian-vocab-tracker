import { MarkdownRenderChild, setIcon, type MarkdownPostProcessorContext, type MarkdownSectionInformation } from "obsidian";
import type { SectionRef } from "../../services/anchors/ParagraphAnchorService";
import type { ParagraphIndex } from "../../services/anchors/ParagraphIndex";
import { L } from "../sidebar/strings";

// Reading-mode paragraph badges (規劃書 06 §9.5, design D1): `✦ n` beside
// a paragraph that has discussions, a `✦` that only shows on hover beside
// one that doesn't (always shown, smaller, on mobile). Clicking opens the
// paragraph's discussion in the sidebar.
//
// The post-processor only does an O(1) ParagraphIndex lookup — no vault
// reads. The badge is appended to the section's own element, next to its
// <p>/<ul>/<blockquote>, never into the paragraph's text: the exam-word
// underliner (examHighlight.ts) wraps text nodes in span.vt-exam-word and
// mustn't see the badge, nor the badge it.
//
// Live badges are tracked per note so a count change (a question asked,
// a sync) updates them in place, without re-rendering the reading view.

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
  // Open (or start) this paragraph's discussion in the sidebar.
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
    if (!isAnchorableTag(el.firstElementChild?.tagName)) return;
    const info = ctx.getSectionInfo(el);
    if (!info) return;
    const ref: SectionRef = {
      path: ctx.sourcePath,
      lineStart: info.lineStart,
      lineEnd: info.lineEnd,
      text: this.lines.slice(info),
    };
    const handle: BadgeHandle = { ref, host: el, badge: null };
    this.draw(handle);
    this.track(handle);

    // Unloaded when reading view drops or re-renders this section.
    const child = new MarkdownRenderChild(el);
    child.register(() => this.untrack(handle));
    ctx.addChild(child);
  };

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
    const label = state.kind === "count" ? L("paragraph.badge.count", { n: state.count }) : L("paragraph.badge.open");
    badge.setAttr("aria-label", label);
  }
}
