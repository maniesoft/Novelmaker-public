// Übersetzungstabelle (Einstellungen → Allgemein → „Beim Übersetzen helfen“): Schlüssel aus dem Quellcode,
// Sprachdateien lesen und schreiben. Für Leute, die an den Übersetzungen mitarbeiten wollen.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { extractKeys, isLang, setTranslations, t, type Dict, type I18nKey } from '@novelmaker/shared';
import { HttpError, ROOT_DIR } from '../db';

const SOURCE_DIRS = ['shared/src', 'server/src', 'web/src'];
const LOCALES = join(ROOT_DIR, 'shared', 'src', 'i18n', 'locales');
/** Sprachcode für den Dateinamen, z. B. „fr“, „pt-BR“ */
const CODE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'locales' && name !== 'node_modules') walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Alle Schlüssel im Quellcode, in der Reihenfolge ihres Auftretens (Texte einer Ansicht stehen beieinander). */
export function collectKeys(root = ROOT_DIR): I18nKey[] {
  const keys = new Map<string, I18nKey>();
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(join(root, dir))) extractKeys(readFileSync(file, 'utf8'), relative(root, file).replace(/\\/g, '/'), keys);
  }
  return [...keys.values()];
}

function localeFile(code: string): string {
  if (!CODE.test(code) || code === 'en') throw new HttpError(400, t('Invalid language code.'));
  return join(LOCALES, `${code}.json`);
}

/** Nur Texte bzw. Pluralformen mit Text übernehmen; leere Einträge fallen weg (= noch nicht übersetzt). */
function cleanDict(input: unknown): Dict {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, t('The translations must be a JSON object.'));
  const out: Dict = {};
  for (const key of Object.keys(input).sort((a, b) => a.localeCompare(b, 'en'))) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === 'string') {
      if (v.trim()) out[key] = v;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const forms = Object.fromEntries(Object.entries(v).filter(([, f]) => typeof f === 'string' && f.trim())) as Record<string, string>;
      if (forms.other) out[key] = forms as Dict[string];
    }
  }
  return out;
}

export function registerI18nRoutes(app: FastifyInstance) {
  app.get('/api/i18n/keys', async () => {
    const langs = existsSync(LOCALES)
      ? readdirSync(LOCALES)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -5))
          .sort()
      : [];
    return { keys: collectKeys(), langs, localesDir: relative(ROOT_DIR, LOCALES).replace(/\\/g, '/') };
  });

  app.get<{ Params: { lang: string } }>('/api/i18n/dict/:lang', async (req) => {
    const file = localeFile(req.params.lang);
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Dict) : {};
  });

  /** Sprachdatei schreiben; bekannte Sprachen gelten sofort (Server-Meldungen), ohne Neustart. */
  app.put<{ Params: { lang: string }; Body: { dict: unknown } }>('/api/i18n/dict/:lang', async (req) => {
    const code = req.params.lang;
    const file = localeFile(code);
    const dict = cleanDict(req.body?.dict);
    try {
      writeFileSync(file, JSON.stringify(dict, null, 2) + '\n');
    } catch (e) {
      throw new HttpError(500, t('The language file could not be saved: {error}', { error: (e as Error).message }));
    }
    if (isLang(code)) setTranslations(code, dict);
    return { ok: true, file: relative(ROOT_DIR, file).replace(/\\/g, '/'), count: Object.keys(dict).length };
  });
}
