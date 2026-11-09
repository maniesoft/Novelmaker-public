// Lokale Konfiguration dieses Rechners (liegt NICHT in der Datenbank, weil sie bestimmt, welche Datenbank geöffnet wird).
// Datei: <Datenordner>/config.json – der Datenordner ist standardmäßig data/ im Programmordner (NOVELMAKER_DATA überschreibt).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(here, '..', '..');
export const DATA_DIR = process.env.NOVELMAKER_DATA ? resolve(process.env.NOVELMAKER_DATA) : join(ROOT_DIR, 'data');
export const DB_FILENAME = 'novelmaker.db';
export const DEFAULT_DB_PATH = join(DATA_DIR, DB_FILENAME);
export const DEFAULT_BACKUP_DIR = join(DATA_DIR, 'backups');
const CONFIG_PATH = join(DATA_DIR, 'config.json');

export interface LocalConfig {
  /** Ordner, in dem novelmaker.db liegt (z. B. in Dropbox oder OneDrive). Leer = Standard. */
  dbDir?: string;
  /** Ordner für Sicherungen. Leer = Standard. */
  backupDir?: string;
}

export function readConfig(): LocalConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    const c = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as LocalConfig;
    return c && typeof c === 'object' ? c : {};
  } catch {
    return {};
  }
}

export function writeConfig(patch: Partial<LocalConfig>): LocalConfig {
  const next = { ...readConfig(), ...patch };
  for (const k of Object.keys(next) as (keyof LocalConfig)[]) if (!next[k]) delete next[k];
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${CONFIG_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  renameSync(tmp, CONFIG_PATH);
  return next;
}

const clean = (p: string | undefined) => (p && p.trim() && isAbsolute(p.trim()) ? resolve(p.trim()) : null);

/** Pfad der Datenbankdatei. Tests übergeben eigene Pfade, NOVELMAKER_DATA ohne config.json bleibt beim Standard. */
export function dbPath(): string {
  const dir = clean(readConfig().dbDir);
  return dir ? join(dir, DB_FILENAME) : DEFAULT_DB_PATH;
}

export function backupDir(): string {
  return clean(readConfig().backupDir) ?? DEFAULT_BACKUP_DIR;
}
