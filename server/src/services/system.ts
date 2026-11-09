// Speicherort der Datenbank, Sicherungsordner, Sperrdatei, Beenden.
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { t } from '@novelmaker/shared';
import { backupDir, DB_FILENAME, DEFAULT_BACKUP_DIR, DEFAULT_DB_PATH, readConfig, writeConfig } from '../config';
import { DbHandle, HttpError, openDb } from '../db';
import { seedBuiltins } from '../repo/prompts';
import { getAppSettings } from '../repo/settings';
import { createBackup, listBackups, newBackupPath, vacuumInto, type BackupInfo } from './backup';
import { DbLock, findConflictCopies, type LockWarning } from './lock';

export interface SystemInfo {
  dbPath: string;
  dbDir: string;
  defaultDbDir: string;
  backupDir: string;
  defaultBackupDir: string;
  host: string;
  platform: string;
  lockWarning: LockWarning | null;
  conflicts: { file: string; modified: string }[];
  suggestions: { label: string; path: string }[];
  backups: BackupInfo[];
}

export interface FolderCheck {
  folder: string;
  file: string;
  exists: boolean;
  isCurrent: boolean;
  modified?: string;
  size?: number;
  novels?: number;
  titles?: string[];
  lockWarning?: LockWarning | null;
  error?: string;
}

export type MoveMode = 'move' | 'use-existing' | 'overwrite';

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/** Typische Sync-Ordner (OneDrive, Dropbox) als Vorschläge. */
function syncFolders(): { label: string; path: string }[] {
  const out: { label: string; path: string }[] = [];
  const add = (label: string, p: string | undefined) => {
    if (!p || !existsSync(p)) return;
    const target = join(p, 'Novelmaker');
    if (!out.some((o) => o.path.toLowerCase() === target.toLowerCase())) out.push({ label, path: target });
  };
  const { OneDrive, OneDriveConsumer, OneDriveCommercial } = process.env;
  add('OneDrive', OneDriveConsumer);
  add(t('OneDrive (Work)'), OneDriveCommercial);
  add('OneDrive', OneDrive);
  for (const base of [process.env.APPDATA, process.env.LOCALAPPDATA]) {
    if (!base) continue;
    try {
      const info = JSON.parse(readFileSync(join(base, 'Dropbox', 'info.json'), 'utf8')) as Record<string, { path?: string }>;
      for (const [k, v] of Object.entries(info)) add(k === 'business' ? 'Dropbox (Business)' : 'Dropbox', v.path);
    } catch {
      /* kein Dropbox */
    }
  }
  add('Dropbox', join(homedir(), 'Dropbox'));
  return out;
}

function readLock(file: string): LockWarning | null {
  try {
    const l = JSON.parse(readFileSync(`${file}.lock`, 'utf8')) as LockWarning & { host: string };
    const fresh = Date.now() - new Date(l.heartbeat).getTime() < 5 * 60_000;
    return fresh && l.host !== hostname() ? { host: l.host, since: l.since, heartbeat: l.heartbeat } : null;
  } catch {
    return null;
  }
}

function removeDbFiles(file: string) {
  for (const f of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`]) if (existsSync(f)) unlinkSync(f);
}

export class SystemControl {
  lock: DbLock;
  /** Wird beim Beenden aufgerufen (Sicherung, Sperre lösen, Prozess beenden). */
  onShutdown: (() => Promise<void>) | null = null;

  constructor(
    readonly handle: DbHandle,
    public dbFile: string,
    public hasRunningJobs: () => boolean = () => false,
  ) {
    this.lock = new DbLock(dbFile);
  }

  get db() {
    return this.handle.db;
  }

  info(): SystemInfo {
    return {
      dbPath: this.dbFile,
      dbDir: dirname(this.dbFile),
      defaultDbDir: dirname(DEFAULT_DB_PATH),
      backupDir: backupDir(),
      defaultBackupDir: DEFAULT_BACKUP_DIR,
      host: hostname(),
      platform: process.platform,
      lockWarning: this.lock.foreign,
      conflicts: findConflictCopies(this.dbFile),
      suggestions: syncFolders(),
      backups: listBackups(),
    };
  }

  checkFolder(folderIn: string): FolderCheck {
    const folder = resolve(folderIn.trim());
    const file = join(folder, DB_FILENAME);
    const base: FolderCheck = { folder, file, exists: existsSync(file), isCurrent: resolve(file).toLowerCase() === resolve(this.dbFile).toLowerCase() };
    if (!base.exists || base.isCurrent) return base;
    try {
      const st = statSync(file);
      const other = new Database(file, { readonly: true, fileMustExist: true });
      try {
        const titles = (other.prepare('SELECT title FROM novels ORDER BY updated_at DESC LIMIT 8').all() as { title: string }[]).map((r) => r.title);
        const novels = (other.prepare('SELECT COUNT(*) AS n FROM novels').get() as { n: number }).n;
        return { ...base, modified: st.mtime.toISOString(), size: st.size, novels, titles, lockWarning: readLock(file) };
      } finally {
        other.close();
      }
    } catch (e) {
      return { ...base, error: t('The existing file isn’t a readable Novelmaker database: {error}', { error: (e as Error).message }) };
    }
  }

  /** Datenbank an einen anderen Ort legen bzw. eine vorhandene dort verwenden – ohne Neustart. */
  changeDbLocation(folderIn: string, mode: MoveMode): { dbPath: string; note: string } {
    if (this.hasRunningJobs()) throw new HttpError(409, t('Wait for the running background jobs to finish, or cancel them first.'));
    const check = this.checkFolder(folderIn);
    if (check.isCurrent) throw new HttpError(400, t('The database is already there.'));
    if (check.error && mode === 'use-existing') throw new HttpError(400, check.error);
    if (check.lockWarning && mode !== 'move')
      throw new HttpError(409, t('The database in this folder is currently open on “{host}”. Quit Novelmaker there first.', { host: check.lockWarning.host }));
    if (mode === 'move' && check.exists) throw new HttpError(400, t('There’s already a database there — please choose “use” or “overwrite”.'));
    if (mode !== 'move' && !check.exists) throw new HttpError(400, t('There’s no database there.'));
    mkdirSync(check.folder, { recursive: true });
    const keep = getAppSettings(this.db).backupsToKeep;
    const oldFile = this.dbFile;
    let note = '';

    if (mode === 'use-existing') {
      createBackup(this.db, keep, 'vor-wechsel');
      note = t('The previous database stays at {file}.', { file: oldFile });
    } else {
      if (mode === 'overwrite') {
        // die vorhandene Datei vorher in den Sicherungsordner kopieren
        const src = new Database(check.file, { fileMustExist: true });
        try {
          vacuumInto(src, newBackupPath('ueberschrieben'));
        } finally {
          src.close();
        }
        removeDbFiles(check.file);
      }
      vacuumInto(this.db, check.file);
    }

    const next = openDb(check.file);
    seedBuiltins(next);
    this.lock.release();
    this.handle.swap(next);
    this.dbFile = check.file;
    writeConfig({ dbDir: resolve(check.folder).toLowerCase() === dirname(DEFAULT_DB_PATH).toLowerCase() ? undefined : check.folder });
    this.lock = new DbLock(check.file);
    this.lock.acquire();

    if (mode !== 'use-existing') {
      // alte Datei nicht löschen, aber eindeutig als veraltet kennzeichnen
      const renamed = join(dirname(oldFile), `novelmaker-umgezogen-${stamp()}.db`);
      try {
        renameSync(oldFile, renamed);
        note = t('The old file was renamed to {file}.', { file: renamed });
      } catch {
        note = t('The old file is still at {file}.', { file: oldFile });
      }
    }
    return { dbPath: check.file, note };
  }

  setBackupDir(dir: string | null): string {
    if (dir) {
      const abs = resolve(dir.trim());
      mkdirSync(abs, { recursive: true });
      writeConfig({ backupDir: abs.toLowerCase() === DEFAULT_BACKUP_DIR.toLowerCase() ? undefined : abs });
    } else writeConfig({ backupDir: undefined });
    return backupDir();
  }

  /** Nativer Ordner-Dialog (nur Windows). Gibt null zurück, wenn abgebrochen. */
  browseFolder(initial?: string): Promise<string | null> {
    if (process.platform !== 'win32') return Promise.reject(new HttpError(501, t('The folder dialog is only available on Windows — please type in the path.')));
    const start = initial && existsSync(initial) ? initial : '';
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.Form
$f.TopMost = $true; $f.ShowInTaskbar = $false; $f.WindowState = 'Minimized'
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = $env:NM_TITLE
$d.ShowNewFolderButton = $true
$d.SelectedPath = $env:NM_START
if ($d.ShowDialog($f) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output $d.SelectedPath }`;
    return new Promise((res, rej) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { env: { ...process.env, NM_START: start, NM_TITLE: t('Choose a folder for Novelmaker') }, windowsHide: true, timeout: 10 * 60_000 },
        (err, stdout) => {
          if (err && !stdout) return rej(new HttpError(500, t('Folder dialog failed: {error}', { error: err.message })));
          const p = stdout.trim().split(/\r?\n/).pop()?.trim();
          res(p || null);
        },
      );
    });
  }

  /** Ordner im Explorer zeigen. */
  reveal(path: string) {
    const target = existsSync(path) ? path : dirname(path);
    if (process.platform === 'win32') spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
  }

  config() {
    return readConfig();
  }
}
