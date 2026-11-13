// Roman importieren: Word, Markdown, Text oder Zip (einfaches Format mit Kontext-Ordner) – oder ein Novelcrafter-Export.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { codexTypeLabel, type ImportFormat, type ImportOptions, type ImportPreview, type ImportResult, type UnseparatedMode } from '@novelmaker/shared';
import { api, fileToBase64 } from '../lib/api';
import { N_, t, tn, tr } from '../lib/i18n';
import { keys, queryClient, useSeriesList } from '../lib/queries';
import { toast } from '../lib/store';
import { Button, Checkbox, cn, Field, formatNumber, Input, Modal, Select, Spinner } from './ui';

function Radio({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="radio" className="mt-0.5 size-4 accent-amber-700" checked={checked} onChange={onChange} />
      <span>
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

const TYPE_PLURAL: Record<string, [string, string]> = {
  character: [N_('{n} character'), N_('{n} characters')],
  location: [N_('{n} location'), N_('{n} locations')],
  object: [N_('{n} object'), N_('{n} objects')],
  lore: [N_('{n} lore entry'), N_('{n} lore entries')],
  subplot: [N_('{n} subplot'), N_('{n} subplots')],
  other: [N_('{n} other'), N_('{n} other')],
};

// Ordnernamen erkennt der Import auf Deutsch und Englisch (Kontext/Context, Figuren/Characters, …).
const SIMPLE_ZIP_LAYOUT = N_(`Novel.zip\n  Manuscript.docx   or .md / .txt – multiple files = one chapter each\n  Context/          one codex entry per file\n    Characters/     subfolders set the type:\n    Locations/      Characters, Locations, Objects, Lore, Subplots\n    World.md        no subfolder: “Other”\n  Snippets/         one snippet per file`);

// Manuskript ohne Überschriften: so lassen sich Kapitel markieren (erkannte Zeilen siehe TXT_CHAPTER_LINE im Server).
const NO_HEADINGS_HINT: Record<NonNullable<ImportPreview['missingHeadings']>, string> = {
  docx: N_('No chapter headings found, so the whole text becomes one chapter. In Word, format chapter titles as headings (e.g. with the “Heading 1” style) or put each on a line of its own, such as “Chapter 1” or “Chapter 2: Title”.'),
  markdown: N_('No chapter headings found, so the whole text becomes one chapter. Mark chapter titles as headings, e.g. <code># Chapter 1</code>.'),
  text: N_('No chapter headings found, so the whole text becomes one chapter. Put each chapter title on a line of its own, such as “Chapter 1” or “Chapter 2: Title”.'),
};

export function ImportDialog({ file, onClose }: { file: File; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: seriesList } = useSeriesList();
  const [data, setData] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  /** null = vom Server erkannt (Novelcrafter-Zip → Novelcrafter, sonst einfach) */
  const [format, setFormat] = useState<ImportFormat | null>(null);
  const [separator, setSeparator] = useState<'summary' | 'scene-break'>('summary');
  const [unseparated, setUnseparated] = useState<UnseparatedMode>('auto');
  const [withCodex, setWithCodex] = useState(true);
  const [withSnippets, setWithSnippets] = useState(true);
  const [withChats, setWithChats] = useState(true);
  const [seriesId, setSeriesId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fileToBase64(file).then(setData, (e) => setError(String(e)));
  }, [file]);

  useEffect(() => {
    if (!data) return;
    let stale = false;
    setLoading(true);
    const options: ImportOptions = { separator, ...(format ? { format } : {}) };
    api
      .post<ImportPreview>('/api/import/analyze', { filename: file.name, data, options })
      .then((p) => {
        if (stale) return;
        setError(null);
        setPreview(p);
        if (!titleTouched) setTitle(p.title);
      })
      .catch((e) => !stale && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [data, separator, format, file.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const usedFormat: ImportFormat = format ?? preview?.format ?? 'simple';
  const nc = usedFormat === 'novelcrafter';

  const run = async () => {
    if (!data || !preview) return;
    setBusy(true);
    const options: ImportOptions = {
      format: usedFormat,
      title,
      separator,
      unseparated,
      codex: withCodex,
      snippets: withSnippets,
      chats: withChats,
      seriesId: seriesId || null,
    };
    try {
      const r = await api.post<ImportResult>('/api/import', { filename: file.name, data, options });
      const parts = [tn(r.chapters, '{n} chapter', '{n} chapters'), tn(r.scenes, '{n} scene', '{n} scenes')];
      if (r.summaries) parts.push(tn(r.summaries, '{n} with summary', '{n} with summaries'));
      if (nc) parts.push(tn(r.proseScenes, '{n} with prose', '{n} with prose'));
      if (r.codex) parts.push(tn(r.codex, '{n} new codex entry', '{n} new codex entries'));
      if (r.codexExisting) parts.push(tn(r.codexExisting, '{n} codex entry was already in the series', '{n} codex entries were already in the series'));
      if (r.snippets) parts.push(tn(r.snippets, '{n} snippet', '{n} snippets'));
      if (r.chats) parts.push(tn(r.chats, '{n} chat', '{n} chats'));
      const list = parts.join(', ');
      toast.success(r.volumeNumber ? t('Imported as volume {volume}: {list}', { volume: r.volumeNumber, list }) : t('Imported: {list}', { list }));
      queryClient.invalidateQueries({ queryKey: keys.novels });
      queryClient.invalidateQueries({ queryKey: keys.series });
      onClose();
      navigate(`/novel/${r.novelId}/write`);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };

  const unsepTotal = preview ? preview.unseparated.summary + preview.unseparated.prose : 0;
  const isZip = preview?.kind === 'zip' || preview?.kind === 'novelcrafter-zip';
  const canBeNc = preview?.kind === 'docx' || isZip;
  const codexDetail = preview
    ? Object.entries(preview.codex.byType)
        .sort((a, b) => b[1] - a[1])
        .map(([ty, n]) => {
          const forms = TYPE_PLURAL[ty];
          return forms ? tn(n, forms[0], forms[1]) : `${formatNumber(n)} ${codexTypeLabel(ty)}`;
        })
        .join(', ')
    : '';

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-xl"
      title={t('Import novel')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!preview || !!error || loading} onClick={run}>
            {t('Import')}
          </Button>
        </>
      }
    >
      <div className="mb-3 truncate text-xs text-stone-500" title={file.name}>
        {file.name}
      </div>
      {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      {!preview ? (
        !error && (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Spinner /> {t('Reading file…')}
          </div>
        )
      ) : (
        <div className={cn('space-y-5', loading && 'opacity-60')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Title')} hint={preview.author ? t('Author in the file: {author}', { author: preview.author }) : undefined}>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleTouched(true);
                }}
              />
            </Field>
            <Field label={t('Series')} hint={seriesId ? t('Will be added as the next volume.') : undefined}>
              <Select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
                <option value="">{t('(standalone novel)')}</option>
                {(seriesList ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {canBeNc && (
            <section className="space-y-1">
              <Checkbox
                checked={nc}
                onChange={(v) => setFormat(v ? 'novelcrafter' : 'simple')}
                label={t('Novelcrafter export')}
                hint={t('Summary and prose separated, Codex from the Novelcrafter folders, snippets, and chats.')}
              />
              {!nc && preview.detected === 'novelcrafter' && (
                <p className="pl-6 text-xs text-amber-700 dark:text-amber-500">
                  {t('Looks like a Novelcrafter export — check this to separate summaries.')}
                </p>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{t('Manuscript')}</h3>
            <p className="text-sm">
              {preview.acts > 1 && `${tn(preview.acts, '{n} act', '{n} acts')} · `}
              {tn(preview.chapters, '{n} chapter', '{n} chapters')} · {tn(preview.scenes, '{n} scene', '{n} scenes')}
              {preview.files > 1 && (
                <span className="text-stone-500"> · {tn(preview.files, 'from {n} file (one chapter each)', 'from {n} files (one chapter each)')}</span>
              )}
            </p>
            {!nc && (
              <p className="mt-0.5 text-xs text-stone-500">
                {tr('Everything becomes prose. Headings divide it into chapters (or acts and scenes); <code>* * *</code> and horizontal lines start a new scene.')}
              </p>
            )}
            {!nc && preview.missingHeadings && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">{tr(NO_HEADINGS_HINT[preview.missingHeadings])}</p>
            )}
            {isZip && !nc && !preview.files && (
              <p className="mt-0.5 text-xs text-stone-500">{t('No manuscript file found — an empty novel will be created.')}</p>
            )}
          </section>

          {nc && preview.separatorLines > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t('Horizontal line (____) in scenes')}</h3>
              <Radio
                checked={separator === 'summary'}
                onChange={() => setSeparator('summary')}
                label={t('separates summary and prose')}
                hint={
                  separator === 'summary'
                    ? tn(
                        preview.separated,
                        '{n} scene: text above the line becomes the summary, text below it becomes prose. This is how Novelcrafter exports with summaries.',
                        '{n} scenes: text above the line becomes the summary, text below it becomes prose. This is how Novelcrafter exports with summaries.',
                      )
                    : t('This is how Novelcrafter exports with summaries.')
                }
              />
              <Radio
                checked={separator === 'scene-break'}
                onChange={() => setSeparator('scene-break')}
                label={t('is a scene break')}
                hint={t('For Word documents in which lines separate scenes.')}
              />
            </section>
          )}

          {nc && unsepTotal > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
                {preview.separatorLines > 0 && separator === 'summary'
                  ? tn(unsepTotal, '{n} scene without a divider line', '{n} scenes without a divider line')
                  : tn(unsepTotal, 'Text of {n} scene', 'Text of the {n} scenes')}
              </h3>
              <Radio
                checked={unseparated === 'auto'}
                onChange={() => setUnseparated('auto')}
                label={t('detect automatically')}
                hint={t('{summary} look like summaries (a few long paragraphs, hardly any dialogue), {prose} look like prose.', {
                  summary: formatNumber(preview.unseparated.summary),
                  prose: formatNumber(preview.unseparated.prose),
                })}
              />
              <Radio
                checked={unseparated === 'summary'}
                onChange={() => setUnseparated('summary')}
                label={t('is the summary')}
                hint={t('Scenes stay empty and can be written later.')}
              />
              <Radio checked={unseparated === 'prose'} onChange={() => setUnseparated('prose')} label={t('is prose')} />
            </section>
          )}

          {isZip && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t('Also import')}</h3>
              <Checkbox
                checked={withCodex && preview.codex.total > 0}
                onChange={setWithCodex}
                label={
                  <span className={cn(!preview.codex.total && 'text-stone-400')}>
                    {nc
                      ? tn(preview.codex.total, '{n} codex entry', '{n} codex entries')
                      : tn(preview.codex.total, '{n} codex entry from “Context”', '{n} codex entries from “Context”')}
                  </span>
                }
                hint={codexDetail || undefined}
              />
              <Checkbox
                checked={withSnippets && preview.snippets > 0}
                onChange={setWithSnippets}
                label={<span className={cn(!preview.snippets && 'text-stone-400')}>{tn(preview.snippets, '{n} snippet', '{n} snippets')}</span>}
              />
              {nc && (
                <Checkbox
                  checked={withChats && preview.chats > 0}
                  onChange={setWithChats}
                  label={<span className={cn(!preview.chats && 'text-stone-400')}>{tn(preview.chats, '{n} chat', '{n} chats')}</span>}
                  hint={preview.chats ? t('With the default chat prompt; you choose the model when you continue the chat.') : undefined}
                />
              )}
            </section>
          )}

          {!nc && (
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">{t('What a zip for import looks like')}</summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-stone-100 p-3 font-mono text-[11px] leading-relaxed text-stone-700 dark:bg-stone-800 dark:text-stone-300">{t(SIMPLE_ZIP_LAYOUT)}</pre>
              <p className="mt-2">
                {tr(
                  'Markdown files in the Context folder may start with a header, e.g. <code>aliases: Annie, Mrs. Berg</code>, <code>type: character</code>, or <code>always: true</code> (always send to the AI). Other lines such as <code>Age: 31</code> become custom fields.',
                )}
              </p>
            </details>
          )}

          {preview.warnings.length > 0 && (
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">{t('Notes while reading ({n})', { n: preview.warnings.length })}</summary>
              <ul className="mt-1 list-disc pl-5">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
