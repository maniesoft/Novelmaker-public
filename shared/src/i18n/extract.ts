// Übersetzungs-Schlüssel im Quellcode finden und Übersetzungen prüfen.
// Genutzt vom Prüfskript (scripts/i18n-check.mjs), vom Server (Übersetzungstabelle) und vom Browser (Live-Prüfung).
//
// Schlüssel sind die Text-Literale in den Aufrufen von t, tr, tn und N_; bei tn (Einzahl, Mehrzahl) ist der
// Schlüssel die Mehrzahl. Pluralpaare in Tabellen stehen als Array aus zwei N_-Aufrufen (Einzahl, Mehrzahl).

export interface I18nKey {
  key: string;
  /** Einzahl bei Pluralschlüsseln (tn) – der Schlüssel selbst ist die Mehrzahl */
  one?: string;
  /** Dateien, in denen der Schlüssel vorkommt (Reihenfolge des ersten Auftretens) */
  files: string[];
}

interface StringLit {
  value?: string;
  dynamic?: boolean;
  end: number;
}

/** Liest ein String-Literal ab Position i ('…', "…", `…` ohne ${}). */
function readString(src: string, i: number): StringLit | null {
  const q = src[i];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let s = '';
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') {
      const n = src[j + 1];
      s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
      j += 2;
      continue;
    }
    if (q === '`' && c === '$' && src[j + 1] === '{') return { dynamic: true, end: j };
    if (c === q) return { value: s, end: j + 1 };
    s += c;
    j++;
  }
  return null;
}

const skipWs = (src: string, i: number) => {
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
};

/** Überspringt einen Ausdruck bis zum nächsten Komma auf oberster Ebene. */
function skipExpr(src: string, i: number): number {
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      const r = readString(src, i);
      i = r ? r.end : i + 1;
      continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth === 0) return i;
      depth--;
    } else if (c === ',' && depth === 0) return i;
    i++;
  }
  return i;
}

/**
 * Sammelt die Schlüssel einer Quelldatei in `into` (Reihenfolge bleibt erhalten).
 * Aufrufe ohne festen Text, die trotzdem ein Literal enthalten, landen in `dynamic` (zum Prüfen).
 */
export function extractKeys(src: string, file: string, into: Map<string, I18nKey>, dynamic: string[] = []): void {
  const add = (key: string, one?: string) => {
    let e = into.get(key);
    if (!e) into.set(key, (e = { key, files: [] }));
    if (!e.files.includes(file)) e.files.push(file);
    if (one !== undefined) e.one = one;
  };
  const lineOf = (pos: number) => src.slice(0, pos).split('\n').length;
  const re = /(?<![.\w$])(t|tr|tn|N_)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = skipWs(src, m.index + m[0].length);
    if (m[1] === 'tn') {
      i = skipWs(src, skipExpr(src, i) + 1);
      const one = readString(src, i);
      if (!one || one.dynamic) {
        dynamic.push(`${file}:${lineOf(m.index)} tn call without a literal`);
        continue;
      }
      i = skipWs(src, one.end);
      if (src[i] !== ',') continue;
      const other = readString(src, skipWs(src, i + 1));
      if (!other || other.dynamic) continue;
      add(other.value!, one.value!);
      continue;
    }
    const s = readString(src, i);
    // Pluralpaar in Tabellen: Array aus zwei N_-Aufrufen (Einzahl, Mehrzahl) → wie bei tn
    if (m[1] === 'N_' && s && !s.dynamic && /\[\s*$/.test(src.slice(Math.max(0, m.index - 20), m.index))) {
      const after = skipWs(src, s.end);
      const pm = /^\)\s*,\s*N_\(\s*/.exec(src.slice(after));
      const other = pm ? readString(src, after + pm[0].length) : null;
      if (other && !other.dynamic) {
        add(other.value!, s.value!);
        continue;
      }
    }
    if (s && !s.dynamic) add(s.value!);
    else {
      const arg = src.slice(i, skipExpr(src, i)).trim();
      // t mit Variablen (Werte aus N_-Tabellen) ist gewollt; nur Auffälliges melden
      if (/['"`]/.test(arg)) dynamic.push(`${file}:${lineOf(m.index)} ${m[1]}(${arg.slice(0, 80)})`);
    }
  }
}

// ---------------------------------------------------------------- Prüfen

export type TranslationValue = string | Partial<Record<Intl.LDMLPluralRule, string>>;

export interface TranslationProblem {
  kind: 'empty' | 'placeholders' | 'tags' | 'noOther';
  /** betroffene Pluralform (bei Pluralschlüsseln) */
  form?: string;
  expected?: string;
  actual?: string;
}

/** Platzhalter wie {n}, {name} – sortiert, ohne Doppelte. */
export const placeholdersOf = (s: string): string[] => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]))].sort();
/** Auszeichnungen wie <b>, </b>, <code/> – sortiert. */
export const tagsOf = (s: string): string[] => [...s.matchAll(/<\/?(\w+)\s*\/?>/g)].map((x) => x[0]).sort();

/**
 * Prüft eine Übersetzung gegen ihren Schlüssel: Platzhalter und Auszeichnungen müssen übereinstimmen
 * ({n} darf in Pluralformen fehlen, z. B. „one“ = „une scène“), Pluralformen brauchen „other“.
 */
export function checkTranslation(key: string, value: TranslationValue, plural: boolean): TranslationProblem[] {
  const out: TranslationProblem[] = [];
  const forms: [string | undefined, unknown][] = typeof value === 'string' ? [[undefined, value]] : Object.entries(value);
  if (typeof value !== 'string' && !('other' in value)) out.push({ kind: 'noOther' });
  const norm = (s: string) =>
    placeholdersOf(s)
      .filter((x) => !(plural && x === 'n'))
      .join(', ');
  const want = norm(key);
  const wantTags = tagsOf(key).join('');
  for (const [form, f] of forms) {
    if (typeof f !== 'string' || !f.trim()) {
      out.push({ kind: 'empty', form });
      continue;
    }
    const have = norm(f);
    if (want !== have) out.push({ kind: 'placeholders', form, expected: want, actual: have });
    const haveTags = tagsOf(f).join('');
    if (wantTags !== haveTags) out.push({ kind: 'tags', form, expected: wantTags, actual: haveTags });
  }
  return out;
}

/** Pluralformen einer Sprache (z. B. Ukrainisch: one, few, many, other). */
export function pluralCategories(locale: string): Intl.LDMLPluralRule[] {
  try {
    const cats = new Intl.PluralRules(locale).resolvedOptions().pluralCategories as Intl.LDMLPluralRule[];
    const order: Intl.LDMLPluralRule[] = ['zero', 'one', 'two', 'few', 'many', 'other'];
    return order.filter((c) => cats.includes(c));
  } catch {
    return ['one', 'other'];
  }
}
