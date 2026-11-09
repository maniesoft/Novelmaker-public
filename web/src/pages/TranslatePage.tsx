// Übersetzungstabelle (Einstellungen → Allgemein → „Beim Übersetzen helfen“).
// Für Leute, die an den Übersetzungen mitarbeiten: links der englische Ausgangstext (= Schlüssel im Code),
// in der Mitte eine Vergleichssprache, rechts die eigene Übersetzung. Speichern schreibt die Sprachdatei
// shared/src/i18n/locales/<sprache>.json; bekannte Sprachen gelten sofort.
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileInput, Save, Search } from 'lucide-react';
import {
  checkTranslation,
  isLang,
  languageInfo,
  pluralCategories,
  TRANSLATED_LANGS,
  type Dict,
  type I18nKey,
  type TranslationProblem,
  type TranslationValue,
} from '@novelmaker/shared';
import { api } from '../lib/api';
import { toast } from '../lib/store';
import { Badge, Button, cn, confirmDialog, Input, Select, Spinner, Tabs } from '../components/ui';
import { applyTranslations, languageName, t, tr, useLang } from '../lib/i18n';

interface KeysResponse {
  keys: I18nKey[];
  langs: string[];
  localesDir: string;
}
type Filter = 'all' | 'missing' | 'problems';

const CODE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const localeOf = (code: string) => (isLang(code) ? languageInfo(code).locale : code);
const isEmpty = (v: TranslationValue | undefined) =>
  v === undefined || (typeof v === 'string' ? !v.trim() : !Object.values(v).some((f) => typeof f === 'string' && f.trim()));

function langLabel(code: string) {
  return isLang(code) ? `${languageInfo(code).label} (${code})` : `${languageName(code)} (${code})`;
}

function problemText(p: TranslationProblem): string {
  const list = (s?: string) => (s ? s.split(', ').map((x) => (x.startsWith('<') ? x : `{${x}}`)).join(' ') : '–');
  const prefix = p.form ? `${p.form}: ` : '';
  switch (p.kind) {
    case 'empty':
      return prefix + t('empty');
    case 'noOther':
      return t('The “other” form is missing.');
    case 'placeholders':
      return prefix + t('Placeholders differ: expected {expected}, found {actual}', { expected: list(p.expected), actual: list(p.actual) });
    case 'tags':
      return prefix + t('Markup differs: expected {expected}, found {actual}', { expected: p.expected || '–', actual: p.actual || '–' });
  }
}

function fetchDict(code: string) {
  return api.get<Dict>(`/api/i18n/dict/${code}`);
}

export function TranslatePage() {
  const uiLang = useLang((s) => s.lang);
  const keysQ = useQuery({ queryKey: ['i18n', 'keys'], queryFn: () => api.get<KeysResponse>('/api/i18n/keys') });
  const [target, setTarget] = useState<string>(uiLang !== 'en' ? uiLang : 'de');
  const [reference, setReference] = useState<string>(uiLang !== 'en' && uiLang !== target ? uiLang : target === 'de' ? 'es' : 'de');
  const targetQ = useQuery({ queryKey: ['i18n', 'dict', target], queryFn: () => fetchDict(target) });
  const refQ = useQuery({ queryKey: ['i18n', 'dict', reference], queryFn: () => fetchDict(reference), enabled: !!reference });
  const [edits, setEdits] = useState<Dict>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [newCode, setNewCode] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  // Datei der Zielsprache übernehmen, sobald sie geladen ist
  useEffect(() => {
    if (targetQ.data && loadedFor !== target) {
      setEdits(targetQ.data);
      setLoadedFor(target);
      setDirty(false);
    }
  }, [targetQ.data, target, loadedFor]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const keys = keysQ.data?.keys ?? [];
  const cats = useMemo(() => pluralCategories(localeOf(target)), [target]);

  // Sichtbare Zeilen nur bei Filter-/Suchwechsel neu bestimmen – sonst verschwände eine fehlende Zeile beim ersten Buchstaben
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const visible = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const ref = refQ.data ?? {};
    const text = (v: TranslationValue | undefined) => (v === undefined ? '' : typeof v === 'string' ? v : Object.values(v).join(' ')).toLowerCase();
    return keys.filter((k) => {
      const v = editsRef.current[k.key];
      if (filter === 'missing' && !isEmpty(v)) return false;
      if (filter === 'problems' && (isEmpty(v) || !checkTranslation(k.key, v!, k.one !== undefined).length)) return false;
      if (!q) return true;
      return k.key.toLowerCase().includes(q) || (k.one ?? '').toLowerCase().includes(q) || text(v).includes(q) || text(ref[k.key]).includes(q);
    });
  }, [keys, filter, deferredSearch, loadedFor, refQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    let done = 0;
    let problems = 0;
    for (const k of keys) {
      const v = edits[k.key];
      if (isEmpty(v)) continue;
      done++;
      if (checkTranslation(k.key, v!, k.one !== undefined).length) problems++;
    }
    return { done, problems, missing: keys.length - done };
  }, [keys, edits]);

  const onChange = useCallback((key: string, value: TranslationValue) => {
    setEdits((prev) => ({ ...prev, [key]: value as Dict[string] }));
    setDirty(true);
  }, []);

  const changeTarget = async (code: string) => {
    if (code === target) return;
    if (dirty && !(await confirmDialog({ title: t('Discard unsaved changes?'), message: t('Your changes to {lang} have not been saved yet.', { lang: langLabel(target) }), confirmLabel: t('Discard') })))
      return;
    setTarget(code);
    setLoadedFor(null);
    if (reference === code) setReference(code === 'de' ? 'es' : 'de');
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await api.put<{ file: string; count: number }>(`/api/i18n/dict/${target}`, { dict: editsRef.current });
      const saved = await fetchDict(target);
      setEdits(saved);
      setDirty(false);
      if (isLang(target)) applyTranslations(target, saved);
      toast.success(t('Saved {n} translations to {file}.', { n: res.count, file: res.file }));
      if (!isLang(target)) toast.info(t('“{code}” is not yet a language of the app. A developer has to register it (see README → Translations).', { code: target }));
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.defaultPrevented) {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, save]);

  const downloadFile = () => {
    const sorted = Object.fromEntries(
      Object.entries(edits)
        .filter(([, v]) => !isEmpty(v))
        .sort((a, b) => a[0].localeCompare(b[0], 'en')),
    );
    const url = URL.createObjectURL(new Blob([JSON.stringify(sorted, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${target}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>;
      const known = new Set(keys.map((k) => k.key));
      let taken = 0;
      let unknown = 0;
      const next: Dict = { ...editsRef.current };
      for (const [k, v] of Object.entries(data)) {
        if (!known.has(k)) {
          unknown++;
          continue;
        }
        if (typeof v === 'string' || (v && typeof v === 'object')) {
          next[k] = v as Dict[string];
          taken++;
        }
      }
      setEdits(next);
      setDirty(true);
      toast.success(t('Imported {n} translations ({unknown} unknown keys skipped). Not saved yet.', { n: taken, unknown }));
    } catch (e) {
      toast.error(t('The file is not a valid language file: {error}', { error: (e as Error).message }));
    }
  };

  if (keysQ.isLoading) return <Spinner />;
  if (keysQ.isError) return <p className="text-sm text-red-600">{String((keysQ.error as Error).message)}</p>;
  const localesDir = keysQ.data?.localesDir ?? 'shared/src/i18n/locales';
  const targetOptions = [...new Set<string>([...TRANSLATED_LANGS, ...(keysQ.data?.langs ?? []), target])];
  const refOptions = [...new Set<string>([...TRANSLATED_LANGS, ...(keysQ.data?.langs ?? [])])].filter((c) => c !== target);

  return (
    <div className="space-y-4">
      <div className="max-w-3xl space-y-2 text-sm text-stone-600 dark:text-stone-400">
        <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100">{t('Help translate')}</h2>
        <p>
          {t(
            'For everyone who wants to improve Novelmaker’s translations. The left column is the English source text (the key in the code), the middle one another language for comparison, the right one your translation.',
          )}
        </p>
        <p>
          {tr(
            'Placeholders such as {n} and markup must stay as they are. <b>Save</b> writes the language file <code>{file}</code>; the changes apply immediately. To share them, send the file or open a pull request.',
            { file: `${localesDir}/${target}.json` },
          )}
        </p>
      </div>

      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-end gap-3 border-b border-stone-200 bg-stone-50/95 px-1 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
          <span>{t('Translate into')}</span>
          <Select value={target} onChange={(e) => void changeTarget(e.target.value)} className="w-52">
            {targetOptions.map((c) => (
              <option key={c} value={c}>
                {langLabel(c)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
          <span>{t('Compare with')}</span>
          <Select value={reference} onChange={(e) => setReference(e.target.value)} className="w-52">
            <option value="">{t('(none)')}</option>
            {refOptions.map((c) => (
              <option key={c} value={c}>
                {langLabel(c)}
              </option>
            ))}
          </Select>
        </label>
        <form
          className="flex flex-col gap-1 text-xs font-medium text-stone-500"
          onSubmit={(e) => {
            e.preventDefault();
            const c = newCode.trim();
            if (!CODE.test(c) || c === 'en') return toast.error(t('Please enter a language code such as “pt” or “pt-BR”.'));
            setNewCode('');
            void changeTarget(c);
          }}
        >
          <span>{t('New language (code)')}</span>
          <div className="flex gap-1">
            <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="pt" className="w-20" />
            <Button type="submit" variant="secondary">
              {t('Start')}
            </Button>
          </div>
        </form>
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
          <Button variant="ghost" icon={<FileInput className="size-4" />} onClick={() => importRef.current?.click()} title={t('Merge translations from a language file')}>
            {t('Import')}
          </Button>
          <Button variant="ghost" icon={<Download className="size-4" />} onClick={downloadFile} title={t('Download the language file with your changes')}>
            {t('Download')}
          </Button>
          <Button variant="primary" icon={<Save className="size-4" />} onClick={() => void save()} disabled={!dirty} loading={saving} title={t('Save (Ctrl+S)')}>
            {t('Save')}
          </Button>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3">
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: 'all', label: `${t('All')} · ${keys.length}` },
              { value: 'missing', label: `${t('Missing')} · ${stats.missing}` },
              { value: 'problems', label: `${t('Problems')} · ${stats.problems}` },
            ]}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-stone-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search…')} className="w-64 pl-8" />
          </div>
          <span className="text-xs text-stone-500">
            {t('{done} of {total} translated', { done: stats.done, total: keys.length })}
            {dirty && (
              <Badge tone="amber" className="ml-2">
                {t('Unsaved changes')}
              </Badge>
            )}
          </span>
        </div>
      </div>

      {targetQ.isLoading || loadedFor !== target ? (
        <Spinner />
      ) : (
        <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-4 px-4 py-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">
            <span>English</span>
            <span>{reference ? langLabel(reference) : ''}</span>
            <span>{langLabel(target)}</span>
          </div>
          {visible.length === 0 && <div className="px-4 py-8 text-center text-sm text-stone-500">{t('Nothing to show.')}</div>}
          {visible.map((k) => (
            <Row key={k.key} entry={k} reference={reference ? refQ.data?.[k.key] : undefined} value={edits[k.key]} cats={cats} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  );
}

const Row = memo(function Row({
  entry,
  reference,
  value,
  cats,
  onChange,
}: {
  entry: I18nKey;
  reference: TranslationValue | undefined;
  value: TranslationValue | undefined;
  cats: Intl.LDMLPluralRule[];
  onChange: (key: string, value: TranslationValue) => void;
}) {
  const plural = entry.one !== undefined;
  const problems = isEmpty(value) ? [] : checkTranslation(entry.key, value!, plural);
  const missing = isEmpty(value);
  const forms: Partial<Record<string, string>> = plural ? (typeof value === 'object' ? value : value ? { other: value } : {}) : {};
  const area = 'w-full resize-none rounded-md border border-stone-300 bg-white px-2 py-1 text-sm leading-snug dark:border-stone-700 dark:bg-stone-950';
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-4 border-l-2 px-4 py-2.5', missing ? 'border-l-amber-400' : problems.length ? 'border-l-red-500' : 'border-l-transparent')}>
      <div className="min-w-0 text-sm whitespace-pre-wrap">
        {plural ? (
          <>
            <div>
              <span className="text-xs text-stone-400">one: </span>
              {entry.one}
            </div>
            <div>
              <span className="text-xs text-stone-400">other: </span>
              {entry.key}
            </div>
          </>
        ) : (
          entry.key
        )}
        <div className="mt-1 truncate font-mono text-[10px] text-stone-400" title={entry.files.join('\n')}>
          {entry.files[0]}
          {entry.files.length > 1 ? ` +${entry.files.length - 1}` : ''}
        </div>
      </div>
      <div className="min-w-0 text-sm whitespace-pre-wrap text-stone-500">
        {reference === undefined
          ? ''
          : typeof reference === 'string'
            ? reference
            : Object.entries(reference).map(([f, s]) => (
                <div key={f}>
                  <span className="text-xs text-stone-400">{f}: </span>
                  {s}
                </div>
              ))}
      </div>
      <div className="min-w-0 space-y-1">
        {plural ? (
          cats.map((c) => (
            <label key={c} className="flex items-start gap-2">
              <span className="w-10 shrink-0 pt-1.5 text-right text-xs text-stone-400">{c}</span>
              <textarea
                rows={1}
                className={area}
                style={{ fieldSizing: 'content' } as React.CSSProperties}
                value={forms[c] ?? ''}
                onChange={(e) => {
                  const next = { ...forms, [c]: e.target.value };
                  if (!next[c]) delete next[c];
                  onChange(entry.key, next as TranslationValue);
                }}
              />
            </label>
          ))
        ) : (
          <textarea
            rows={1}
            className={area}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(entry.key, e.target.value)}
          />
        )}
        {problems.map((p, i) => (
          <div key={i} className="text-xs text-red-600 dark:text-red-400">
            {problemText(p)}
          </div>
        ))}
      </div>
    </div>
  );
});
