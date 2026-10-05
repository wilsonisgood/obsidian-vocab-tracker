import type { VocabData } from "../../core/model/entry";
import type { Family } from "../../core/model/family";
import type { Thread } from "../../core/model/thread";
import type { TriviaItem } from "../../core/model/trivia";
import type { StoragePort } from "../../core/ports";

// Ports for 從備份還原 (規劃書 06 §4.5 第 6 點). Kept here until the
// integration moves them to core/ports.ts (07 §2 第 3 點).

// The plugin folder's backup/ directory, next to the shards StoragePort
// already reads and writes. `name` is a bare file name ("full-….json"),
// never a path — implementations reject anything else.
export interface BackupStoragePort extends StoragePort {
  // Where backups live, vault-relative (".obsidian/plugins/vocab-tracker/backup"),
  // for telling the user where a file went.
  readonly backupFolder: string;
  // File names of every *.json in the backup folder (empty when it doesn't exist).
  listBackups(): Promise<string[]>;
  // Parsed JSON of one backup; null when missing or unreadable.
  readBackup(name: string): Promise<unknown | null>;
  // Writes a new backup and resolves to its vault-relative path.
  writeBackup(name: string, data: unknown): Promise<string>;
  // Every shard currently on disk, parsed: "data" (data.json) and each
  // store/<name>.json under its name — unknown names included, so a
  // backup taken by this version keeps shards a newer version added.
  readAllShards(): Promise<Record<string, unknown>>;
}

// Which records a restore changed, so the plugin can refresh the notes it
// exports (word pages, .ai.md, 冷知識.md).
// Threads / families / trivia come as the written records (tombstones
// included), since a deleted one can't be looked up by id afterwards.
export interface RestoreChanges {
  entryIds: string[];
  threads: Thread[];
  families: Family[];
  trivia: TriviaItem[];
}

// The plugin side of a restore (main.ts implements it).
export interface BackupHost {
  // Lands every debounced write (VocabStore, threads, learn, reviews) so
  // the disk is the whole current state before it is backed up.
  flush(): Promise<void>;
  // After the restored shards are on disk: the services that keep shards
  // in memory read them again (threads, learn, reviews, imports).
  reload(): Promise<void>;
  // data.json's restored content becomes the in-memory library.
  applyData(data: VocabData): void;
  // Last step: redraw the sidebar, reading views and code blocks, and
  // refresh the exported notes of what changed.
  restored(changes: RestoreChanges): void;
}
