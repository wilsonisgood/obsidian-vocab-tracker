import { galaxyFillHeight, galaxyViewBottom } from "./galaxyHeight";

// 1010-2 W#4: keep an embedded Galaxy window stretched to the bottom of what
// the user can actually see. Why the wave-12 version (families.ts
// fitGalaxyHeight) still left a gap: it measured once, when the block was
// drawn, and only re-measured when the scroller itself resized. But (a) the
// block can be drawn before it is attached (closest() finds no scroller, so
// it fell back to window metrics and watched document.body, which never
// resizes), (b) content above the window (toolbar, headings, fonts, other
// blocks) keeps changing height after that first measure, and (c) on iPhone
// the scroller's bottom is under the nav bar / beyond the visual viewport.
// This re-measures on every layout change and uses the real visible bottom.

const MARGIN = 16;

function measure(host: HTMLElement): number | null {
  const scroller = (host.closest(".markdown-preview-view") ?? host.closest(".view-content")) as HTMLElement | null;
  if (!scroller) return null;
  const hr = host.getBoundingClientRect();
  const sr = scroller.getBoundingClientRect();
  if (!hr.width && !hr.height) return null; // detached or hidden: measure later
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const vv = win?.visualViewport;
  const nav = doc.querySelector(".mobile-navbar") as HTMLElement | null;
  const navTop = nav ? nav.getBoundingClientRect().top : null;
  const bottom = galaxyViewBottom([
    sr.bottom,
    vv ? vv.offsetTop + vv.height : win?.innerHeight,
    navTop && navTop > sr.top ? navTop : null,
  ]);
  // Position inside the page as if scrolled to the top: stable while scrolling.
  const pageTop = hr.top - sr.top + scroller.scrollTop;
  return galaxyFillHeight(bottom - sr.top - MARGIN, pageTop);
}

// `svg` is what the caller keeps across redraws (families.ts builds a new
// .vt-gx-graph host on every render and re-appends the same svg), so the host
// is looked up from it every time instead of captured once.
export function autoFitGalaxy(svg: SVGSVGElement): () => void {
  let last = -1;
  let watched: Element | null = null;
  const win = svg.ownerDocument.defaultView;
  const timers: number[] = [];
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => apply()) : null;
  const hostOf = () => {
    const h = svg.parentElement;
    return h && h.classList.contains("vt-gx-graph") ? h : null;
  };
  function watch(host: HTMLElement): void {
    const scroller = host.closest(".markdown-preview-view") ?? host.closest(".view-content");
    if (!ro || !scroller || scroller === watched) return;
    ro.disconnect();
    watched = scroller;
    ro.observe(scroller);
    if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
    ro.observe(svg);
  }
  function apply(): void {
    const host = hostOf();
    if (!host) return;
    watch(host);
    const h = measure(host);
    if (h === null) return;
    // A fresh host (redraw) has no inline height yet even if h is unchanged.
    if (h === last && host.style.getPropertyValue("height") === `${h}px`) return;
    last = h;
    host.style.setProperty("height", `${h}px`, "important");
    host.style.setProperty("min-height", `${h}px`, "important");
  }
  const later = () => {
    apply();
    if (!win) return;
    timers.push(win.requestAnimationFrame(apply), win.setTimeout(apply, 300), win.setTimeout(apply, 1000));
  };
  later();
  ro?.observe(svg);
  win?.addEventListener("resize", apply);
  win?.addEventListener("orientationchange", later);
  win?.visualViewport?.addEventListener("resize", apply);
  return () => {
    ro?.disconnect();
    win?.removeEventListener("resize", apply);
    win?.removeEventListener("orientationchange", later);
    win?.visualViewport?.removeEventListener("resize", apply);
    for (const id of timers) {
      win?.clearTimeout(id);
      win?.cancelAnimationFrame(id);
    }
  };
}
