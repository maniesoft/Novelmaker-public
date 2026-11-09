// Sperrdatei neben der Datenbank: zeigt an, dass Novelmaker die Datei gerade benutzt.
// Liegt die Datenbank in Dropbox/OneDrive, wird die Sperrdatei mit synchronisiert – so merkt der
// zweite Rechner, dass die Datenbank noch woanders offen ist (gleichzeitiges Arbeiten führt sonst zu
// Konfliktkopien und verlorenen Änderungen).
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { t } from '@novelmaker/shared';
import { basename, dirname, extname, join } from 'node:path';

interface LockData {
  host: string;
  pid: number;
  since: string;
  heartbeat: string;
}

export interface LockWarning {
  host: string;
  since: string;
  heartbeat: string;
}

/** Herzschlag alle 60 s; eine fremde Sperre gilt 5 Minuten nach dem letzten Herzschlag als verwaist. */
const HEARTBEAT_MS = 60_000;
const STALE_MS = 5 * 60_000;

export class DbLock {
  private timer: ReturnType<typeof setInterval> | null = null;
  private since = new Date().toISOString();
  /** Sperre eines anderen Rechners, die beim Öffnen gefunden wurde. */
  foreign: LockWarning | null = null;

  constructor(readonly dbFile: string) {}

  get file() {
    return `${this.dbFile}.lock`;
  }

  private read(): LockData | null {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as LockData;
    } catch {
      return null;
    }
  }

  private write() {
    const data: LockData = { host: hostname(), pid: process.pid, since: this.since, heartbeat: new Date().toISOString() };
    try {
      writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.warn(t('The lock file could not be written: {error}', { error: (e as Error).message }));
    }
  }

  acquire() {
    if (this.dbFile === ':memory:') return;
    const existing = this.read();
    const fresh = existing && Date.now() - new Date(existing.heartbeat).getTime() < STALE_MS;
    this.foreign = existing && fresh && existing.host !== hostname() ? { host: existing.host, since: existing.since, heartbeat: existing.heartbeat } : null;
    this.write();
    this.timer = setInterval(() => {
      // Hat inzwischen ein anderer Rechner die Sperre übernommen? Dann warnen statt überschreiben.
      const cur = this.read();
      if (cur && cur.host !== hostname() && Date.now() - new Date(cur.heartbeat).getTime() < STALE_MS) {
        this.foreign = { host: cur.host, since: cur.since, heartbeat: cur.heartbeat };
        return;
      }
      this.write();
    }, HEARTBEAT_MS);
    this.timer.unref?.();
  }

  release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const cur = this.read();
    if (cur && cur.host === hostname() && cur.pid === process.pid) {
      try {
        unlinkSync(this.file);
      } catch {
        /* egal */
      }
    }
  }
}

/** Konfliktkopien, die Dropbox/OneDrive neben der Datenbank angelegt haben. */
export function findConflictCopies(dbFile: string): { file: string; modified: string }[] {
  if (dbFile === ':memory:') return [];
  const dir = dirname(dbFile);
  const stem = basename(dbFile, extname(dbFile)).toLowerCase();
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => {
        const l = f.toLowerCase();
        return l.startsWith(stem) && l !== basename(dbFile).toLowerCase() && /conflict|konflikt|kopie|copy|-\w+-pc\b|\(\d+\)/.test(l) && !/\.(lock|journal)$|-journal$|-wal$|-shm$/.test(l);
      })
      .map((f) => ({ file: join(dir, f), modified: statSync(join(dir, f)).mtime.toISOString() }));
  } catch {
    return [];
  }
}
