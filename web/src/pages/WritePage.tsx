import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Columns2,
  Eye,
  EyeOff,
  FilePlus2,
  Focus,
  PanelLeft,
  PanelRight,
  Redo2,
  Scissors,
  Sparkles,
  StickyNote,
  Undo2,
  Zap,
} from 'lucide-react';
import { docToHtml, type Outline, type PMDoc, type SceneMeta } from '@novelmaker/shared';
import { Button, cn, Empty, formatNumber, IconButton, Menu, MenuItem, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { invalidateNovel, keys, queryClient, useManuscript, useOutline, useScene } from '../lib/queries';
import { toast, useUi } from '../lib/store';
import { SceneEditor } from '../editor/SceneEditor';
import { ContinuePanel, RewritePanel, useContinue } from '../editor/RewritePanel';
import { useActiveEditor, useSaveState } from '../editor/scope';
import { OutlineTree, chapterLabel, sceneLabel, visibility } from './OutlineTree';
import { ScenePanel, ScenePovChip } from './ScenePanel';
import { PinMenu, PinnedPanel, usePinnedItems } from '../components/Pinned';
import { t, tn } from '../lib/i18n';

function findScene(outline: Outline, id: string | undefined) {
  let chNo = 0;
  for (const a of outline.acts)
    for (const c of a.chapters) {
      chNo++;
      const i = c.scenes.findIndex((s) => s.id === id);
      if (i >= 0) return { scene: c.scenes[i], chapter: c, act: a, index: i, chapterNo: chNo };
    }
  return null;
}

export function WritePage({ manuscript }: { manuscript?: boolean }) {
  const { novelId = '', sceneId } = useParams();
  const navigate = useNavigate();
  const { data: outline, isLoading } = useOutline(novelId);
  const { sidebarOpen, panelOpen, pinnedOpen, focusMode, showMentions, toggle } = useUi();
  const pinned = usePinnedItems(novelId, outline);
  const [liveWords, setLiveWords] = useState<{ sceneId: string; words: number } | null>(null);
  const activeSceneId = useActiveEditor((s) => s.sceneId);

  const lastKey = `nm-last-scene-${novelId}`;
  useEffect(() => {
    if (sceneId) localStorage.setItem(lastKey, sceneId);
  }, [sceneId, lastKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && useUi.getState().focusMode) toggle('focusMode');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  if (isLoading || !outline) return <div className="p-6"><Spinner /></div>;

  const allScenes = outline.acts.flatMap((a) => a.chapters.flatMap((c) => c.scenes));
  if (!manuscript && !sceneId) {
    const last = localStorage.getItem(lastKey);
    const target = allScenes.find((s) => s.id === last) ?? allScenes[0];
    if (target) return <Navigate to={`/novel/${novelId}/write/${target.id}`} replace />;
  }
  const current = findScene(outline, manuscript ? (activeSceneId ?? undefined) : sceneId);
  const novelWords = allScenes.reduce((n, s) => n + (liveWords?.sceneId === s.id ? liveWords.words : s.wordCount), 0);
  const openScene = (id: string) => {
    if (manuscript) {
      document.getElementById(`scene-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else navigate(`/novel/${novelId}/write/${id}`);
  };

  return (
    <div className={cn('flex h-full', focusMode && 'focus-mode', !showMentions && 'hide-mentions')}>
      {sidebarOpen && !focusMode && (
        <aside className="w-64 shrink-0 border-r border-stone-200 bg-stone-100/60 dark:border-stone-800 dark:bg-stone-900/40">
          <OutlineTree outline={outline} activeSceneId={current?.scene.id} onOpenScene={openScene} liveWords={liveWords} />
        </aside>
      )}
      <section className="flex min-w-0 flex-1 flex-col">
        <Toolbar outline={outline} sceneId={current?.scene.id} novelWords={novelWords} sceneWords={current ? (liveWords?.sceneId === current.scene.id ? liveWords.words : current.scene.wordCount) : 0} manuscript={manuscript} />
        <div className="min-h-0 flex-1 overflow-y-auto" id="editor-scroll">
          {manuscript ? (
            <ManuscriptView novelId={novelId} onWords={setLiveWords} />
          ) : sceneId && current ? (
            <SingleScene key={sceneId} outline={outline} sceneId={sceneId} onWords={(w) => setLiveWords({ sceneId, words: w })} />
          ) : allScenes.length === 0 ? (
            <Empty title={t('No scene yet')}>
              <div className="mt-4">
                <Button
                  variant="primary"
                  onClick={async () => {
                    try {
                      await api.post('/api/chapters', { actId: outline.acts[0].id });
                      await queryClient.refetchQueries({ queryKey: keys.outline(novelId) });
                      const first = queryClient.getQueryData<Outline>(keys.outline(novelId))?.acts.flatMap((a) => a.chapters.flatMap((c) => c.scenes))[0];
                      invalidateNovel(novelId);
                      if (first) navigate(`/novel/${novelId}/write/${first.id}`);
                    } catch (e) {
                      toast.error(e);
                    }
                  }}
                >
                  {t('Create chapter')}
                </Button>
              </div>
            </Empty>
          ) : (
            <Empty title={t('Scene not found')}>
              {t('It may have been deleted.')}
              <div className="mt-4">
                <Button onClick={() => navigate(`/novel/${novelId}/write/${allScenes[0].id}`)}>{t('Go to first scene')}</Button>
              </div>
            </Empty>
          )}
        </div>
      </section>
      {/* Angeheftetes bleibt auch im Fokusmodus sichtbar */}
      {pinnedOpen && pinned.count > 0 && <PinnedPanel novelId={novelId} outline={outline} />}
      {panelOpen && !focusMode && current && (
        <aside className="w-80 shrink-0 border-l border-stone-200 bg-white/60 dark:border-stone-800 dark:bg-stone-900/40">
          <ScenePanel
            outline={outline}
            scene={current.scene}
            onOpenScene={openScene}
            onRestored={() => {
              queryClient.invalidateQueries({ queryKey: keys.scene(current.scene.id) });
              invalidateNovel(novelId);
            }}
          />
        </aside>
      )}
      <RewritePanel />
      <ContinuePanel />
    </div>
  );
}

function SingleScene({ outline, sceneId, onWords }: { outline: Outline; sceneId: string; onWords: (n: number) => void }) {
  const { data: scene, isLoading, error } = useScene(sceneId);
  const loc = findScene(outline, sceneId);
  if (isLoading) return <div className="p-6"><Spinner /></div>;
  if (error || !scene || !loc) return <Empty title={t('Couldn’t load scene')}>{String((error as Error)?.message ?? '')}</Empty>;
  const { showScenesFor } = visibility(outline);
  return (
    <div className="mx-auto px-6 pt-8 pb-[40vh]" style={{ maxWidth: 'calc(var(--editor-width) + 3rem)' }}>
      <div className="mb-6 flex items-end justify-between gap-3 font-sans">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wide text-stone-400 uppercase">{chapterLabel(loc.chapter, loc.chapterNo)}</div>
          {showScenesFor(loc.chapter) && <div className="text-sm text-stone-500">{sceneLabel(loc.scene, loc.index + 1)}</div>}
        </div>
        <ScenePovChip novelId={outline.novel.id} sceneId={scene.id} className="min-w-0" />
      </div>
      <SceneEditor key={`${scene.id}:${scene.updatedAt}`} novelId={outline.novel.id} sceneId={scene.id} content={scene.content} autoFocus onWords={onWords} />
    </div>
  );
}

// ---------------------------------------------------------------- Manuskript

function ManuscriptView({ novelId, onWords }: { novelId: string; onWords: (w: { sceneId: string; words: number }) => void }) {
  const { data, isLoading } = useManuscript(novelId);
  if (isLoading || !data) return <div className="p-6"><Spinner /></div>;
  const { outline, scenes } = data;
  const { showActs } = visibility(outline);
  let chNo = 0;
  return (
    <div className="mx-auto px-6 pt-8 pb-[40vh]" style={{ maxWidth: 'calc(var(--editor-width) + 3rem)' }}>
      <h1 className="mb-10 text-center font-serif text-3xl font-semibold">{outline.novel.title}</h1>
      {outline.acts.map((act, ai) => (
        <div key={act.id}>
          {showActs && <h2 className="mt-12 mb-6 text-center font-sans text-sm font-semibold tracking-[0.2em] text-stone-400 uppercase">{act.title || t('Act {n}', { n: ai + 1 })}</h2>}
          {act.chapters.map((ch) => {
            chNo++;
            return (
              <div key={ch.id} className="mb-10">
                <h3 className="mt-10 mb-6 font-serif text-2xl font-semibold">{chapterLabel(ch, chNo)}</h3>
                {ch.scenes.map((s, i) => (
                  <div key={s.id} id={`scene-${s.id}`} className="group/scene scroll-mt-4">
                    {i > 0 && <div className="my-8 text-center tracking-[0.5em] text-stone-400">* * *</div>}
                    {/* abweichende Perspektive immer sichtbar, sonst beim Drüberfahren */}
                    <div className="mb-1 flex justify-end">
                      <ScenePovChip novelId={novelId} sceneId={s.id} subtle />
                    </div>
                    {scenes[s.id] && <LazyScene novelId={novelId} scene={s} content={scenes[s.id].content} onWords={(w) => onWords({ sceneId: s.id, words: w })} />}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Editor nur für sichtbare Szenen, sonst statisches HTML. */
function LazyScene({ novelId, scene, content, onWords }: { novelId: string; scene: SceneMeta; content: PMDoc; onWords: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [focusOnMount, setFocusOnMount] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.getElementById('editor-scroll');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
        else if (useActiveEditor.getState().sceneId !== scene.id) setVisible(false);
      },
      { root, rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scene.id]);
  const html = useMemo(() => (visible ? '' : docToHtml(content)), [visible, content]);
  return (
    <div ref={ref} style={{ minHeight: visible ? undefined : 24 }}>
      {visible ? (
        <SceneEditor novelId={novelId} sceneId={scene.id} content={content} onWords={onWords} autoFocus={focusOnMount} placeholder={t('Empty scene…')} />
      ) : (
        <div
          className="prose-doc static-scene"
          onClick={() => {
            setFocusOnMount(true);
            setVisible(true);
          }}
          dangerouslySetInnerHTML={{ __html: html || `<p class="text-stone-400">${t('Empty scene')}</p>` }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Werkzeugleiste

function Toolbar({ outline, sceneId, novelWords, sceneWords, manuscript }: { outline: Outline; sceneId?: string; novelWords: number; sceneWords: number; manuscript?: boolean }) {
  const editor = useActiveEditor((s) => s.editor);
  const activeScene = useActiveEditor((s) => s.sceneId);
  const status = useSaveState((s) => (activeScene ? s.status[activeScene] : undefined));
  const { sidebarOpen, panelOpen, focusMode, showMentions, toggle } = useUi();
  const openContinue = useContinue((s) => s.open);
  const navigate = useNavigate();
  const novelId = outline.novel.id;
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const h = () => force((x) => x + 1);
    editor.on('transaction', h);
    return () => {
      editor.off('transaction', h);
    };
  }, [editor]);

  const ready = !!editor && !editor.isDestroyed && !!activeScene;
  const split = async (mode: 'scene' | 'chapter') => {
    if (!editor || !activeScene) return;
    const pos = editor.state.selection.from;
    const before = editor.state.doc.cut(0, pos).toJSON() as PMDoc;
    const after = editor.state.doc.cut(pos).toJSON() as PMDoc;
    if (!after.content?.length) after.content = [{ type: 'paragraph' }];
    try {
      editor.commands.setContent(before, true);
      const r = await api.post<{ sceneId: string }>(`/api/scenes/${activeScene}/split`, { before, after, mode });
      invalidateNovel(novelId);
      queryClient.invalidateQueries({ queryKey: keys.scene(activeScene) });
      if (!manuscript) navigate(`/novel/${novelId}/write/${r.sceneId}`);
      toast.success(mode === 'scene' ? t('Scene split.') : t('New chapter created from the cursor.'));
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div
      className={cn(
        // @container: bei schmalem Editor (z. B. mit angehefteten Snippets) nur Icons zeigen statt überzulaufen
        '@container flex h-10 min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-stone-200 bg-white/70 px-2 dark:border-stone-800 dark:bg-stone-900/60',
        focusMode && 'border-transparent bg-transparent opacity-30 transition-opacity hover:opacity-100',
      )}
    >
      {!focusMode && (
        <IconButton title={t('Toggle outline')} active={sidebarOpen} onClick={() => toggle('sidebarOpen')}>
          <PanelLeft className="size-4" />
        </IconButton>
      )}
      <div className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-800" />
      <IconButton title={t('Undo (Ctrl+Z)')} disabled={!ready || !editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>
        <Undo2 className="size-4" />
      </IconButton>
      <IconButton title={t('Redo (Ctrl+Y)')} disabled={!ready || !editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>
        <Redo2 className="size-4" />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-800" />
      <Button size="sm" variant="ghost" disabled={!ready} icon={<Zap className="size-4 text-amber-600" />} onClick={() => editor?.chain().insertBeat().focus().run()} title={t('Insert beat (Ctrl+Shift+B)')}>
        <span className="hidden @3xl:inline">{t('Beat')}</span>
      </Button>
      <Button size="sm" variant="ghost" disabled={!ready} icon={<StickyNote className="size-4 text-sky-600" />} onClick={() => editor?.chain().insertNote().focus().run()} title={t('Hidden note (Ctrl+Alt+N)')}>
        <span className="hidden @3xl:inline">{t('Note')}</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!ready}
        icon={<Sparkles className="size-4" />}
        onClick={() => editor && activeScene && openContinue({ editor, sceneId: activeScene, novelId, pos: editor.state.selection.to })}
        title={t('Continue writing from cursor')}
      >
        <span className="hidden @3xl:inline">{t('Continue writing')}</span>
      </Button>
      <Menu
        align="start"
        trigger={(openMenu, ref) => (
          <Button ref={ref} size="sm" variant="ghost" disabled={!ready} icon={<Scissors className="size-4" />} onClick={openMenu} title={t('Split scene or chapter at the cursor')}>
            <span className="hidden @3xl:inline">{t('Split')}</span>
          </Button>
        )}
      >
        {(close) => (
          <>
            <MenuItem icon={<FilePlus2 />} onClick={() => (close(), split('scene'))}>
              {t('Start new scene here')}
            </MenuItem>
            <MenuItem icon={<Columns2 />} onClick={() => (close(), split('chapter'))}>
              {t('Start new chapter here')}
            </MenuItem>
          </>
        )}
      </Menu>
      <div className="ml-auto flex shrink-0 items-center gap-3 pr-1 text-xs text-stone-500">
        <span className="hidden tabular-nums @xl:inline" title={t('Words: scene / novel')}>
          {sceneId ? t('{scene} / {novel} words', { scene: formatNumber(sceneWords), novel: formatNumber(novelWords) }) : tn(novelWords, '{n} word', '{n} words')}
        </span>
        <span className={cn('w-20 text-right', status === 'error' && 'text-red-600')}>
          {status === 'saving' ? t('Saving…') : status === 'dirty' ? t('Unsaved') : status === 'error' ? t('Error!') : status === 'saved' ? t('Saved') : ''}
        </span>
      </div>
      <PinMenu novelId={novelId} outline={outline} />
      <IconButton title={showMentions ? t('Codex highlighting off') : t('Codex highlighting on')} active={showMentions} onClick={() => toggle('showMentions')}>
        {showMentions ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </IconButton>
      <IconButton title={t('Focus mode (Esc to exit)')} active={focusMode} onClick={() => toggle('focusMode')}>
        <Focus className="size-4" />
      </IconButton>
      {!focusMode && (
        <IconButton title={t('Toggle scene panel')} active={panelOpen} onClick={() => toggle('panelOpen')}>
          <PanelRight className="size-4" />
        </IconButton>
      )}
    </div>
  );
}
