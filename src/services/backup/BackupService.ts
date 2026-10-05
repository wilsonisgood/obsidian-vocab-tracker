import {
  fullBackupFile,
  fullBackupName,
  isBackupName,
  parseBackup,
  snapshotOf,
  stampFromName,
  summarize,
  type BackupReason,
  type BackupSummary,
  type ParsedBackup,
} from "./format";
import { currentShard, planRestore, restoreStamp, type PlannedShard, type RestoreCounts, type RestorePlan } from "./restorePlan";
import type { BackupHost, BackupStoragePort } from "../../core/ports";

// 備份與還原 (規劃書 06 §4.5 第 6 點): lists the backup folder, writes
// full backups (data.json + store/), and restores one — always saving the
// current state first. The merge-safe part of a restore is restorePlan.ts.

export interface BackupItem {
  name: string;
  path: string;
  // "data" = data.json only (the migration backup); "full" = everything.
  kind: ParsedBackup["kind"] | "unreadable";
  createdAt: string | null;
  reason: BackupReason;
  summary: BackupSummary | null;
}

export interface RestorePreview {
  item: BackupItem;
  counts: RestoreCounts;
  missing: RestorePlan["missing"];
  // Where the automatic backup of the current state goes (the folder;
  // the file name is only fixed when it is written).
  safetyFolder: string;
}

export interface RestoreResult {
  // Vault-relative path of the backup of the state before the restore.
  safetyPath: string;
  counts: RestoreCounts;
  missing: RestorePlan["missing"];
}

export interface BackupServiceDeps {
  storage: BackupStoragePort;
  host: BackupHost;
  clock?: () => Date;
}

export class BackupError extends Error {
  constructor(
    readonly code: "busy" | "unreadable" | "safety-failed",
    message: string
  ) {
    super(message);
  }
}

export class BackupService {
  private clock: () => Date;
  private busy = false;

  constructor(private deps: BackupServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  get folder(): string {
    return this.deps.storage.backupFolder;
  }

  private pathOf(name: string): string {
    return `${this.folder}/${name}`;
  }

  // Newest first. Files that aren't backups (or can't be read) are listed
  // as "unreadable" so the user sees why they can't be restored.
  async list(): Promise<BackupItem[]> {
    const names = (await this.deps.storage.listBackups()).filter(isBackupName);
    const items = await Promise.all(names.map((name) => this.item(name)));
    const time = (i: BackupItem) => (i.createdAt ? new Date(i.createdAt).getTime() : 0);
    return items.sort((a, b) => time(b) - time(a) || b.name.localeCompare(a.name));
  }

  private async load(name: string): Promise<ParsedBackup | null> {
    if (!isBackupName(name)) return null;
    let raw: unknown = null;
    try {
      raw = await this.deps.storage.readBackup(name);
    } catch (e) {
      console.error(`Vocab Tracker: couldn't read backup ${name}`, e);
    }
    return raw === null ? null : parseBackup(name, raw);
  }

  private async item(name: string): Promise<BackupItem> {
    const parsed = await this.load(name);
    const base = { name, path: this.pathOf(name) };
    if (!parsed) return { ...base, kind: "unreadable", createdAt: stampFromName(name), reason: "unknown", summary: null };
    return { ...base, kind: parsed.kind, createdAt: parsed.createdAt, reason: parsed.reason, summary: summarize(parsed.snapshot) };
  }

  // 立即備份: everything on disk right now. Resolves to the file's path.
  async create(): Promise<string> {
    if (this.busy) throw new BackupError("busy", "a backup or restore is already running");
    this.busy = true;
    try {
      await this.deps.host.flush();
      return await this.writeFull("manual");
    } finally {
      this.busy = false;
    }
  }

  private async writeFull(
    reason: "manual" | "before-restore",
    restoring?: string,
    shards?: Record<string, unknown>
  ): Promise<string> {
    const now = this.clock().toISOString();
    shards ??= await this.deps.storage.readAllShards();
    return this.deps.storage.writeBackup(fullBackupName(now, reason), fullBackupFile(shards, now, reason, restoring));
  }

  // What restoring `name` would do, for the confirmation screen. Nothing
  // is written. Counts don't depend on removeExtras (`extra` is the number
  // that would be kept or deleted).
  async preview(name: string): Promise<RestorePreview> {
    const { backup, current } = await this.inputs(name);
    const plan = planRestore(current, backup.snapshot, { removeExtras: false, now: this.clock().toISOString() });
    return {
      item: await this.item(name),
      counts: plan.counts,
      missing: plan.missing,
      safetyFolder: this.folder,
    };
  }

  private async inputs(name: string) {
    const backup = await this.load(name);
    if (!backup) throw new BackupError("unreadable", `backup ${name} can't be read`);
    await this.deps.host.flush();
    const raw = await this.deps.storage.readAllShards();
    return { backup, raw, current: snapshotOf(raw) };
  }

  // 1. lands pending writes; 2. backs up the current state (abort if that
  // fails — nothing has changed yet); 3. writes the rebased shards
  // (restorePlan.ts); 4. the services reload them, data.json goes into the
  // store, everything redraws.
  async restore(name: string, opts: { removeExtras: boolean }): Promise<RestoreResult> {
    if (this.busy) throw new BackupError("busy", "a backup or restore is already running");
    this.busy = true;
    try {
      const { backup, raw, current } = await this.inputs(name);

      let safetyPath: string;
      try {
        safetyPath = await this.writeFull("before-restore", name, raw);
      } catch (e) {
        throw new BackupError("safety-failed", `couldn't back up the current data: ${String(e)}`);
      }

      const now = restoreStamp(current, this.clock());
      const plan = planRestore(current, backup.snapshot, { removeExtras: opts.removeExtras, now });
      for (const [shard, content] of Object.entries(plan.shards) as [PlannedShard, unknown][]) {
        if (JSON.stringify(content) === JSON.stringify(currentShard(current, shard))) continue;
        await this.deps.storage.writeShard(shard, content);
      }

      await this.deps.host.reload();
      if (plan.data) this.deps.host.applyData(plan.data);
      this.deps.host.restored(plan.changes);
      return { safetyPath, counts: plan.counts, missing: plan.missing };
    } finally {
      this.busy = false;
    }
  }
}
