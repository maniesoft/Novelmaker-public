import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookPlus, FileUp, Library, MoreHorizontal, Plus, Trash2, Unlink } from 'lucide-react';
import { languageInfo, type NovelListItem, type Series } from '@novelmaker/shared';
import { api } from '../lib/api';
import { keys, queryClient, useNovels, useSeriesList } from '../lib/queries';
import { toast } from '../lib/store';
import { Button, confirmDialog, Empty, Field, formatDate, formatNumber, IconButton, Input, Menu, MenuItem, Modal, Select, Spinner } from '../components/ui';
import { ImportDialog } from '../components/ImportDialog';
import { NovelCover } from '../components/NovelCover';
import { getLang, N_, t, tn } from '../lib/i18n';

export function LibraryPage() {
  const { data: novels, isLoading } = useNovels();
  const { data: series } = useSeriesList();
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);

  const standalone = (novels ?? []).filter((n) => !n.seriesId);
  const bySeries = (series ?? []).map((s) => ({ series: s, volumes: (novels ?? []).filter((n) => n.seriesId === s.id).sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0)) }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('Library')}</h1>
            <p className="text-sm text-stone-500">{t('Your novels and series — all stored locally in a single file.')}</p>
          </div>
          <div className="ml-auto flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.zip,.md,.markdown,.txt"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) setImportFile(f);
              }}
            />
            <Button icon={<FileUp className="size-4" />} onClick={() => fileRef.current?.click()} title={t('Word, Markdown, or text — or a zip with a manuscript and a Context folder (including Novelcrafter exports)')}>
              {t('Import')}
            </Button>
            <Button variant="primary" icon={<BookPlus className="size-4" />} onClick={() => setCreating(true)}>
              {t('New novel')}
            </Button>
          </div>
        </div>

        {isLoading && <Spinner />}
        {!isLoading && !novels?.length && (
          <Empty icon={<Library className="size-12" />} title={t('No novels yet')}>
            {t('Create your first novel. You can add acts, chapters, and scenes later as you like.')}
            <div className="mt-4">
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                {t('Create novel')}
              </Button>
            </div>
          </Empty>
        )}

        {bySeries.map(({ series: s, volumes }) => (
          <SeriesBlock key={s.id} series={s} volumes={volumes} />
        ))}

        {standalone.length > 0 && (
          <section className="mb-10">
            {bySeries.length > 0 && <h2 className="mb-3 text-sm font-semibold tracking-wide text-stone-500 uppercase">{t('Standalone novels')}</h2>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {standalone.map((n) => (
                <NovelCard key={n.id} novel={n} />
              ))}
            </div>
          </section>
        )}
      </div>
      {creating && <CreateNovelModal onClose={() => setCreating(false)} series={series ?? []} />}
      {importFile && <ImportDialog file={importFile} onClose={() => setImportFile(null)} />}
    </div>
  );
}

function SeriesBlock({ series, volumes }: { series: Series; volumes: NovelListItem[] }) {
  const navigate = useNavigate();
  const addVolume = async () => {
    const n = await api.post<{ id: string }>(`/api/series/${series.id}/volumes`, {});
    queryClient.invalidateQueries({ queryKey: keys.novels });
    navigate(`/novel/${n.id}/settings`);
  };
  const dissolve = async () => {
    const ok = await confirmDialog({
      title: t('Dissolve series “{title}”?', { title: series.title }),
      message: t('The volumes are kept as standalone novels. The series’ codex entries and snippets move to the first volume.'),
      confirmLabel: t('Dissolve'),
    });
    if (!ok) return;
    await api.del(`/api/series/${series.id}`).catch(toast.error);
    queryClient.invalidateQueries({ queryKey: keys.novels });
    queryClient.invalidateQueries({ queryKey: keys.series });
  };
  const removeAll = async () => {
    const words = volumes.reduce((n, v) => n + v.wordCount, 0);
    const ok = await confirmDialog({
      title: t('Delete series “{title}” and all its volumes?', { title: series.title }),
      message: (
        <>
          <p>
            {tn(
              volumes.length,
              '{n} volume ({words} words) will be deleted, along with all scenes, codex entries, snippets, and chats.',
              '{n} volumes ({words} words) will be deleted, along with all scenes, codex entries, snippets, and chats.',
              { words: formatNumber(words) },
            )}
          </p>
          {volumes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-stone-600 dark:text-stone-400">
              {volumes.map((v) => (
                <li key={v.id}>{v.title}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-stone-500">{t('A backup of the database is created automatically first (Settings → Backups).')}</p>
        </>
      ),
    });
    if (!ok) return;
    await api.del(`/api/series/${series.id}?volumes=delete`).catch(toast.error);
    queryClient.invalidateQueries({ queryKey: keys.novels });
    queryClient.invalidateQueries({ queryKey: keys.series });
  };
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold">{series.title}</h2>
        <span className="text-sm text-stone-500">{tn(volumes.length, 'Series · {n} volume', 'Series · {n} volumes')}</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={addVolume}>
            {t('New volume')}
          </Button>
          <Menu trigger={(toggle, ref) => <Button size="sm" variant="ghost" ref={ref} onClick={toggle} icon={<MoreHorizontal className="size-4" />} />}>
            {(close) => (
              <>
                <MenuItem icon={<Unlink />} onClick={() => (close(), void dissolve())}>
                  {t('Dissolve series (keep volumes)')}
                </MenuItem>
                <MenuItem danger icon={<Trash2 />} onClick={() => (close(), void removeAll())}>
                  {t('Delete series and all its volumes')}
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>
      {series.description && <p className="mb-3 max-w-3xl text-sm text-stone-600 dark:text-stone-400">{series.description}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {volumes.map((n) => (
          <NovelCard key={n.id} novel={n} />
        ))}
      </div>
    </section>
  );
}

function NovelCard({ novel }: { novel: NovelListItem }) {
  const navigate = useNavigate();
  const remove = async () => {
    if (!(await confirmDialog(novelDeleteConfirm(novel)))) return;
    await api.del(`/api/novels/${novel.id}`).catch(toast.error);
    queryClient.invalidateQueries({ queryKey: keys.novels });
  };
  return (
    <div
      className="group relative flex cursor-pointer gap-4 rounded-xl border border-stone-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
      onClick={() => navigate(`/novel/${novel.id}/write`)}
    >
      <NovelCover novel={novel} className="w-24 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {novel.volumeNumber != null && <div className="text-xs font-medium text-amber-700 dark:text-amber-500">{t('Volume {number}', { number: novel.volumeNumber })}</div>}
            <h3 className="line-clamp-2 font-serif text-lg leading-snug font-semibold">{novel.title}</h3>
            {novel.author && <div className="truncate text-sm text-stone-500">{novel.author}</div>}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <IconButton title={t('Delete novel')} className="opacity-40 group-hover:opacity-100 hover:text-red-600" onClick={() => void remove()}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        </div>
        <div className="mt-auto space-y-0.5 pt-3 text-xs text-stone-500">
          <div>
            {tn(novel.wordCount, '{n} word', '{n} words')} · {tn(novel.sceneCount, '{n} scene', '{n} scenes')}
          </div>
          <div>{t('last edited {date}', { date: formatDate(novel.updatedAt) })}</div>
        </div>
      </div>
    </div>
  );
}

function CreateNovelModal({ onClose, series }: { onClose: () => void; series: Series[] }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [language, setLanguage] = useState(() => languageInfo(getLang()).novelLanguage);
  const [tense, setTense] = useState('past');
  const [povType, setPovType] = useState('third-limited');
  const [seriesId, setSeriesId] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      let n: { id: string };
      if (seriesId) {
        n = await api.post(`/api/series/${seriesId}/volumes`, { title });
      } else {
        n = await api.post('/api/novels', { title, author, language, tense, povType });
      }
      queryClient.invalidateQueries({ queryKey: keys.novels });
      navigate(`/novel/${n.id}/write`);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('New novel')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" loading={busy} onClick={create}>
            {t('Create')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('Title')}>
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder={t('Working title')} />
        </Field>
        {series.length > 0 && (
          <Field label={t('Series')} hint={t('As a new volume, it inherits the language, tense, and settings of the latest volume.')}>
            <Select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              <option value="">{t('(standalone novel)')}</option>
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {!seriesId && (
          <>
            <Field label={t('Author')}>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('Language')}>
                <LanguageSelect value={language} onChange={setLanguage} />
              </Field>
              <Field label={t('Tense')}>
                <Select value={tense} onChange={(e) => setTense(e.target.value)}>
                  <option value="past">{t('Past')}</option>
                  <option value="present">{t('Present')}</option>
                </Select>
              </Field>
              <Field label={t('Point of view')}>
                <PovSelect value={povType} onChange={setPovType} />
              </Field>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Sicherheitsabfrage für das Löschen eines ganzen Romans (Bibliothek und Roman-Einstellungen). */
export function novelDeleteConfirm(novel: { title: string; wordCount?: number; sceneCount?: number; seriesId?: string | null }) {
  const stats =
    novel.wordCount != null ? tn(novel.wordCount, '{n} word in {scenes}', '{n} words in {scenes}', { scenes: tn(novel.sceneCount ?? 0, '{n} scene', '{n} scenes') }) : null;
  const text =
    stats != null
      ? novel.seriesId
        ? t('The whole novel ({stats}) will be deleted, along with all scenes, summaries, volume-level codex entries, snippets, and chats.', { stats })
        : t('The whole novel ({stats}) will be deleted, along with all scenes, summaries, codex entries, snippets, and chats.', { stats })
      : novel.seriesId
        ? t('The whole novel will be deleted, along with all scenes, summaries, volume-level codex entries, snippets, and chats.')
        : t('The whole novel will be deleted, along with all scenes, summaries, codex entries, snippets, and chats.');
  return {
    title: t('Delete “{title}”?', { title: novel.title }),
    message: (
      <>
        <p>{text}</p>
        <p className="mt-2 text-xs text-stone-500">{t('A backup of the database is created automatically first (Settings → Backups).')}</p>
      </>
    ),
    confirmLabel: t('Delete novel'),
  };
}

export const LANGUAGES = ['German', 'English (US)', 'English (UK)', 'French', 'Spanish', 'Italian', 'Ukrainian', 'Dutch', 'Polish', 'Swedish'];

/** Name der Romansprache in der Sprache selbst (der Wert bleibt englisch, er geht als {novel.language} an die KI). */
const NATIVE_NAMES: Record<string, string> = {
  German: 'Deutsch',
  French: 'Français',
  Spanish: 'Español',
  Italian: 'Italiano',
  Ukrainian: 'Українська',
  Dutch: 'Nederlands',
  Polish: 'Polski',
  Swedish: 'Svenska',
};

export function LanguageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = LANGUAGES.includes(value) ? LANGUAGES : [value, ...LANGUAGES];
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {opts.map((l) => (
        <option key={l} value={l}>
          {NATIVE_NAMES[l] ? `${NATIVE_NAMES[l]} (${l})` : l}
        </option>
      ))}
    </Select>
  );
}

export const POV_OPTIONS = [
  { value: 'first', label: N_('First person') },
  { value: 'third-limited', label: N_('Third person limited') },
  { value: 'third-omniscient', label: N_('Third person omniscient') },
  { value: 'second', label: N_('Second person') },
];

export function PovSelect({ value, onChange, allowInherit, inheritLabel }: { value: string; onChange: (v: string) => void; allowInherit?: boolean; inheritLabel?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowInherit && <option value="">{inheritLabel ?? t('same as novel')}</option>}
      {POV_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {t(o.label)}
        </option>
      ))}
    </Select>
  );
}
