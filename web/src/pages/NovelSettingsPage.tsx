import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Copy, Download, FileDown, ImagePlus, Library, ListPlus, Loader2, Plus, Save, Sparkles, Trash2, Unlink } from 'lucide-react';
import type { CodexEntry, Novel, NovelListItem, NovelSettings, Series } from '@novelmaker/shared';
import { api, download } from '../lib/api';
import { keys, patchSettings, queryClient, useCodex, useNovel, useNovels, usePrompts, useSeriesList, useSettings } from '../lib/queries';
import { copyPart, downloadPart } from '../lib/exporting';
import { toast } from '../lib/store';
import { Badge, Button, Checkbox, cn, confirmDialog, Field, Input, Modal, Select, Spinner, Textarea } from '../components/ui';
import { SummariesDialog } from '../components/SummariesDialog';
import { LanguageSelect, novelDeleteConfirm, PovSelect } from './LibraryPage';
import { coverUrl, NovelCover } from '../components/NovelCover';
import { t } from '../lib/i18n';

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 mb-3 text-sm text-stone-500">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

export function NovelSettingsPage() {
  const { novelId = '' } = useParams();
  const { data: novel } = useNovel(novelId);
  if (!novel) return <div className="p-6"><Spinner /></div>;
  return <SettingsForm key={`${novel.id}:${novel.seriesId ?? ''}`} novel={novel} />;
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

function afterNovelSaved(novel: Novel) {
  queryClient.setQueryData(keys.novel(novel.id), novel);
  queryClient.invalidateQueries({ queryKey: keys.outline(novel.id) });
  queryClient.invalidateQueries({ queryKey: keys.novels });
}

function SettingsForm({ novel }: { novel: Novel }) {
  const navigate = useNavigate();
  const [n, setN] = useState(novel);
  const { data: codex } = useCodex(novel.id);
  const { data: prompts } = usePrompts();
  const { data: appSettings } = useSettings();
  const { data: seriesList } = useSeriesList();
  const series = seriesList?.find((s) => s.id === novel.seriesId) ?? null;
  const [seriesDraft, setSeriesDraft] = useState<Pick<Series, 'title' | 'description'> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<Novel>>({});
  const pendingSeries = useRef<Partial<Series>>({});
  const [state, setState] = useState<SaveState>('saved');
  const [summaries, setSummaries] = useState(false);
  const [convert, setConvert] = useState(false);
  const [join, setJoin] = useState(false);

  useEffect(() => {
    if (series && !seriesDraft) setSeriesDraft({ title: series.title, description: series.description });
  }, [series, seriesDraft]);

  /** Alles Ausstehende speichern (Roman und ggf. Serie). */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    const sPatch = pendingSeries.current;
    pending.current = {};
    pendingSeries.current = {};
    if (!Object.keys(patch).length && !Object.keys(sPatch).length) {
      setState((s) => (s === 'dirty' ? 'saved' : s));
      return;
    }
    setState('saving');
    try {
      if (Object.keys(patch).length) afterNovelSaved(await api.patch<Novel>(`/api/novels/${novel.id}`, patch));
      if (Object.keys(sPatch).length && novel.seriesId) {
        await api.patch(`/api/series/${novel.seriesId}`, sPatch);
        queryClient.invalidateQueries({ queryKey: keys.series });
      }
      const more = Object.keys(pending.current).length || Object.keys(pendingSeries.current).length;
      setState(more ? 'dirty' : 'saved');
    } catch (e) {
      // nicht verlieren: beim nächsten Speichern erneut versuchen
      pending.current = { ...patch, ...pending.current };
      pendingSeries.current = { ...sPatch, ...pendingSeries.current };
      setState('error');
      toast.error(e);
    }
  }, [novel.id, novel.seriesId]);

  const schedule = (immediate: boolean) => {
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), immediate ? 0 : 800);
  };
  const update = (patch: Partial<Novel>, immediate = false) => {
    setN((x) => ({ ...x, ...patch, settings: patch.settings ? { ...x.settings, ...patch.settings } : x.settings }));
    pending.current = { ...pending.current, ...patch, settings: patch.settings ? { ...(pending.current.settings ?? {}), ...patch.settings } : pending.current.settings };
    schedule(immediate);
  };
  const updateSeries = (patch: Partial<Series>) => {
    setSeriesDraft((d) => (d ? { ...d, ...patch } : d));
    pendingSeries.current = { ...pendingSeries.current, ...patch };
    schedule(false);
  };
  const setSetting = (s: Partial<NovelSettings>) => update({ settings: s as NovelSettings }, true);

  // beim Verlassen der Seite und beim Schließen des Tabs speichern; Strg+S speichert sofort
  useEffect(() => {
    const onUnload = () => {
      const patch = pending.current;
      if (Object.keys(patch).length)
        void fetch(`/api/novels/${novel.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch), keepalive: true });
      const sPatch = pendingSeries.current;
      if (Object.keys(sPatch).length && novel.seriesId)
        void fetch(`/api/series/${novel.seriesId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sPatch), keepalive: true });
      pending.current = {};
      pendingSeries.current = {};
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('keydown', onKey);
      void flush();
    };
  }, [flush, novel.id, novel.seriesId]);

  const characters = (codex?.entries ?? []).filter((e) => e.type === 'character');
  const summaryPrompts = (prompts ?? []).filter((p) => p.type === 'summary');
  const triState = (v: boolean | null | undefined) => (v == null ? 'auto' : v ? 'on' : 'off');
  const fromTri = (v: string) => (v === 'auto' ? null : v === 'on');
  const otherSeries = seriesList ?? [];

  const remove = async () => {
    const listed = queryClient.getQueryData<NovelListItem[]>(keys.novels)?.find((x) => x.id === novel.id);
    if (!(await confirmDialog(novelDeleteConfirm(listed ?? novel)))) return;
    pending.current = {};
    pendingSeries.current = {};
    await api.del(`/api/novels/${novel.id}`);
    queryClient.invalidateQueries({ queryKey: keys.novels });
    navigate('/');
  };

  const leaveSeries = async () => {
    const ok = await confirmDialog({
      title: t('Remove “{title}” from the series?', { title: n.title }),
      message: t('The volume becomes a standalone novel again. Series-level codex entries stay with the series and will no longer be visible in this novel.'),
      confirmLabel: t('Remove from series'),
    });
    if (!ok) return;
    await flush();
    try {
      afterNovelSaved(await api.post<Novel>(`/api/novels/${novel.id}/leave-series`));
      queryClient.invalidateQueries({ queryKey: keys.codex(novel.id) });
      toast.success(t('The novel is now a standalone novel.'));
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
          <h1 className="text-xl font-semibold">{t('Novel settings')}</h1>
          <Section title={t('Basics')}>
            <div className="flex flex-col gap-5 sm:flex-row">
              <CoverField novel={n} onChanged={(x) => setN((cur) => ({ ...cur, coverVersion: x.coverVersion }))} />
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <Field label={t('Title')}>
                  <Input value={n.title} onChange={(e) => update({ title: e.target.value })} />
                </Field>
                <Field label={t('Author')}>
                  <Input value={n.author} onChange={(e) => update({ author: e.target.value })} />
                </Field>
                <Field label={t('Language')} hint={t('Used as {novel.language}.')}>
                  <LanguageSelect value={n.language} onChange={(v) => update({ language: v }, true)} />
                </Field>
                <Field label={t('Tense')} hint="{novel.tense}">
                  <Select value={n.tense} onChange={(e) => update({ tense: e.target.value as Novel['tense'] }, true)}>
                    <option value="past">{t('Past tense')}</option>
                    <option value="present">{t('Present tense')}</option>
                  </Select>
                </Field>
                <Field label={t('Default point of view')} hint={t('{pov} turns this into a sentence.')}>
                  <PovSelect value={n.povType} onChange={(v) => update({ povType: v as Novel['povType'] }, true)} />
                </Field>
                <Field label={t('Default POV character')}>
                  <Select value={n.povCharacterId ?? ''} onChange={(e) => update({ povCharacterId: e.target.value || null }, true)}>
                    <option value="">{t('(none)')}</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
            <Field label={t('Description / blurb')} className="mt-3" hint={t('{novel.description} — appears in the chat context.')}>
              <Textarea autoGrow rows={3} value={n.description} onChange={(e) => update({ description: e.target.value })} />
            </Field>
            <Field label={t('Additional instructions for the AI')} className="mt-3" hint={t('Added to beat and chat prompts via the Novelmaker/AdditionalInstructions component.')}>
              <Textarea autoGrow rows={4} value={n.additionalInstructions} onChange={(e) => update({ additionalInstructions: e.target.value })} />
            </Field>
          </Section>

          {n.seriesId && series && seriesDraft ? (
            <SeriesSection novel={n} series={series} draft={seriesDraft} onSeries={updateSeries} onVolume={(v) => update({ volumeNumber: v })} onLeave={leaveSeries} flush={flush} />
          ) : (
            <Section
              title={t('Series')}
              hint={t('This novel is a standalone book. You can turn it into a new series or add it as another volume to an existing series.')}
            >
              <div className="flex flex-wrap gap-2">
                <Button icon={<Library className="size-4" />} onClick={() => setConvert(true)}>
                  {t('Create new series…')}
                </Button>
                <Button
                  icon={<ListPlus className="size-4" />}
                  disabled={!otherSeries.length}
                  title={otherSeries.length ? '' : t('There’s no series yet.')}
                  onClick={() => setJoin(true)}
                >
                  {t('Add to existing series…')}
                </Button>
              </div>
            </Section>
          )}

          <Section
            title={t('Outline')}
            hint={t('Acts and scenes are optional. “Auto” only shows the level if there is more than one act or more than one scene in the chapter.')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Act level')}>
                <Select value={triState(n.settings.showActs)} onChange={(e) => setSetting({ showActs: fromTri(e.target.value) })}>
                  <option value="auto">{t('Auto')}</option>
                  <option value="on">{t('Always show')}</option>
                  <option value="off">{t('Hide')}</option>
                </Select>
              </Field>
              <Field label={t('Scene level')}>
                <Select value={triState(n.settings.showScenes)} onChange={(e) => setSetting({ showScenes: fromTri(e.target.value) })}>
                  <option value="auto">{t('Auto')}</option>
                  <option value="on">{t('Always show')}</option>
                  <option value="off">{t('Hide')}</option>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title={t('AI context')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Token budget for codex.context')} hint={t('0 = unlimited. Priority: always > POV > pinned > mentioned > rest.')}>
                <Input type="number" min={0} step={500} value={n.settings.codexTokenBudget ?? 0} onChange={(e) => setSetting({ codexTokenBudget: Number(e.target.value) || 0 })} />
              </Field>
              <Field label={t('Format for Codex, scenes, etc.')}>
                <Select value={n.settings.contextFormat ?? 'xml'} onChange={(e) => setSetting({ contextFormat: e.target.value as NovelSettings['contextFormat'] })}>
                  <option value="xml">XML</option>
                  <option value="markdown">Markdown</option>
                  <option value="plain">{t('Plain text')}</option>
                </Select>
              </Field>
            </div>
            <div className="mt-3 space-y-2">
              <Checkbox
                checked={!!n.settings.codexScanPreviousScene}
                onChange={(v) => setSetting({ codexScanPreviousScene: v })}
                label={t('Also consider mentions in the previous scene')}
              />
              <Checkbox
                checked={!!n.settings.codexRecursive}
                onChange={(v) => setSetting({ codexRecursive: v })}
                label={t('Recursive: entries mentioned in included entries are included too (one level)')}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(['scene', 'chapter', 'novel'] as const).map((lvl) => (
                <Field key={lvl} label={lvl === 'scene' ? t('Scene prompt') : lvl === 'chapter' ? t('Chapter prompt') : t('Novel prompt')}>
                  <Select value={n.settings.summaryPrompts?.[lvl] ?? ''} onChange={(e) => setSetting({ summaryPrompts: { ...n.settings.summaryPrompts, [lvl]: e.target.value || undefined } })}>
                    <option value="">{t('Default')}</option>
                    {summaryPrompts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <Button className="mt-4" icon={<Sparkles className="size-4" />} onClick={() => setSummaries(true)}>
              {t('Generate summaries…')}
            </Button>
          </Section>

          <Section title={t('Export')}>
            <div className="flex flex-wrap gap-2">
              <Button icon={<FileDown className="size-4" />} onClick={() => void downloadPart(novel.id, { scope: 'novel' })}>
                Word (docx)
              </Button>
              <Button icon={<FileDown className="size-4" />} onClick={() => void downloadPart(novel.id, { scope: 'novel' }, 'markdown')}>
                Markdown
              </Button>
              <Button icon={<Copy className="size-4" />} onClick={() => void copyPart(novel.id, { scope: 'novel' })}>
                {t('Copy whole novel')}
              </Button>
              <Button icon={<Download className="size-4" />} onClick={() => download('/api/backup/export.json')}>
                {t('Full backup (JSON)')}
              </Button>
            </div>
            <div className="mt-3">
              <Checkbox
                checked={appSettings?.exportSceneHeadings ?? true}
                onChange={(v) => void patchSettings({ exportSceneHeadings: v }).catch(toast.error)}
                label={t('Scenes as headings (outline)')}
                hint={t('On: act › chapter › scene as headings, e.g. for the navigation pane in Word. Off: scenes separated only by “* * *”. Applies to all apps.')}
              />
            </div>
            <p className="mt-2 text-xs text-stone-500">
              {t(
                'You can copy or export individual acts, chapters, and scenes via their menu (…) in the outline. Beats, hidden notes, and hidden frames aren’t part of the manuscript and are neither exported nor copied.',
              )}
            </p>
          </Section>

          <Section title={t('Danger zone')}>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={remove}>
              {t('Delete novel')}
            </Button>
          </Section>
        </div>
      </div>
      <SaveBar state={state} onSave={() => void flush()} />
      {summaries && <SummariesDialog novelId={novel.id} onClose={() => setSummaries(false)} />}
      {convert && codex && <ConvertDialog novel={n} entries={codex.entries} onClose={() => setConvert(false)} />}
      {join && codex && <JoinSeriesDialog novel={n} entries={codex.entries} series={otherSeries} onClose={() => setJoin(false)} />}
    </div>
  );
}

/** Leiste unten: Speicherstatus und Speichern-Knopf (Änderungen werden außerdem automatisch gespeichert). */
function SaveBar({ state, onSave }: { state: SaveState; onSave: () => void }) {
  return (
    <div className="shrink-0 border-t border-stone-200 bg-white/90 py-2 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
      {/* links in der Formularspalte – rechts unten erscheinen die Meldungen */}
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-6">
        <Button variant={state === 'dirty' || state === 'error' ? 'primary' : 'secondary'} icon={<Save className="size-4" />} onClick={onSave} title={t('Save (Ctrl+S)')}>
          {t('Save')}
        </Button>
        <span className={cn('flex items-center gap-1.5 text-sm', state === 'error' ? 'text-red-600' : 'text-stone-500')}>
          {state === 'saving' && <Loader2 className="size-3.5 animate-spin" />}
          {state === 'saved' && <Check className="size-3.5 text-emerald-600" />}
          {state === 'saved'
            ? t('All changes saved')
            : state === 'saving'
              ? t('Saving…')
              : state === 'error'
                ? t('Error saving — try again')
                : t('Unsaved changes')}
        </span>
        <span className="ml-auto hidden text-xs text-stone-400 sm:inline">{t('Also saves automatically · Ctrl+S')}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Cover

/** Bild im Browser verkleinern (max. 1200 px hoch), damit die Datenbank klein bleibt. */
async function prepareCover(file: File): Promise<{ mime: string; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(t('The image couldn’t be read.')));
      i.src = url;
    });
    const scale = Math.min(1, 1200 / img.naturalHeight, 1200 / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    return { mime: 'image/jpeg', data: dataUrl.split(',')[1] ?? '' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function CoverField({ novel, onChanged }: { novel: Novel; onChanged: (n: Novel) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const body = await prepareCover(file);
      const updated = await api.put<Novel>(`/api/novels/${novel.id}/cover`, body);
      afterNovelSaved(updated);
      onChanged(updated);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const updated = await api.del<Novel>(`/api/novels/${novel.id}/cover`);
    afterNovelSaved(updated);
    onChanged(updated);
  };
  return (
    <div className="w-36 shrink-0">
      <div className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-400">{t('Cover')}</div>
      <button
        type="button"
        className="group relative block w-full"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void upload(f);
        }}
        title={t('Choose an image or drag it here')}
      >
        <NovelCover novel={novel} className="w-full" />
        <span className="absolute inset-0 flex items-center justify-center rounded-md bg-stone-950/0 text-white opacity-0 transition group-hover:bg-stone-950/40 group-hover:opacity-100">
          {busy ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
      <div className="mt-1.5 flex gap-2 text-xs">
        <button type="button" className="text-amber-700 hover:underline dark:text-amber-400" onClick={() => fileRef.current?.click()}>
          {novel.coverVersion ? t('Change') : t('Choose image')}
        </button>
        {novel.coverVersion && (
          <>
            <a className="text-stone-500 hover:underline" href={coverUrl(novel)!} target="_blank" rel="noreferrer">
              {t('Full size')}
            </a>
            <button type="button" className="text-stone-500 hover:text-red-600 hover:underline" onClick={remove}>
              {t('Remove')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Serie

function SeriesSection({
  novel,
  series,
  draft,
  onSeries,
  onVolume,
  onLeave,
  flush,
}: {
  novel: Novel;
  series: Series;
  draft: Pick<Series, 'title' | 'description'>;
  onSeries: (p: Partial<Series>) => void;
  onVolume: (v: number) => void;
  onLeave: () => void;
  flush: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const { data: novels } = useNovels();
  const volumes = (novels ?? []).filter((x) => x.seriesId === series.id).sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
  const addVolume = async () => {
    await flush();
    const v = await api.post<Novel>(`/api/series/${series.id}/volumes`, {});
    queryClient.invalidateQueries({ queryKey: keys.novels });
    navigate(`/novel/${v.id}/settings`);
  };
  const createEntry = async () => {
    const r = await api.post<{ ok: boolean; error?: string }>('/api/jobs/volume-entry', { novelId: novel.id, inclusion: 'auto' });
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(t('Volume entry in the Codex updated.'));
      queryClient.invalidateQueries({ queryKey: keys.codex(novel.id) });
    }
  };
  return (
    <Section title={t('Series')}>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label={t('Series title')}>
          <Input value={draft.title} onChange={(e) => onSeries({ title: e.target.value })} />
        </Field>
        <Field label={t('Volume number')}>
          <Input type="number" min={1} value={novel.volumeNumber ?? 1} onChange={(e) => onVolume(Number(e.target.value) || 1)} />
        </Field>
      </div>
      <Field label={t('Series description')} className="mt-3" hint="{series.description}">
        <Textarea autoGrow rows={2} value={draft.description} onChange={(e) => onSeries({ description: e.target.value })} />
      </Field>
      <div className="mt-4">
        <div className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-400">{t('Volumes')}</div>
        <div className="space-y-1">
          {volumes.map((v) => (
            <button key={v.id} type="button" onClick={() => navigate(`/novel/${v.id}/write`)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800">
              <Badge tone="amber">{t('Volume {n}', { n: v.volumeNumber ?? '' })}</Badge>
              <span className="flex-1">{v.title}</span>
              {v.summary ? <Badge tone="green">{t('Summary')}</Badge> : <Badge>{t('without summary')}</Badge>}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" icon={<Plus className="size-4" />} onClick={addVolume}>
            {t('New volume')}
          </Button>
          <Button size="sm" onClick={createEntry} disabled={!novel.summary} title={novel.summary ? '' : t('Generate a volume summary first')}>
            {t('Volume entry from existing summary')}
          </Button>
          <Button size="sm" variant="ghost" icon={<Unlink className="size-4" />} onClick={onLeave}>
            {t('Remove from series')}
          </Button>
        </div>
      </div>
      {novel.summary && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">{t('Summary of this volume')}</summary>
          <p className="mt-2 whitespace-pre-wrap text-stone-600 dark:text-stone-300">{novel.summary}</p>
        </details>
      )}
    </Section>
  );
}

function CodexChecklist({ entries, selected, onToggle }: { entries: CodexEntry[]; selected: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-stone-200 p-2 dark:border-stone-800">
      {entries.map((e) => (
        <Checkbox key={e.id} checked={selected.has(e.id)} onChange={() => onToggle(e.id)} label={e.name} />
      ))}
      {!entries.length && <div className="text-sm text-stone-500">{t('There are no codex entries.')}</div>}
    </div>
  );
}

function useSelection(initial: () => Set<string>) {
  const [selected, setSelected] = useState(initial);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return [selected, toggle] as const;
}

function refreshAfterSeriesChange(novelId: string) {
  queryClient.invalidateQueries({ queryKey: keys.novels });
  queryClient.invalidateQueries({ queryKey: keys.series });
  queryClient.invalidateQueries({ queryKey: keys.novel(novelId) });
  queryClient.invalidateQueries({ queryKey: keys.codex(novelId) });
}

function ConvertDialog({ novel, entries, onClose }: { novel: Novel; entries: CodexEntry[]; onClose: () => void }) {
  const [title, setTitle] = useState(novel.title);
  const [selected, toggle] = useSelection(() => new Set(entries.filter((e) => e.type === 'character' || e.type === 'location' || e.inclusion === 'always').map((e) => e.id)));
  const run = async () => {
    try {
      await api.post(`/api/novels/${novel.id}/convert-to-series`, { title, codexIds: [...selected] });
      refreshAfterSeriesChange(novel.id);
      toast.success(t('Series created — this novel is now volume 1.'));
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Create new series')}
      width="max-w-2xl"
      footer={
        <Button variant="primary" onClick={run}>
          {t('Create series')}
        </Button>
      }
    >
      <Field label={t('Series title')}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="mt-4 mb-1 text-xs font-medium text-stone-600 dark:text-stone-400">{t('Move these codex entries to the series level (they’ll apply to all volumes):')}</div>
      <CodexChecklist entries={entries} selected={selected} onToggle={toggle} />
    </Modal>
  );
}

function JoinSeriesDialog({ novel, entries, series, onClose }: { novel: Novel; entries: CodexEntry[]; series: Series[]; onClose: () => void }) {
  const { data: novels } = useNovels();
  const [seriesId, setSeriesId] = useState(series[0]?.id ?? '');
  const nextVolume = (id: string) => Math.max(0, ...(novels ?? []).filter((x) => x.seriesId === id).map((x) => x.volumeNumber ?? 0)) + 1;
  const [volume, setVolume] = useState<number | null>(null);
  const [selected, toggle] = useSelection(() => new Set());
  const volumes = (novels ?? []).filter((x) => x.seriesId === seriesId).sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
  const run = async () => {
    try {
      const r = await api.post<Novel>(`/api/novels/${novel.id}/join-series`, { seriesId, volumeNumber: volume ?? nextVolume(seriesId), codexIds: [...selected] });
      refreshAfterSeriesChange(novel.id);
      toast.success(t('“{title}” is now volume {n} of the series.', { title: novel.title, n: r.volumeNumber ?? '' }));
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Add to existing series')}
      width="max-w-2xl"
      footer={
        <Button variant="primary" disabled={!seriesId} onClick={run}>
          {t('Add')}
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label={t('Series')}>
          <Select
            value={seriesId}
            onChange={(e) => {
              setSeriesId(e.target.value);
              setVolume(null);
            }}
          >
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('As volume no.')}>
          <Input type="number" min={1} value={volume ?? nextVolume(seriesId)} onChange={(e) => setVolume(Number(e.target.value) || 1)} />
        </Field>
      </div>
      {volumes.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">{t('Previous volumes: {list}', { list: volumes.map((v) => `${v.volumeNumber}. ${v.title}`).join(' · ') })}</p>
      )}
      <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
        {t('The series’ codex entries (characters, locations…) will then also be visible in this novel. You can merge or delete duplicate entries later.')}
      </p>
      <div className="mt-4 mb-1 text-xs font-medium text-stone-600 dark:text-stone-400">
        {t('Optional: move this novel’s entries to the series level (they’ll then apply to all volumes):')}
      </div>
      <CodexChecklist entries={entries} selected={selected} onToggle={toggle} />
    </Modal>
  );
}
