import { useNavigate, useParams } from 'react-router-dom';
import { Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react';
import type { Snippet } from '@novelmaker/shared';
import { api } from '../lib/api';
import { keys, queryClient, useSnippets } from '../lib/queries';
import { Button, cn, confirmDialog, Empty, formatDate, Input, Textarea } from '../components/ui';
import { setSnippetPinned, useSnippetAutosave } from '../components/Pinned';
import { t } from '../lib/i18n';

export function SnippetsPage() {
  const { novelId = '', snippetId } = useParams();
  const navigate = useNavigate();
  const { data: snippets } = useSnippets(novelId);
  const selected = snippets?.find((s) => s.id === snippetId);
  // angeheftete zuerst, sonst wie vom Server (zuletzt geändert zuerst)
  const sorted = [...(snippets ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const create = async () => {
    const s = await api.post<Snippet>(`/api/novels/${novelId}/snippets`, {});
    queryClient.invalidateQueries({ queryKey: keys.snippets(novelId) });
    navigate(`/novel/${novelId}/snippets/${s.id}`);
  };
  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-stone-200 bg-stone-100/60 dark:border-stone-800 dark:bg-stone-900/40">
        <div className="p-3">
          <Button variant="primary" size="sm" className="w-full" icon={<Plus className="size-4" />} onClick={create}>
            {t('New snippet')}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {sorted.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => navigate(`/novel/${novelId}/snippets/${s.id}`)}
              className={cn('block w-full rounded-md px-2 py-1.5 text-left', s.id === snippetId ? 'bg-amber-100 dark:bg-amber-900/40' : 'hover:bg-stone-200/60 dark:hover:bg-stone-800')}
            >
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                {s.pinned && <Pin className="size-3.5 shrink-0 fill-amber-500 text-amber-600" aria-label={t('pinned')} />}
              </div>
              <div className="truncate text-xs text-stone-500">{s.text.slice(0, 80) || t('empty')}</div>
            </button>
          ))}
        </div>
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <SnippetEditor key={selected.id} snippet={selected} novelId={novelId} />
        ) : (
          <Empty icon={<StickyNote className="size-12" />} title={t('Snippets')}>
            {t('Free-form notes, research, ideas. Snippets can be selected as context in chat and for beats. Pinned snippets stay visible next to the text while you write.')}
          </Empty>
        )}
      </section>
    </div>
  );
}

function SnippetEditor({ snippet, novelId }: { snippet: Snippet; novelId: string }) {
  const navigate = useNavigate();
  const { title, text, setTitle, setText, cancel } = useSnippetAutosave(snippet, novelId);
  const remove = async () => {
    const ok = await confirmDialog({
      title: t('Delete snippet “{title}”?', { title: title || t('Untitled') }),
      message: snippet.pinned ? t('The snippet is pinned and will also disappear from the writing view.') : t('The snippet will be deleted.'),
    });
    if (!ok) return;
    cancel();
    await api.del(`/api/snippets/${snippet.id}`);
    queryClient.invalidateQueries({ queryKey: keys.snippets(novelId) });
    navigate(`/novel/${novelId}/snippets`);
  };
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-3 flex items-center gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 text-lg font-semibold" />
        <Button
          variant={snippet.pinned ? 'subtle' : 'ghost'}
          className="h-10"
          icon={snippet.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          title={snippet.pinned ? t('Unpin') : t('Pin: stays visible next to the text while you write')}
          onClick={() => void setSnippetPinned(novelId, snippet.id, !snippet.pinned)}
        >
          {snippet.pinned ? t('Pinned') : t('Pin')}
        </Button>
        <Button variant="ghost" className="h-10" icon={<Trash2 className="size-4" />} onClick={remove} title={t('Delete')} />
      </div>
      <Textarea autoGrow rows={20} value={text} onChange={(e) => setText(e.target.value)} className="font-serif text-[16px]" />
      <div className="mt-2 text-xs text-stone-400">{t('Last modified: {date}', { date: formatDate(snippet.updatedAt) })}</div>
    </div>
  );
}
