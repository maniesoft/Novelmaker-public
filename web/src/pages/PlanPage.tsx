import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sparkles, Trash2 } from 'lucide-react';
import type { Outline, SceneMeta } from '@novelmaker/shared';
import { api } from '../lib/api';
import { keys, queryClient, useCodex, useOutline } from '../lib/queries';
import { toast } from '../lib/store';
import { Badge, Button, formatNumber, IconButton, Spinner, Textarea } from '../components/ui';
import { SummariesDialog } from '../components/SummariesDialog';
import { chapterLabel, deleteOutlineItem, sceneLabel, visibility } from './OutlineTree';
import { t, tn } from '../lib/i18n';

export function PlanPage() {
  const { novelId = '' } = useParams();
  const { data: outline, isLoading } = useOutline(novelId);
  const { data: codex } = useCodex(novelId);
  const [mentions, setMentions] = useState<Record<string, string[]>>({});
  const [dialog, setDialog] = useState(false);
  useEffect(() => {
    api.get<Record<string, string[]>>(`/api/novels/${novelId}/mentions`).then(setMentions, () => undefined);
  }, [novelId, outline]);
  const names = useMemo(() => new Map((codex?.entries ?? []).map((e) => [e.id, e])), [codex]);
  if (isLoading || !outline) return <div className="p-6"><Spinner /></div>;
  const { showActs } = visibility(outline);
  let chNo = 0;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold">{t('Plan')}</h1>
            <p className="text-sm text-stone-500">{t('Chapters and scenes as cards. Edit summaries directly — they feed storySoFar.')}</p>
          </div>
          <Button className="ml-auto" icon={<Sparkles className="size-4" />} onClick={() => setDialog(true)}>
            {t('Generate summaries')}
          </Button>
        </div>
        {outline.acts.map((act, ai) => (
          <div key={act.id} className="mb-8">
            {showActs && (
              <div className="group mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">{act.title || t('Act {n}', { n: ai + 1 })}</h2>
                {outline.acts.length > 1 && (
                  <IconButton title={t('Delete act')} className="opacity-40 group-hover:opacity-100 hover:text-red-600" onClick={() => void deleteOutlineItem(outline, 'act', act.id)}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                )}
              </div>
            )}
            {act.chapters.map((ch) => {
              chNo++;
              return (
                <div key={ch.id} className="mb-6 rounded-xl border border-stone-200 bg-white/60 p-4 dark:border-stone-800 dark:bg-stone-900/40">
                  <div className="group mb-2 flex items-baseline gap-2">
                    <h3 className="font-serif text-lg font-semibold">{chapterLabel(ch, chNo)}</h3>
                    <span className="text-xs text-stone-500">{tn(ch.scenes.reduce((n, s) => n + s.wordCount, 0), '{n} word', '{n} words')}</span>
                    <IconButton title={t('Delete chapter')} className="ml-auto self-center opacity-40 group-hover:opacity-100 hover:text-red-600" onClick={() => void deleteOutlineItem(outline, 'chapter', ch.id)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                  <SummaryField
                    value={ch.summary}
                    placeholder={t('Chapter summary…')}
                    onSave={(summary) => api.patch(`/api/chapters/${ch.id}`, { summary }).then(() => queryClient.invalidateQueries({ queryKey: keys.outline(novelId) }))}
                  />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {ch.scenes.map((s, i) => (
                      <SceneCard key={s.id} novelId={novelId} scene={s} index={i} outline={outline} mentions={(mentions[s.id] ?? []).map((id) => names.get(id)?.name).filter(Boolean) as string[]} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {dialog && <SummariesDialog novelId={novelId} onClose={() => setDialog(false)} />}
    </div>
  );
}

function SummaryField({ value, onSave, placeholder }: { value: string; onSave: (v: string) => Promise<unknown>; placeholder: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Textarea
      autoGrow
      rows={2}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v).catch(toast.error)}
      className="border-transparent bg-transparent text-[13px] hover:border-stone-200 focus:bg-white dark:hover:border-stone-700 dark:focus:bg-stone-900"
    />
  );
}

function SceneCard({ novelId, scene, index, outline, mentions }: { novelId: string; scene: SceneMeta; index: number; outline: Outline; mentions: string[] }) {
  const navigate = useNavigate();
  const pov = scene.povCharacterId ?? outline.novel.povCharacterId;
  void pov;
  return (
    <div className="group flex flex-col rounded-lg border border-stone-200 bg-stone-50 p-3 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="mb-1 flex items-center gap-2">
        <button type="button" onClick={() => navigate(`/novel/${novelId}/write/${scene.id}`)} className="flex min-w-0 flex-1 items-baseline gap-2 text-left">
          <span className="truncate font-medium hover:underline">{sceneLabel(scene, index + 1)}</span>
          <span className="ml-auto shrink-0 text-[11px] text-stone-400">{t('{n} w.', { n: formatNumber(scene.wordCount) })}</span>
        </button>
        <IconButton title={t('Delete scene')} className="size-6 opacity-30 group-hover:opacity-100 hover:text-red-600" onClick={() => void deleteOutlineItem(outline, 'scene', scene.id)}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
      <SummaryField
        value={scene.summary}
        placeholder={t('Summary…')}
        onSave={(summary) => api.patch(`/api/scenes/${scene.id}`, { summary }).then(() => queryClient.invalidateQueries({ queryKey: keys.outline(novelId) }))}
      />
      <div className="mt-auto flex flex-wrap gap-1 pt-2">
        {scene.hideFromAI && <Badge tone="red">{t('hidden from the AI')}</Badge>}
        {scene.labels.map((l) => (
          <Badge key={l} tone="sky">
            {l}
          </Badge>
        ))}
        {mentions.slice(0, 6).map((m) => (
          <Badge key={m} tone="amber">
            {m}
          </Badge>
        ))}
        {mentions.length > 6 && <Badge>+{mentions.length - 6}</Badge>}
      </div>
    </div>
  );
}
