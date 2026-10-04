import type { NoteReaderPort } from "../../core/ports";

// Vault access for paragraph anchors (規劃書 06 §5.1). Lives here until
// integration moves it into core/ports.ts; the Obsidian implementation
// (platform/ObsidianVault.ts) is written at integration time too.

export interface ParagraphVaultPort extends NoteReaderPort {
  // Atomic read-modify-write of a note — Obsidian's `vault.process(file,
  // fn)`. `fn` receives the note's current text and returns the new text;
  // whatever it throws rejects the call and leaves the note untouched.
  // Rejects when the note doesn't exist. Resolves to the text written.
  process(path: string, fn: (content: string) => string): Promise<string>;
  // True when any note in the vault already has a block with this id
  // (`metadataCache.getFileCache(f)?.blocks?.[id]` over the markdown
  // files). The note being edited is also checked against its fresh text
  // inside `process`, so a stale cache can't cause a duplicate there.
  blockIdTaken(id: string): boolean;
}

// "block": write ` ^vt-xxxxxx` into the note the first time a paragraph
// is discussed. "hash": never touch the note (設定「不要修改我的筆記」) —
// the anchor is the paragraph's text hash and breaks when the text changes.
export type AnchorMode = "block" | "hash";
