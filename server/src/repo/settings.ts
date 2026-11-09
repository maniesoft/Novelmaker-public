import { DEFAULT_APP_SETTINGS, isLang, setLang, type AppSettings } from '@novelmaker/shared';
import { parseJson, type DB } from '../db';

export function getSettingsValue<T>(db: DB, key: string, fallback: T): T {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return r ? parseJson<T>(r.value, fallback) : fallback;
}

export function setSettingsValue(db: DB, key: string, value: unknown) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

export function getAppSettings(db: DB): AppSettings {
  const s = { ...DEFAULT_APP_SETTINGS, ...getSettingsValue<Partial<AppSettings>>(db, 'app', {}) };
  if (!isLang(s.language)) s.language = DEFAULT_APP_SETTINGS.language;
  return s;
}

export function updateAppSettings(db: DB, patch: Partial<AppSettings>): AppSettings {
  const current = getAppSettings(db);
  const next: AppSettings = {
    ...current,
    ...patch,
    lastSelections: patch.lastSelections ? { ...current.lastSelections, ...patch.lastSelections } : current.lastSelections,
  };
  if (!isLang(next.language)) next.language = current.language;
  setSettingsValue(db, 'app', next);
  // gilt sofort, auch für den Rest dieser Anfrage
  setLang(next.language);
  return next;
}
