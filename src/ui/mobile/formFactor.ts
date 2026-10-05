// Which device the plugin is running on (規劃書 01 §3.1, 06 §9.7). Pure, so
// the routing rules are unit-tested; platform.ts feeds it Obsidian's
// Platform and <body>'s classes.
//
//   phone   — iPhone (Platform.isPhone / body.is-phone): word cards and
//             paragraph discussions open in the bottom sheet (WordSheet),
//             never in the right sidebar, which would cover the article.
//   tablet  — iPad / other mobile: the sidebar, like desktop, but the
//             mobile tap action and touch sizes apply.
//   desktop — everything else.

export type FormFactor = "phone" | "tablet" | "desktop";

export interface PlatformFlags {
  isMobile?: boolean;
  isPhone?: boolean;
  isTablet?: boolean;
}

export interface ClassList {
  contains(cls: string): boolean;
}

// Body classes count too: `app.emulateMobile(true)` on desktop (規劃書 01
// §3.7) switches them, so the phone layout can be tried without a device.
export function formFactorOf(p: PlatformFlags, body?: ClassList | null): FormFactor {
  const has = (cls: string) => !!body?.contains(cls);
  if (p.isPhone || has("is-phone")) return "phone";
  if (p.isMobile || p.isTablet || has("is-mobile") || has("is-tablet")) return "tablet";
  return "desktop";
}

export function isMobileForm(f: FormFactor): boolean {
  return f !== "desktop";
}

// Where a word card / paragraph discussion opens.
export type WordSurface = "sheet" | "sidebar";

export function wordSurface(f: FormFactor): WordSurface {
  return f === "phone" ? "sheet" : "sidebar";
}
