// Buchcover: hochgeladenes Bild oder ein schlichter Platzhalter mit dem Titel.
import type { Novel } from '@novelmaker/shared';
import { cn } from './ui';

export const coverUrl = (n: Pick<Novel, 'id' | 'coverVersion'>) => (n.coverVersion ? `/api/novels/${n.id}/cover?v=${encodeURIComponent(n.coverVersion)}` : null);

// gedeckte Farben, aus dem Titel abgeleitet, damit jeder Platzhalter gleich bleibt
const TONES = ['from-amber-800 to-amber-950', 'from-stone-600 to-stone-800', 'from-sky-800 to-slate-900', 'from-emerald-800 to-stone-900', 'from-rose-800 to-stone-900', 'from-violet-800 to-slate-900'];
function tone(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function NovelCover({ novel, className }: { novel: Pick<Novel, 'id' | 'title' | 'author' | 'coverVersion'>; className?: string }) {
  const url = coverUrl(novel);
  return (
    <div className={cn('aspect-[2/3] overflow-hidden rounded-md shadow-sm ring-1 ring-stone-900/10 dark:ring-white/10', className)}>
      {url ? (
        <img src={url} alt={`Cover von ${novel.title}`} className="size-full object-cover" loading="lazy" />
      ) : (
        <div className={cn('flex size-full flex-col justify-between bg-gradient-to-b p-2 text-white', tone(novel.title || novel.id))}>
          <div className="line-clamp-4 font-serif text-[13px] leading-tight font-semibold">{novel.title || 'Ohne Titel'}</div>
          {novel.author && <div className="truncate text-[10px] opacity-75">{novel.author}</div>}
        </div>
      )}
    </div>
  );
}
