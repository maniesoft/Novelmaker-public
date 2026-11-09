// Angeheftetes: bleibt beim Schreiben in einer Spalte neben dem Editor sichtbar und ist dort direkt bearbeitbar.
// Snippets, Kodex-Einträge und Szenen (Zusammenfassung bearbeitbar, Text zum Nachlesen).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Eye, EyeOff, FileText, Maximize2, Pin, PinOff, Plus, Search, Sparkles, StickyNote, X } from 'lucide-react';
import { codexTypeLabel, docToHtml, type CodexEntry, type Outline, type Scene, type SceneMeta, type Snippet } from '@novelmaker/shared';
import { api } from '../lib/api';
import { keys, queryClient, useCodex, useSnippets } from '../lib/queries';
import { isPinned, setPinAi, togglePin, usePins } from '../lib/pins';
import { toast, useUi } from '../lib/store';
import { Badge, Button, cn, IconButton, Input, Menu, MenuItem, Textarea } from './ui';
import { openCodexModal } from './CodexModal';
import { chapterLabel, sceneLabel } from '../pages/OutlineTree';
import { t } from '../lib/i18n';

// ---------------------------------------------------------------- Speichern

/** Text lokal bearbeiten und verzögert speichern (auch beim Verlassen). Übernimmt Änderungen von außen, solange nichts aussteht. */
function useAutosaveText(initial: string, save: (v: string) => Promise<unknown>) {
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(initial);
  const saveRef = useRef(save);
  saveRef.current = save;
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return saveRef.current(latest.current).catch(toast.error);
  }, []);
  useEffect(() => {
    if (!timer.current && initial !== latest.current) {
      latest.current = initial;
      setValue(initial);
    }
  }, [initial]);
  useEffect(
    () => () => {
      if (timer.current) void flush();
    },
    [flush],
  );
  return {
    value,
    set: (v: string) => {
      latest.current = v;
      setValue(v);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
  };
}

/** Titel/Text eines Snippets lokal bearbeiten und verzögert speichern (auch beim Verlassen). */
export function useSnippetAutosave(snippet: Snippet, novelId: string) {
  const [title, setTitleState] = useState(snippet.title);
  const [text, setTextState] = useState(snippet.text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, text });
  latest.current = { title, text };
  const save = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return api
      .patch(`/api/snippets/${snippet.id}`, latest.current)
      .then(() => queryClient.invalidateQueries({ queryKey: keys.snippets(novelId) }))
      .catch(toast.error);
  }, [snippet.id, novelId]);
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 700);
  };
  useEffect(
    () => () => {
      if (timer.current) void save();
    },
    [save],
  );
  return {
    title,
    text,
    setTitle: (v: string) => {
      setTitleState(v);
      schedule();
    },
    setText: (v: string) => {
      setTextState(v);
      schedule();
    },
    /** ausstehendes Speichern verwerfen (z. B. vor dem Löschen) */
    cancel: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    },
  };
}

export async function setSnippetPinned(novelId: string, id: string, pinned: boolean) {
  queryClient.setQueryData<Snippet[]>(keys.snippets(novelId), (list) => list?.map((s) => (s.id === id ? { ...s, pinned } : s)));
  if (pinned && !useUi.getState().pinnedOpen) useUi.getState().toggle('pinnedOpen');
  try {
    await api.patch(`/api/snippets/${id}`, { pinned });
  } catch (e) {
    toast.error(e);
  }
  await queryClient.invalidateQueries({ queryKey: keys.snippets(novelId) });
}

// ---------------------------------------------------------------- Was ist angeheftet?

interface SceneLoc {
  scene: SceneMeta;
  label: string;
}

function sceneIndex(outline: Outline): Map<string, SceneLoc> {
  const map = new Map<string, SceneLoc>();
  let chNo = 0;
  for (const a of outline.acts)
    for (const c of a.chapters) {
      chNo++;
      c.scenes.forEach((s, i) => map.set(s.id, { scene: s, label: c.scenes.length > 1 ? `${chapterLabel(c, chNo)} · ${sceneLabel(s, i + 1)}` : chapterLabel(c, chNo) }));
    }
  return map;
}

export function usePinnedItems(novelId: string, outline: Outline | undefined) {
  const pins = usePins(novelId);
  const { data: codex } = useCodex(novelId);
  const { data: snippets } = useSnippets(novelId);
  return useMemo(() => {
    const byId = new Map((codex?.entries ?? []).map((e) => [e.id, e]));
    const scenes = outline ? sceneIndex(outline) : new Map<string, SceneLoc>();
    const codexPins = pins.filter((p) => p.kind === 'codex' && byId.has(p.id)).map((p) => ({ entry: byId.get(p.id)!, ai: p.ai !== false }));
    const scenePins = pins.filter((p) => p.kind === 'scene' && scenes.has(p.id)).map((p) => scenes.get(p.id)!);
    const snippetPins = (snippets ?? []).filter((s) => s.pinned);
    return { codex: codexPins, scenes: scenePins, snippets: snippetPins, count: codexPins.length + scenePins.length + snippetPins.length };
  }, [pins, codex, snippets, outline]);
}

// ---------------------------------------------------------------- Spalte

const WIDTH_KEY = 'nm-pinned-width';
function readWidth() {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    return v >= 220 && v <= 900 ? v : 340;
  } catch {
    return 340;
  }
}

/** Spalte rechts neben dem Editor mit allem Angehefteten. */
export function PinnedPanel({ novelId, outline }: { novelId: string; outline: Outline }) {
  const toggle = useUi((s) => s.toggle);
  const items = usePinnedItems(novelId, outline);
  const [width, setWidth] = useState(readWidth);
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    let w = w0;
    const move = (ev: MouseEvent) => {
      w = Math.max(220, Math.min(900, w0 + (x0 - ev.clientX)));
      setWidth(w);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      try {
        localStorage.setItem(WIDTH_KEY, String(w));
      } catch {
        /* */
      }
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <aside style={{ width }} className="relative flex shrink-0 flex-col border-l border-stone-200 bg-amber-50/40 dark:border-stone-800 dark:bg-stone-900/50">
      <div onMouseDown={startResize} title={t('Resize')} className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-amber-500/20" />
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-stone-200 px-3 text-sm font-medium dark:border-stone-800">
        <Pin className="size-4 text-amber-600" />
        {t('Pinned')}
        <span className="text-xs font-normal text-stone-500">{items.count}</span>
        <IconButton title={t('Hide pinned items')} className="ml-auto" onClick={() => toggle('pinnedOpen')}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {items.codex.map((c) => (
          <PinnedCodexCard key={c.entry.id} entry={c.entry} ai={c.ai} novelId={novelId} />
        ))}
        {items.snippets.map((s) => (
          <PinnedSnippetCard key={s.id} snippet={s} novelId={novelId} />
        ))}
        {items.scenes.map((s) => (
          <PinnedSceneCard key={s.scene.id} loc={s} novelId={novelId} />
        ))}
      </div>
    </aside>
  );
}

function useCollapsed(id: string) {
  const key = `nm-pinned-collapsed-${id}`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        if (c) localStorage.removeItem(key);
        else localStorage.setItem(key, '1');
      } catch {
        /* */
      }
      return !c;
    });
  return [collapsed, toggleCollapsed] as const;
}

function Card({ id, icon, title, actions, children }: { id: string; icon: ReactNode; title: ReactNode; actions: ReactNode; children: ReactNode }) {
  const [collapsed, toggleCollapsed] = useCollapsed(id);
  return (
    <div className="rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className={cn('flex items-center gap-0.5 px-1 py-1', !collapsed && 'border-b border-stone-100 dark:border-stone-800')}>
        <IconButton title={collapsed ? t('Unfold') : t('Collapse')} onClick={toggleCollapsed}>
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </IconButton>
        <span className="shrink-0 text-stone-400">{icon}</span>
        <div className="min-w-0 flex-1">{title}</div>
        {actions}
      </div>
      {!collapsed && children}
    </div>
  );
}

const cardText = 'block rounded-t-none border-transparent! bg-transparent! font-serif text-[14px] focus:border-transparent! focus:ring-0! dark:bg-transparent!';

function PinnedSnippetCard({ snippet, novelId }: { snippet: Snippet; novelId: string }) {
  const navigate = useNavigate();
  const { title, text, setTitle, setText } = useSnippetAutosave(snippet, novelId);
  return (
    <Card
      id={snippet.id}
      icon={<StickyNote className="size-3.5" />}
      title={
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full min-w-0 rounded bg-transparent px-1 py-0.5 text-sm font-medium outline-none focus:bg-stone-100 dark:focus:bg-stone-800"
        />
      }
      actions={
        <>
          <IconButton title={t('Open in Snippets')} onClick={() => navigate(`/novel/${novelId}/snippets/${snippet.id}`)}>
            <ExternalLink className="size-3.5" />
          </IconButton>
          <IconButton title={t('Unpin')} onClick={() => void setSnippetPinned(novelId, snippet.id, false)}>
            <PinOff className="size-3.5" />
          </IconButton>
        </>
      }
    >
      <Textarea autoGrow rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Empty…')} className={cardText} />
    </Card>
  );
}

function PinnedCodexCard({ entry, ai, novelId }: { entry: CodexEntry; ai: boolean; novelId: string }) {
  const desc = useAutosaveText(entry.description, async (description) => {
    await api.patch(`/api/codex/${entry.id}`, { description });
    await queryClient.invalidateQueries({ queryKey: keys.codex(novelId) });
  });
  const type = codexTypeLabel(entry.type);
  return (
    <Card
      id={entry.id}
      icon={<BookOpen className="size-3.5" />}
      title={
        <button type="button" className="flex w-full min-w-0 items-center gap-1.5 px-1 py-0.5 text-left" onClick={() => openCodexModal(novelId, entry.id)} title={t('Edit full entry')}>
          <span className="truncate text-sm font-medium">{entry.name}</span>
          <Badge className="shrink-0">{type}</Badge>
        </button>
      }
      actions={
        <>
          <IconButton
            title={ai ? t('Sent to the AI (as pinned context) — click to turn off') : t('Not sent to the AI separately — click to always include it')}
            active={ai}
            onClick={() => void setPinAi(novelId, entry.id, !ai)}
          >
            <Sparkles className={cn('size-3.5', ai && 'text-amber-600')} />
          </IconButton>
          <IconButton title={t('Edit full entry')} onClick={() => openCodexModal(novelId, entry.id)}>
            <Maximize2 className="size-3.5" />
          </IconButton>
          <IconButton title={t('Unpin')} onClick={() => void togglePin(novelId, 'codex', entry.id)}>
            <PinOff className="size-3.5" />
          </IconButton>
        </>
      }
    >
      {entry.aliases.length > 0 && <div className="truncate px-3 pt-1.5 text-xs text-stone-500">{entry.aliases.join(', ')}</div>}
      <Textarea autoGrow rows={4} value={desc.value} onChange={(e) => desc.set(e.target.value)} placeholder={t('Description…')} className={cardText} />
    </Card>
  );
}

function PinnedSceneCard({ loc, novelId }: { loc: SceneLoc; novelId: string }) {
  const navigate = useNavigate();
  const { scene, label } = loc;
  const summary = useAutosaveText(scene.summary, async (s) => {
    await api.patch(`/api/scenes/${scene.id}`, { summary: s });
    await queryClient.invalidateQueries({ queryKey: keys.outline(novelId) });
  });
  const [showText, setShowText] = useState(false);
  const { data: full } = useQuery({
    queryKey: ['scene-preview', scene.id],
    queryFn: () => api.get<Scene>(`/api/scenes/${scene.id}`),
    enabled: showText,
    staleTime: 0,
  });
  const html = useMemo(() => (full ? docToHtml(full.content) : ''), [full]);
  return (
    <Card
      id={scene.id}
      icon={<FileText className="size-3.5" />}
      title={
        <button type="button" className="w-full min-w-0 truncate px-1 py-0.5 text-left text-sm font-medium" onClick={() => navigate(`/novel/${novelId}/write/${scene.id}`)} title={t('Open scene')}>
          {label}
        </button>
      }
      actions={
        <>
          <IconButton title={showText ? t('Hide scene text') : t('Show scene text (read-only)')} active={showText} onClick={() => setShowText((v) => !v)}>
            {showText ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </IconButton>
          <IconButton title={t('Unpin')} onClick={() => void togglePin(novelId, 'scene', scene.id)}>
            <PinOff className="size-3.5" />
          </IconButton>
        </>
      }
    >
      <div className="px-3 pt-1.5 text-[11px] font-semibold tracking-wide text-stone-400 uppercase">{t('Summary')}</div>
      <Textarea autoGrow rows={3} value={summary.value} onChange={(e) => summary.set(e.target.value)} placeholder={t('No summary yet…')} className={cardText} />
      {showText && (
        <div className="max-h-96 overflow-y-auto border-t border-stone-100 px-3 py-2 dark:border-stone-800">
          {full ? <div className="prose-doc static-scene text-[14px]" dangerouslySetInnerHTML={{ __html: html || `<p class="text-stone-400">${t('Empty scene')}</p>` }} /> : <div className="text-xs text-stone-400">{t('Loading…')}</div>}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Menü in der Werkzeugleiste

/** Anheften: Kodex-Einträge, Snippets, Szenen durchsuchen und an-/abheften; Spalte ein-/ausblenden. */
export function PinMenu({ novelId, outline }: { novelId: string; outline: Outline }) {
  const { data: codex } = useCodex(novelId);
  const { data: snippets } = useSnippets(novelId);
  const pins = usePins(novelId);
  const items = usePinnedItems(novelId, outline);
  const pinnedOpen = useUi((s) => s.pinnedOpen);
  const toggle = useUi((s) => s.toggle);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const match = (...xs: string[]) => !needle || xs.some((x) => x.toLowerCase().includes(needle));
  const codexList = (codex?.entries ?? []).filter((e) => match(e.name, ...e.aliases));
  const snippetList = (snippets ?? []).filter((s) => match(s.title, s.text.slice(0, 200)));
  const sceneList = needle ? [...sceneIndex(outline).values()].filter((s) => match(s.label, s.scene.title, s.scene.summary)).slice(0, 20) : [];
  const createPinned = async () => {
    try {
      const s = await api.post<Snippet>(`/api/novels/${novelId}/snippets`, {});
      await setSnippetPinned(novelId, s.id, true);
    } catch (e) {
      toast.error(e);
    }
  };
  const section = (label: string) => <div className="px-2.5 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{label}</div>;
  const pinIcon = (on: boolean) => <Pin className={on ? 'fill-amber-500 text-amber-600' : undefined} />;
  return (
    <Menu
      trigger={(onToggle, ref) => (
        <Button ref={ref} size="sm" variant="ghost" onClick={onToggle} title={t('Pin: Codex, snippets, scenes next to the text')} icon={<Pin className={cn('size-4', items.count > 0 && pinnedOpen && 'text-amber-600')} />}>
          {items.count > 0 ? <span className="tabular-nums">{items.count}</span> : null}
        </Button>
      )}
    >
      {(close) => (
        <div className="w-80">
          {items.count > 0 && (
            <>
              <MenuItem icon={pinnedOpen ? <EyeOff /> : <Eye />} onClick={() => (close(), toggle('pinnedOpen'))}>
                {pinnedOpen ? t('Hide pinned items') : t('Show pinned items')}
              </MenuItem>
              <div className="my-1 h-px bg-stone-200 dark:bg-stone-800" />
            </>
          )}
          <div className="relative px-1.5 pb-1">
            <Search className="absolute top-2.5 left-4 size-3.5 text-stone-400" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search Codex, snippets, scenes…')} className="h-8 pl-7 text-sm" />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {codexList.length > 0 && section(t('Codex'))}
            {codexList.map((e) => (
              <MenuItem key={e.id} icon={pinIcon(isPinned(pins, 'codex', e.id))} onClick={() => void togglePin(novelId, 'codex', e.id)}>
                <span className="truncate">{e.name}</span>
              </MenuItem>
            ))}
            {snippetList.length > 0 && section(t('Snippets'))}
            {snippetList.map((s) => (
              <MenuItem key={s.id} icon={pinIcon(s.pinned)} onClick={() => void setSnippetPinned(novelId, s.id, !s.pinned)}>
                <span className="truncate">{s.title || t('Untitled')}</span>
              </MenuItem>
            ))}
            {sceneList.length > 0 && section(t('Scenes'))}
            {sceneList.map((s) => (
              <MenuItem key={s.scene.id} icon={pinIcon(isPinned(pins, 'scene', s.scene.id))} onClick={() => void togglePin(novelId, 'scene', s.scene.id)}>
                <span className="truncate">
                  {s.label}
                  {s.scene.title ? `: ${s.scene.title}` : ''}
                </span>
              </MenuItem>
            ))}
            {!codexList.length && !snippetList.length && !sceneList.length && <div className="px-2.5 py-1.5 text-sm text-stone-400">{t('Nothing found.')}</div>}
            {!needle && <div className="px-2.5 pt-1.5 text-xs text-stone-400">{t('Scenes: type a name or choose “Pin” in the outline.')}</div>}
          </div>
          <div className="my-1 h-px bg-stone-200 dark:bg-stone-800" />
          <MenuItem icon={<Plus />} onClick={() => (close(), void createPinned())}>
            {t('Pin new snippet')}
          </MenuItem>
          <MenuItem icon={<ExternalLink />} onClick={() => (close(), navigate(`/novel/${novelId}/snippets`))}>
            {t('Manage all snippets')}
          </MenuItem>
        </div>
      )}
    </Menu>
  );
}
