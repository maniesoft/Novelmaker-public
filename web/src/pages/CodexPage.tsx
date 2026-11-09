import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Merge, Pin, Plus, Search } from 'lucide-react';
import { CODEX_TYPES, codexTypeLabel, effectiveCodex, type CodexEntry, type CodexType } from '@novelmaker/shared';
import { api } from '../lib/api';
import { keys, queryClient, useCodex, useNovel } from '../lib/queries';
import { isPinned, usePins } from '../lib/pins';
import { toast } from '../lib/store';
import { Badge, Button, cn, confirmDialog, Empty, Input, Spinner } from '../components/ui';
import { CodexEntryEditor } from '../components/CodexEntryEditor';
import { t, tn, tr } from '../lib/i18n';

export function CodexPage() {
  const { novelId = '', entryId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useCodex(novelId);
  const { data: novel } = useNovel(novelId);
  const [q, setQ] = useState('');
  const [type, setType] = useState<CodexType | ''>('');
  const entries = data?.entries ?? [];
  const filtered = entries.filter(
    (e) => (!type || e.type === type) && (!q.trim() || [e.name, ...e.aliases, ...e.tags].some((x) => x.toLowerCase().includes(q.trim().toLowerCase()))),
  );
  const selected = entries.find((e) => e.id === entryId) ?? null;
  const pins = usePins(novelId);
  // gleichnamige Einträge in Band und Serie: in diesem Band gilt die Band-Fassung
  const shadow = useMemo(() => {
    const { redirect } = effectiveCodex(entries);
    return { replaced: redirect, band: new Set(redirect.values()) };
  }, [entries]);

  const create = async () => {
    try {
      const e = await api.post<CodexEntry>(`/api/novels/${novelId}/codex`, { type: type || 'character', name: q.trim() || t('New entry') });
      await queryClient.invalidateQueries({ queryKey: keys.codex(novelId) });
      setQ('');
      navigate(`/novel/${novelId}/codex/${e.id}`);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-stone-200 bg-stone-100/60 dark:border-stone-800 dark:bg-stone-900/40">
        <div className="space-y-2 p-3">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 size-3.5 text-stone-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search…')} className="pl-7" />
          </div>
          <div className="flex flex-wrap gap-1">
            <TypeChip active={!type} onClick={() => setType('')}>
              {t('All')}
            </TypeChip>
            {CODEX_TYPES.map((ct) => (
              <TypeChip key={ct.value} active={type === ct.value} onClick={() => setType(ct.value)}>
                {codexTypeLabel(ct.value)}
              </TypeChip>
            ))}
          </div>
          <Button variant="primary" size="sm" className="w-full" icon={<Plus className="size-4" />} onClick={create}>
            {t('New entry')}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {isLoading && <Spinner />}
          {novel?.seriesId && <DuplicateBanner novelId={novelId} codexKey={entries.length} />}
          {CODEX_TYPES.map((ct) => {
            const list = filtered.filter((e) => e.type === ct.value);
            if (!list.length) return null;
            return (
              <div key={ct.value} className="mb-2">
                <div className="px-2 py-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{codexTypeLabel(ct.value)}</div>
                {list.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => navigate(`/novel/${novelId}/codex/${e.id}`)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm',
                      e.id === entryId ? 'bg-amber-100 dark:bg-amber-900/40' : 'hover:bg-stone-200/60 dark:hover:bg-stone-800',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    {isPinned(pins, 'codex', e.id) && <Pin className="size-3.5 shrink-0 fill-amber-500 text-amber-600" aria-label={t('pinned')} />}
                    {!e.novelId && <Badge tone="violet">{t('Series')}</Badge>}
                    {shadow.replaced.has(e.id) && (
                      <span title={t('In this volume, the volume entry of the same name applies instead — this one isn’t sent to the AI here.')}>
                        <Badge className="line-through">{t('overridden')}</Badge>
                      </span>
                    )}
                    {shadow.band.has(e.id) && (
                      <span title={t('Volume version: replaces the series entry of the same name in this volume.')}>
                        <Badge tone="sky">{t('Volume version')}</Badge>
                      </span>
                    )}
                    {e.inclusion === 'always' && <Badge tone="amber">{t('always')}</Badge>}
                    {e.inclusion === 'never' && <Badge>{t('never')}</Badge>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto">
        {selected && novel ? (
          <CodexEntryEditor
            key={selected.id}
            entry={selected}
            all={entries}
            novelId={novelId}
            inSeries={!!novel.seriesId}
            relations={data?.relations ?? []}
            onOpenEntry={(id) => navigate(`/novel/${novelId}/codex/${id}`)}
            onOpenScene={(id) => navigate(`/novel/${novelId}/write/${id}`)}
            onDeleted={() => navigate(`/novel/${novelId}/codex`)}
          />
        ) : (
          <Empty icon={<BookOpen className="size-12" />} title={t('Codex')}>
            {tr(
              'Characters, locations, objects, lore, and subplots. Entries are automatically included in prompts as soon as their name or an alias appears in the text. Entries with inclusion “always” (style, language, genre) are always included; “never” entries only when explicitly requested via <code>codex.get</code>/<code>codex.aliases</code>.',
            )}
          </Empty>
        )}
      </section>
    </div>
  );
}

/** Hinweis, wenn Band-Einträge identisch auch in der Serie stehen (z. B. nach dem Import eines Bandes in eine Serie). */
function DuplicateBanner({ novelId, codexKey }: { novelId: string; codexKey: number }) {
  const { data } = useQuery({
    queryKey: ['codex-duplicates', novelId, codexKey],
    queryFn: () => api.get<{ identical: { name: string }[]; variants: { name: string }[] }>(`/api/novels/${novelId}/codex/duplicates`),
  });
  const [busy, setBusy] = useState(false);
  const n = data?.identical.length ?? 0;
  if (!n) return null;
  const merge = async () => {
    const ok = await confirmDialog({
      title: tn(n, 'Merge {n} duplicate codex entry?', 'Merge {n} duplicate codex entries?'),
      message: t(
        'These entries have identical content in the volume and in the series: {names}. The volume copies will be deleted; POV character, pins, relationships, and chat context will then point to the series entry. A backup is created first.',
        {
          names: `${data!.identical
            .slice(0, 8)
            .map((d) => d.name)
            .join(', ')}${n > 8 ? ' …' : ''}`,
        },
      ),
      confirmLabel: t('Merge'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post<{ merged: number }>(`/api/novels/${novelId}/codex/merge-duplicates`);
      toast.success(tn(r.merged, 'Merged {n} duplicate entry.', 'Merged {n} duplicate entries.'));
      await queryClient.invalidateQueries({ queryKey: keys.codex(novelId) });
      await queryClient.invalidateQueries({ queryKey: keys.novel(novelId) });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      {tr('<b>{n} duplicate entries:</b> in this volume and with identical content in the series. In this volume, the volume’s copy applies.', { n })}
      <Button size="xs" className="mt-1.5 w-full" icon={<Merge className="size-3.5" />} loading={busy} onClick={merge}>
        {t('Merge')}
      </Button>
    </div>
  );
}

function TypeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-2 py-0.5 text-xs',
        active ? 'bg-amber-700 text-white' : 'bg-stone-200 text-stone-600 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-300',
      )}
    >
      {children}
    </button>
  );
}
