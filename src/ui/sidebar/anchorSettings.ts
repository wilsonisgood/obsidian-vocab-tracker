import type { AnchorMode } from "../../core/ports";
import { trailingBlockId } from "../../core/text/blockId";

// Paragraph anchor settings (規劃書 06 §5.1). Meant to become a settings
// section `anchors` in core/model/settings.ts (with its own updatedAt, and
// "anchors" added to SETTINGS_SECTIONS) at integration; until then it's
// read here as an optional, untyped field so nothing else has to change.

export interface AnchorSettings {
  // "hash" = 設定「不要修改我的筆記」.
  mode: AnchorMode;
  // The one-time explanation before the first ` ^vt-…` is written.
  blockIdNoticeSeen: boolean;
  updatedAt?: string;
}

export const DEFAULT_ANCHOR_SETTINGS: AnchorSettings = { mode: "block", blockIdNoticeSeen: false };

type WithAnchors = { anchors?: Partial<AnchorSettings> };

export function resolveAnchorSettings(settings: object | undefined): AnchorSettings {
  const raw = (settings as WithAnchors | undefined)?.anchors;
  const mode: AnchorMode = raw?.mode === "hash" ? "hash" : "block";
  const out: AnchorSettings = { mode, blockIdNoticeSeen: raw?.blockIdNoticeSeen === true };
  if (typeof raw?.updatedAt === "string") out.updatedAt = raw.updatedAt;
  return out;
}

// Use inside store.updateSettings(s => patchAnchorSettings(s, {...})).
// Keeps unknown keys a newer version may have written.
export function patchAnchorSettings(settings: object, patch: Partial<Omit<AnchorSettings, "updatedAt">>): void {
  const s = settings as WithAnchors;
  s.anchors = { ...(s.anchors ?? {}), ...resolveAnchorSettings(settings), ...patch };
}

// Show the explanation before this paragraph's first question? Only when a
// block id would actually be written: block mode, not seen yet, and the
// paragraph doesn't already end in a block id (which is reused as-is).
export function needsBlockIdNotice(s: AnchorSettings, sectionText: string): boolean {
  return s.mode === "block" && !s.blockIdNoticeSeen && !trailingBlockId(sectionText);
}
