// Sprache der Oberfläche im Browser. Übersetzt wird mit t()/tn() aus @novelmaker/shared;
// tr() erlaubt zusätzlich einfache Auszeichnungen (<b>, <code>, …) und React-Elemente als Platzhalter.
import { Fragment, type ReactNode } from 'react';
import { create } from 'zustand';
import { DEFAULT_LANG, isLang, locale, setLang as setSharedLang, setTranslations, translate, type Dict, type Lang } from '@novelmaker/shared';

export { t, tn, N_, getLang, locale, LANGUAGES, type Lang } from '@novelmaker/shared';

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem('nm-lang');
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

const stored = readStored();
if (stored) {
  setSharedLang(stored);
  document.documentElement.lang = stored;
}

interface LangState {
  lang: Lang;
  /** Sprache ist bekannt (aus dem Browser-Speicher oder den Einstellungen) */
  known: boolean;
  /** zählt hoch, wenn sich Übersetzungen der aktuellen Sprache ändern (App wird neu aufgebaut) */
  rev: number;
}

export const useLang = create<LangState>(() => ({ lang: stored ?? DEFAULT_LANG, known: !!stored, rev: 0 }));

/** Geänderte Übersetzungen sofort verwenden (Übersetzungstabelle); bei der aktuellen Sprache wird die App neu aufgebaut. */
export function applyTranslations(lang: Lang, dict: Dict) {
  setTranslations(lang, dict);
  if (lang === useLang.getState().lang) useLang.setState((s) => ({ rev: s.rev + 1 }));
}

/** Sprache übernehmen (aus den Einstellungen). Die App wird danach neu aufgebaut. */
export function applyLang(lang: Lang) {
  setSharedLang(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem('nm-lang', lang);
  } catch {
    /* */
  }
  if (useLang.getState().lang !== lang || !useLang.getState().known) useLang.setState({ lang, known: true });
}

/** Name einer Sprache in der Sprache der Oberfläche (z. B. „Spanisch“). */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([locale()], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

type TagFn = (children: ReactNode) => ReactNode;

const DEFAULT_TAGS: Record<string, TagFn> = {
  b: (c) => <b>{c}</b>,
  strong: (c) => <strong>{c}</strong>,
  i: (c) => <i>{c}</i>,
  em: (c) => <em>{c}</em>,
  u: (c) => <u>{c}</u>,
  code: (c) => <code>{c}</code>,
  kbd: (c) => <kbd>{c}</kbd>,
};

/**
 * Übersetzter Text als React-Knoten.
 *   tr('Insert with <code>{x}</code>', { x: '…' })
 *   tr('Database open on “{host}”', { host: <b>PC-2</b> })
 *   tr('See <link>Settings</link>', {}, { link: (c) => <a href="…">{c}</a> })
 * Erlaubte Auszeichnungen ohne Angabe: b, strong, i, em, u, code, kbd sowie <br/>.
 */
export function tr(key: string, vars?: Record<string, ReactNode>, tags?: Record<string, TagFn>): ReactNode {
  const n = vars && typeof vars.n === 'number' ? vars.n : undefined;
  const text = translate(key, undefined, n);
  const all = { ...DEFAULT_TAGS, ...tags };
  let k = 0;
  const parse = (s: string): ReactNode[] => {
    const out: ReactNode[] = [];
    const re = /<(\w+)>([\s\S]*?)<\/\1>|<br\s*\/?>|\{(\w+)\}/g;
    let last = 0;
    for (const m of s.matchAll(re)) {
      if (m.index! > last) out.push(s.slice(last, m.index));
      last = m.index! + m[0].length;
      if (m[1]) {
        const fn = all[m[1]];
        out.push(<Fragment key={k++}>{fn ? fn(parse(m[2])) : m[0]}</Fragment>);
      } else if (m[3]) {
        out.push(<Fragment key={k++}>{vars && m[3] in vars ? vars[m[3]] : m[0]}</Fragment>);
      } else out.push(<br key={k++} />);
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };
  return <>{parse(text)}</>;
}
