// Mehrsprachigkeit der Oberfläche (und der Server-Meldungen).
//
// Schlüssel ist der englische Text („gettext-Stil“): t('Save') liefert je nach Sprache
// „Save“, „Speichern“, „Guardar“, … Die Übersetzungen stehen in locales/<sprache>.json (englischer Text → Übersetzung);
// Englisch selbst braucht keine Datei. Fehlt eine Übersetzung, erscheint der englische Text
// (`npm run i18n` findet solche Lücken, Einstellungen → Allgemein → „Beim Übersetzen helfen“ zeigt sie als Tabelle).
//
//   t('Saved')                              – einfacher Text
//   t('Loaded {n} models', { n: 12 })       – Platzhalter in geschweiften Klammern
//   tn(n, '{n} scene', '{n} scenes')        – Einzahl/Mehrzahl (Schlüssel ist die Mehrzahl)
//   N_('Character')                         – nur markieren (Konstanten); übersetzt wird beim Anzeigen mit t(x)
//
// Die Sprache ist eine Einstellung der App (AppSettings.language). Der Browser setzt sie beim Start,
// der Server bei jeder Anfrage aus den Einstellungen.
import de from './locales/de.json';
import es from './locales/es.json';
import uk from './locales/uk.json';
import it from './locales/it.json';
import fr from './locales/fr.json';

export type Lang = 'en' | 'de' | 'es' | 'uk' | 'it' | 'fr';

export const DEFAULT_LANG: Lang = 'en';
export const LANGS: Lang[] = ['en', 'de', 'es', 'uk', 'it', 'fr'];
/** Sprachen mit Übersetzungsdatei (Englisch ist die Ausgangssprache der Schlüssel). */
export const TRANSLATED_LANGS = LANGS.filter((l) => l !== 'en') as Exclude<Lang, 'en'>[];

export interface LanguageInfo {
  value: Lang;
  /** Name in der Sprache selbst */
  label: string;
  /** englischer Name (z. B. für Prompts: „Use German language and grammar.“) */
  english: string;
  /** für Datums- und Zahlenformate */
  locale: string;
  /** Wert für „Sprache“ eines neuen Romans */
  novelLanguage: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { value: 'en', label: 'English', english: 'English', locale: 'en-US', novelLanguage: 'English (US)' },
  { value: 'de', label: 'Deutsch', english: 'German', locale: 'de-DE', novelLanguage: 'German' },
  { value: 'es', label: 'Español', english: 'Spanish', locale: 'es-ES', novelLanguage: 'Spanish' },
  { value: 'uk', label: 'Українська', english: 'Ukrainian', locale: 'uk-UA', novelLanguage: 'Ukrainian' },
  { value: 'it', label: 'Italiano', english: 'Italian', locale: 'it-IT', novelLanguage: 'Italian' },
  { value: 'fr', label: 'Français', english: 'French', locale: 'fr-FR', novelLanguage: 'French' },
];

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as string[]).includes(v);
export const languageInfo = (l: Lang): LanguageInfo => LANGUAGES.find((x) => x.value === l) ?? LANGUAGES[0];

/** Übersetzung mit Pluralformen (Intl.PluralRules), z. B. Ukrainisch: one/few/many/other. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Dict = Record<string, string | PluralForms>;

const DICTS: Record<Lang, Dict> = { en: {}, de: de as Dict, es: es as Dict, uk: uk as Dict, it: it as Dict, fr: fr as Dict };

/** Übersetzungen einer Sprache ersetzen (Übersetzungstabelle: Änderungen sofort sichtbar, ohne neu zu bauen). */
export function setTranslations(l: Lang, dict: Dict) {
  if (l === 'en') return;
  DICTS[l] = dict;
  if (l === current) for (const fn of listeners) fn(l);
}
/** Die Übersetzungen einer Sprache (leer für Englisch). */
export const getTranslations = (l: Lang): Dict => DICTS[l];

let current: Lang = DEFAULT_LANG;
const listeners = new Set<(l: Lang) => void>();

export function setLang(l: Lang) {
  if (!isLang(l) || l === current) return;
  current = l;
  for (const fn of listeners) fn(l);
}
export const getLang = (): Lang => current;
export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** BCP-47-Locale der aktuellen Sprache (Datum, Zahlen). */
export const locale = (l: Lang = current) => languageInfo(l).locale;

export type Vars = Record<string, string | number>;

function fill(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

function pickPlural(forms: PluralForms, n: number, l: Lang): string {
  const rule = new Intl.PluralRules(locale(l)).select(n);
  return forms[rule] ?? forms.other;
}

/** Roh-Übersetzung ohne Platzhalter-Ersetzung (für Rich-Text im Browser). */
export function translate(key: string, l: Lang = current, n?: number): string {
  if (l === 'en') return key;
  const e = DICTS[l][key];
  if (e === undefined) return key;
  if (typeof e === 'string') return e;
  return pickPlural(e, n ?? 2, l);
}

/** Text in der eingestellten Sprache. Schlüssel = englischer Text. */
export function t(key: string, vars?: Vars, l: Lang = current): string {
  const n = vars && typeof vars.n === 'number' ? vars.n : undefined;
  return fill(translate(key, l, n), vars);
}

/** Einzahl/Mehrzahl: Schlüssel der Übersetzung ist die (englische) Mehrzahl; {n} wird lokal formatiert. */
export function tn(n: number, one: string, other: string, vars?: Vars, l: Lang = current): string {
  const v: Vars = { ...vars, n: n.toLocaleString(locale(l)) };
  if (l === 'en') return fill(n === 1 ? one : other, v);
  const e = DICTS[l][other];
  if (e === undefined) return fill(n === 1 ? one : other, v);
  return fill(typeof e === 'string' ? e : pickPlural(e, n, l), v);
}

/** Markiert einen Text zum Übersetzen, ohne ihn zu übersetzen (für Konstanten; angezeigt wird t(text)). */
export const N_ = <T extends string>(s: T): T => s;

/** Hat die Sprache eine Übersetzung für diesen Schlüssel? (Englisch: immer) */
export const hasTranslation = (key: string, l: Lang = current) => l === 'en' || DICTS[l][key] !== undefined;

/**
 * Sprachcode für die Rechtschreibprüfung aus der „Sprache“ eines Romans (freier Text wie „German“, „English (UK)“, „Deutsch“).
 * Unbekannt → leer (Browser-Standard).
 */
export function novelLangCode(language: string | null | undefined): string {
  const s = (language ?? '').trim().toLowerCase();
  const table: [RegExp, string][] = [
    [/^(de|german|deutsch)/, 'de'],
    [/^(en|english|englisch)/, s.includes('uk') || s.includes('brit') ? 'en-GB' : 'en'],
    [/^(es|spanish|español|espanol|spanisch)/, 'es'],
    [/^(uk|ukrain|українськ)/, 'uk'],
    [/^(it|italian|italiano|italienisch)/, 'it'],
    [/^(fr|french|français|francais|französisch)/, 'fr'],
    [/^(nl|dutch|nederlands|niederländisch)/, 'nl'],
    [/^(pl|polish|polski|polnisch)/, 'pl'],
    [/^(sv|swedish|svenska|schwedisch)/, 'sv'],
  ];
  return table.find(([re]) => re.test(s))?.[1] ?? '';
}
