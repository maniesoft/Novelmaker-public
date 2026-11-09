import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { codexTypeLabel } from '@novelmaker/shared';
import { api } from '../lib/api';
import { Badge, Empty, Input, Spinner } from '../components/ui';
import { t, tn } from '../lib/i18n';

interface Result {
  scenes: { sceneId: string; label: string; count: number; excerpts: string[] }[];
  codex: { id: string; name: string; type: string }[];
  snippets: { id: string; title: string }[];
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-amber-200 px-0.5 dark:bg-amber-700/60 dark:text-white">{p}</mark> : p));
}

export function SearchPage() {
  const { novelId = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const h = setTimeout(async () => {
      setParams(q ? { q } : {}, { replace: true });
      if (q.trim().length < 2) return setRes(null);
      setLoading(true);
      try {
        setRes(await api.get<Result>(`/api/novels/${novelId}/search?q=${encodeURIComponent(q.trim())}`));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [q, novelId]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = res ? res.scenes.reduce((n, s) => n + s.count, 0) : 0;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="relative mb-6">
          <Search className="absolute top-3 left-3 size-4 text-stone-400" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search the novel, Codex, and snippets…')} className="h-10 pl-9 text-base" />
        </div>
        {loading && <Spinner />}
        {res && !loading && (
          <div className="space-y-6">
            <div className="text-sm text-stone-500">
              {tn(res.scenes.length, 'Matches: {total} in {n} scene', 'Matches: {total} in {n} scenes', { total })}
            </div>
            {res.scenes.map((s) => (
              <button key={s.sceneId} type="button" onClick={() => navigate(`/novel/${novelId}/write/${s.sceneId}`)} className="block w-full rounded-lg border border-stone-200 p-3 text-left hover:bg-white dark:border-stone-800 dark:hover:bg-stone-900">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  {s.label}
                  <Badge>{s.count}×</Badge>
                </div>
                {s.excerpts.map((e, i) => (
                  <div key={i} className="font-serif text-[15px] text-stone-600 dark:text-stone-300">
                    {highlight(e, q.trim())}
                  </div>
                ))}
              </button>
            ))}
            {res.codex.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">{t('Codex')}</div>
                <div className="flex flex-wrap gap-2">
                  {res.codex.map((c) => (
                    <button key={c.id} type="button" onClick={() => navigate(`/novel/${novelId}/codex/${c.id}`)} className="rounded-full border border-stone-200 px-3 py-1 text-sm hover:bg-white dark:border-stone-700 dark:hover:bg-stone-900">
                      {c.name} <span className="text-xs text-stone-400">{codexTypeLabel(c.type)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {res.snippets.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">{t('Snippets')}</div>
                <div className="flex flex-wrap gap-2">
                  {res.snippets.map((s) => (
                    <button key={s.id} type="button" onClick={() => navigate(`/novel/${novelId}/snippets/${s.id}`)} className="rounded-full border border-stone-200 px-3 py-1 text-sm hover:bg-white dark:border-stone-700 dark:hover:bg-stone-900">
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!res.scenes.length && !res.codex.length && !res.snippets.length && <Empty title={t('Nothing found')} />}
          </div>
        )}
      </div>
    </div>
  );
}
