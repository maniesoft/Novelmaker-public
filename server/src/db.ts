import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dbPath } from './config';

export { DATA_DIR, ROOT_DIR, DEFAULT_BACKUP_DIR as BACKUP_DIR } from './config';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS novels (
  id TEXT PRIMARY KEY,
  series_id TEXT REFERENCES series(id) ON DELETE SET NULL,
  volume_number INTEGER,
  title TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'German',
  tense TEXT NOT NULL DEFAULT 'past',
  pov_type TEXT NOT NULL DEFAULT 'third-limited',
  pov_character_id TEXT,
  additional_instructions TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS acts (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_acts_novel ON acts(novel_id);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  act_id TEXT NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_chapters_act ON chapters(act_id);
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  pov_character_id TEXT,
  pov_type TEXT,
  labels TEXT NOT NULL DEFAULT '[]',
  word_count INTEGER NOT NULL DEFAULT 0,
  hide_from_ai INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scenes(chapter_id);
CREATE TABLE IF NOT EXISTS scene_snapshots (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_snapshots_scene ON scene_snapshots(scene_id);
CREATE TABLE IF NOT EXISTS codex_entries (
  id TEXT PRIMARY KEY,
  series_id TEXT REFERENCES series(id) ON DELETE CASCADE,
  novel_id TEXT REFERENCES novels(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'character',
  name TEXT NOT NULL DEFAULT '',
  aliases TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  fields TEXT NOT NULL DEFAULT '[]',
  inclusion TEXT NOT NULL DEFAULT 'auto',
  case_sensitive INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  linked_novel_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_codex_novel ON codex_entries(novel_id);
CREATE INDEX IF NOT EXISTS idx_codex_series ON codex_entries(series_id);
CREATE TABLE IF NOT EXISTS codex_relations (
  id TEXT PRIMARY KEY,
  a_id TEXT NOT NULL REFERENCES codex_entries(id) ON DELETE CASCADE,
  b_id TEXT NOT NULL REFERENCES codex_entries(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  novel_id TEXT REFERENCES novels(id) ON DELETE CASCADE,
  series_id TEXT REFERENCES series(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  messages TEXT NOT NULL DEFAULT '[]',
  inputs TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL DEFAULT 'custom',
  builtin_key TEXT,
  blocks TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Inhalt der Prompts je Sprache (prompts.lang = Ausgangssprache; deren Inhalt steht zusätzlich in prompts)
CREATE TABLE IF NOT EXISTS prompt_texts (
  prompt_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  messages TEXT NOT NULL DEFAULT '[]',
  inputs TEXT NOT NULL DEFAULT '[]',
  blocks TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (prompt_id, lang)
);
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  models TEXT NOT NULL DEFAULT '[]',
  models_fetched_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  models TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  prompt_id TEXT,
  model TEXT,
  context TEXT NOT NULL DEFAULT '[]',
  inputs TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  model TEXT,
  log_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);
CREATE TABLE IF NOT EXISTS generation_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  novel_id TEXT,
  prompt_id TEXT,
  prompt_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  provider_id TEXT,
  model_id TEXT NOT NULL DEFAULT '',
  messages TEXT NOT NULL DEFAULT '[]',
  params TEXT NOT NULL DEFAULT '{}',
  response TEXT NOT NULL DEFAULT '',
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost REAL,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON generation_logs(created_at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS novel_covers (
  novel_id TEXT PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function openDb(path = dbPath()): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  // Klassisches Rollback-Journal statt WAL: Nach jedem Speichern steht der komplette Stand in der einen
  // .db-Datei. Das ist wichtig, wenn die Datei in Dropbox/OneDrive liegt (die Sync-Programme kopieren
  // sonst eine .db ohne die zugehörige -wal-Datei auf den anderen Rechner).
  if (path !== ':memory:') db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/**
 * Austauschbare Datenbank: Alle Routen halten dieses Objekt; beim Wechsel des Speicherorts
 * wird nur die Verbindung dahinter ersetzt – ohne Neustart.
 */
export class DbHandle {
  private current: DB;
  readonly db: DB;
  constructor(initial: DB) {
    this.current = initial;
    const self = this;
    this.db = new Proxy({} as DB, {
      get(_t, prop) {
        const v = (self.current as unknown as Record<string | symbol, unknown>)[prop];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(self.current) : v;
      },
    });
  }
  get raw(): DB {
    return this.current;
  }
  /** Neue Verbindung einsetzen, die alte schließen. */
  swap(next: DB) {
    const old = this.current;
    this.current = next;
    try {
      old.close();
    } catch {
      /* schon zu */
    }
  }
}

/** Spalten nachrüsten, die nach dem ersten Schema dazugekommen sind. */
function migrate(db: DB) {
  const hasColumn = (table: string, col: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
  if (!hasColumn('snippets', 'pinned')) db.exec('ALTER TABLE snippets ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  if (!hasColumn('prompts', 'blocks')) db.exec('ALTER TABLE prompts ADD COLUMN blocks TEXT');
  if (!hasColumn('prompts', 'lang')) {
    // Prompts je Sprache: die bisherigen Inhalte werden zur deutschen Fassung (die Oberfläche war bis dahin deutsch)
    db.exec("ALTER TABLE prompts ADD COLUMN lang TEXT NOT NULL DEFAULT 'de'");
    db.exec(
      `INSERT OR IGNORE INTO prompt_texts (prompt_id, lang, name, description, messages, inputs, blocks, updated_at)
       SELECT id, 'de', name, description, messages, inputs, blocks, updated_at FROM prompts`,
    );
  }
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < 2) db.pragma('user_version = 2');
}

export const newId = () => randomUUID();
export const now = () => new Date().toISOString();

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (s == null || s === '') return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export interface ColSpec {
  col: string;
  kind?: 'json' | 'bool';
}

/** Baut ein UPDATE nur aus erlaubten Feldern. Gibt false zurück, wenn nichts zu tun war. */
export function updateRow(
  db: DB,
  table: string,
  id: string,
  patch: Record<string, unknown>,
  spec: Record<string, ColSpec>,
  touch: string | null = 'updated_at',
): boolean {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const s = spec[k];
    if (!s || v === undefined) continue;
    sets.push(`${s.col} = ?`);
    vals.push(s.kind === 'json' ? JSON.stringify(v) : s.kind === 'bool' ? (v ? 1 : 0) : v);
  }
  if (!sets.length) return false;
  if (touch) {
    sets.push(`${touch} = ?`);
    vals.push(now());
  }
  db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return true;
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/** 404 mit vollständiger (übersetzter) Meldung, z. B. notFound(t('Scene not found')). */
export function notFound(message: string): never {
  throw new HttpError(404, message);
}
