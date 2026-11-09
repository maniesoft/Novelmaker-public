import { useState, type DragEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Copy, Download, EyeOff, FileDown, FilePlus2, FileText, Square, SquareCheck, FolderPlus, GripVertical, Layers, MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import type { Outline, OutlineAct, OutlineChapter, SceneMeta } from '@novelmaker/shared';
import { api } from '../lib/api';
import { invalidateNovel, keys, patchSettings, queryClient, useSettings } from '../lib/queries';
import { copyPart, downloadPart, type ExportPart } from '../lib/exporting';
import { toast } from '../lib/store';
import { isPinned, togglePin, usePins } from '../lib/pins';
import { Button, cn, confirmDialog, formatNumber, Input, Menu, MenuItem, Popover } from '../components/ui';
import { t, tn } from '../lib/i18n';

export type OutlineKind = 'act' | 'chapter' | 'scene';
type Kind = OutlineKind;
interface Drag {
  kind: Kind;
  id: string;
}
interface Drop {
  kind: Kind;
  id: string;
  where: 'before' | 'after' | 'inside';
}

export function chapterLabel(ch: { title: string }, n: number) {
  return ch.title.trim() ? ch.title : t('Chapter {n}', { n });
}
export function sceneLabel(s: { title: string }, n: number) {
  return s.title.trim() ? s.title : t('Scene {n}', { n });
}

/**
 * Akt, Kapitel oder Szene nach Sicherheitsabfrage löschen. Ist die offene Szene betroffen,
 * wird die nächste (sonst vorige) Szene geöffnet. Liefert true, wenn gelöscht wurde.
 */
export async function deleteOutlineItem(
  outline: Outline,
  kind: Kind,
  id: string,
  opts: { activeSceneId?: string | null; onOpenScene?: (id: string) => void } = {},
): Promise<boolean> {
  const novelId = outline.novel.id;
  const flat: { scene: SceneMeta; chapterId: string; actId: string }[] = [];
  const chapterNo = new Map<string, number>();
  let n = 0;
  for (const a of outline.acts)
    for (const c of a.chapters) {
      chapterNo.set(c.id, ++n);
      for (const s of c.scenes) flat.push({ scene: s, chapterId: c.id, actId: a.id });
    }
  const hit = (x: (typeof flat)[number]) => (kind === 'scene' ? x.scene.id === id : kind === 'chapter' ? x.chapterId === id : x.actId === id);
  const removed = flat.filter(hit);
  const words = removed.reduce((w, x) => w + x.scene.wordCount, 0);
  const summaries = removed.filter((x) => x.scene.summary.trim()).length;
  const fmtWords = tn(words, '{n} word', '{n} words');
  const fmtScenes = tn(removed.length, '{n} scene', '{n} scenes');
  const allChapters = outline.acts.flatMap((a) => a.chapters);

  let title: string;
  let detail: string;
  if (kind === 'scene') {
    const ch = allChapters.find((c) => c.id === removed[0]?.chapterId);
    const idx = ch ? ch.scenes.findIndex((s) => s.id === id) : 0;
    const name = removed[0] ? sceneLabel(removed[0].scene, idx + 1) : t('Scene');
    title = ch ? t('Delete {scene} from {chapter}?', { scene: name, chapter: chapterLabel(ch, chapterNo.get(ch.id) ?? 0) }) : t('Delete {name}?', { name });
    detail = t('This scene’s text ({words}), summary, and saved versions will be lost.', { words: fmtWords });
  } else if (kind === 'chapter') {
    const ch = allChapters.find((c) => c.id === id);
    title = t('Delete {name}?', { name: ch ? chapterLabel(ch, chapterNo.get(id) ?? 0) : t('Chapter') });
    detail = summaries
      ? t('The chapter will be deleted along with {scenes} ({words}, {summaries} with a summary).', { scenes: fmtScenes, words: fmtWords, summaries: formatNumber(summaries) })
      : t('The chapter will be deleted along with {scenes} ({words}).', { scenes: fmtScenes, words: fmtWords });
  } else {
    const ai = outline.acts.findIndex((a) => a.id === id);
    const act = outline.acts[ai];
    const chapters = act?.chapters.length ?? 0;
    title = t('Delete {name}?', { name: act?.title || t('Act {n}', { n: ai + 1 }) });
    detail = t('The act will be deleted along with {chapters} and {scenes} ({words}).', {
      chapters: tn(chapters, '{n} chapter', '{n} chapters'),
      scenes: fmtScenes,
      words: fmtWords,
    });
  }
  const ok = await confirmDialog({
    title,
    message: (
      <>
        <p>{detail}</p>
        <p className="mt-2 text-xs text-stone-500">{t('This can’t be undone. Earlier versions are kept in the automatic backups (Settings).')}</p>
      </>
    ),
  });
  if (!ok) return false;
  try {
    await api.del(`/api/${kind === 'act' ? 'acts' : kind === 'chapter' ? 'chapters' : 'scenes'}/${id}`);
  } catch (e) {
    toast.error(e);
    return false;
  }
  if (opts.activeSceneId && opts.onOpenScene && removed.some((x) => x.scene.id === opts.activeSceneId)) {
    const first = flat.findIndex(hit);
    const next = flat.slice(first).find((x) => !hit(x)) ?? flat.slice(0, first).reverse()[0];
    if (next) opts.onOpenScene(next.scene.id);
  }
  invalidateNovel(novelId);
  for (const x of removed) queryClient.removeQueries({ queryKey: keys.scene(x.scene.id) });
  return true;
}

export function visibility(outline: Outline) {
  const st = outline.novel.settings;
  const showActs = st.showActs ?? outline.acts.length > 1;
  const showScenesFor = (ch: OutlineChapter) => (st.showScenes ?? false) || ch.scenes.length > 1;
  return { showActs, showScenesFor };
}

export function OutlineTree({
  outline,
  activeSceneId,
  onOpenScene,
  liveWords,
}: {
  outline: Outline;
  activeSceneId?: string;
  onOpenScene: (id: string) => void;
  liveWords?: { sceneId: string; words: number } | null;
}) {
  const novelId = outline.novel.id;
  const pins = usePins(novelId);
  const { showActs, showScenesFor } = visibility(outline);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);

  const refresh = () => invalidateNovel(novelId);
  const words = (s: SceneMeta) => (liveWords?.sceneId === s.id ? liveWords.words : s.wordCount);

  // ------------------------------------------------------------ Drag & Drop
  const allowed = (target: Kind, where: Drop['where']) => {
    if (!drag) return false;
    if (drag.kind === 'scene') return target === 'scene' ? where !== 'inside' : target === 'chapter' && where === 'inside';
    if (drag.kind === 'chapter') return target === 'chapter' ? where !== 'inside' : target === 'act' && where === 'inside';
    return target === 'act' && where !== 'inside';
  };
  const onDragOver = (e: DragEvent, kind: Kind, id: string) => {
    if (!drag || drag.id === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    let where: Drop['where'] = y < rect.height / 2 ? 'before' : 'after';
    if ((drag.kind === 'scene' && kind === 'chapter') || (drag.kind === 'chapter' && kind === 'act')) where = 'inside';
    if (!allowed(kind, where)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (drop?.id !== id || drop.where !== where) setDrop({ kind, id, where });
  };
  const doDrop = async (e: DragEvent) => {
    e.preventDefault();
    const d = drag;
    const dst = drop;
    setDrag(null);
    setDrop(null);
    if (!d || !dst) return;
    try {
      if (d.kind === 'scene') {
        let chapter: OutlineChapter | undefined;
        let index = 0;
        if (dst.kind === 'chapter') {
          chapter = findChapter(outline, dst.id);
          index = chapter ? chapter.scenes.filter((s) => s.id !== d.id).length : 0;
        } else {
          chapter = outline.acts.flatMap((a) => a.chapters).find((c) => c.scenes.some((s) => s.id === dst.id));
          const ids = chapter!.scenes.map((s) => s.id).filter((x) => x !== d.id);
          index = ids.indexOf(dst.id) + (dst.where === 'after' ? 1 : 0);
        }
        if (!chapter) return;
        await api.post(`/api/scenes/${d.id}/move`, { chapterId: chapter.id, index });
      } else if (d.kind === 'chapter') {
        let act: OutlineAct | undefined;
        let index = 0;
        if (dst.kind === 'act') {
          act = outline.acts.find((a) => a.id === dst.id);
          index = act ? act.chapters.filter((c) => c.id !== d.id).length : 0;
        } else {
          act = outline.acts.find((a) => a.chapters.some((c) => c.id === dst.id));
          const ids = act!.chapters.map((c) => c.id).filter((x) => x !== d.id);
          index = ids.indexOf(dst.id) + (dst.where === 'after' ? 1 : 0);
        }
        if (!act) return;
        await api.post(`/api/chapters/${d.id}/move`, { actId: act.id, index });
      } else {
        const ids = outline.acts.map((a) => a.id).filter((x) => x !== d.id);
        await api.post(`/api/acts/${d.id}/move`, { index: ids.indexOf(dst.id) + (dst.where === 'after' ? 1 : 0) });
      }
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };
  const dragProps = (kind: Kind, id: string) => ({
    draggable: renaming !== id,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      setDrag({ kind, id });
    },
    onDragEnd: () => {
      setDrag(null);
      setDrop(null);
    },
    onDragOver: (e: DragEvent) => onDragOver(e, kind, id),
    onDrop: doDrop,
  });
  const dropCls = (id: string) =>
    cn(
      drop?.id === id && drop.where === 'before' && 'shadow-[inset_0_2px_0_0_rgb(217_119_6)]',
      drop?.id === id && drop.where === 'after' && 'shadow-[inset_0_-2px_0_0_rgb(217_119_6)]',
      drop?.id === id && drop.where === 'inside' && 'bg-amber-100 dark:bg-amber-900/40',
    );

  // ------------------------------------------------------------ Aktionen
  const rename = async (kind: Kind, id: string, title: string) => {
    setRenaming(null);
    await api.patch(`/api/${kind === 'act' ? 'acts' : kind === 'chapter' ? 'chapters' : 'scenes'}/${id}`, { title });
    refresh();
  };
  const addScene = async (chapterId: string, index?: number) => {
    const s = await api.post<{ id: string }>('/api/scenes', { chapterId, index });
    refresh();
    onOpenScene(s.id);
  };
  const addChapter = async (actId: string, index?: number) => {
    await api.post('/api/chapters', { actId, index });
    await queryClient.refetchQueries({ queryKey: keys.outline(novelId) });
    const o = queryClient.getQueryData<Outline>(keys.outline(novelId));
    const act = o?.acts.find((a) => a.id === actId);
    const ch = index != null ? act?.chapters[index] : act?.chapters[act.chapters.length - 1];
    if (ch?.scenes[0]) onOpenScene(ch.scenes[0].id);
    refresh();
  };
  const addAct = async (index?: number) => {
    await api.post('/api/acts', { novelId, index });
    if (!showActs) await api.patch(`/api/novels/${novelId}`, { settings: { showActs: true } }).then(() => queryClient.invalidateQueries({ queryKey: keys.novel(novelId) }));
    refresh();
  };
  const remove = (kind: Kind, id: string) => deleteOutlineItem(outline, kind, id, { activeSceneId, onOpenScene });
  const toggleHidden = async (s: SceneMeta) => {
    await api.patch(`/api/scenes/${s.id}`, { hideFromAI: !s.hideFromAI });
    refresh();
  };

  let chapterNo = 0;
  return (
    <div className="flex h-full flex-col text-sm" onDragOver={(e) => drag && e.preventDefault()}>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {outline.acts.map((act, ai) => {
          const actCollapsed = collapsed[act.id];
          const actWords = act.chapters.reduce((n, c) => n + c.scenes.reduce((m, s) => m + words(s), 0), 0);
          const chapters = (
            <div className={cn(showActs && 'ml-2 border-l border-stone-200 pl-1 dark:border-stone-800')}>
              {act.chapters.map((ch, ci) => {
                chapterNo++;
                const no = chapterNo;
                const showScenes = showScenesFor(ch);
                const chWords = ch.scenes.reduce((n, s) => n + words(s), 0);
                const chActive = ch.scenes.some((s) => s.id === activeSceneId);
                const chCollapsed = collapsed[ch.id] && !chActive;
                return (
                  <div key={ch.id}>
                    <Row
                      {...dragProps('chapter', ch.id)}
                      className={dropCls(ch.id)}
                      active={!showScenes && chActive}
                      icon={
                        showScenes ? (
                          <button type="button" onClick={(e) => (e.stopPropagation(), setCollapsed((c) => ({ ...c, [ch.id]: !c[ch.id] })))}>
                            {chCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          </button>
                        ) : (
                          <span className="w-3.5 text-right text-[11px] text-stone-400">{no}</span>
                        )
                      }
                      label={renaming === ch.id ? <RenameInput initial={ch.title} onDone={(title) => rename('chapter', ch.id, title)} onCancel={() => setRenaming(null)} /> : chapterLabel(ch, no)}
                      strong
                      words={chWords}
                      onClick={() => ch.scenes[0] && onOpenScene(ch.scenes[0].id)}
                      onDoubleClick={() => setRenaming(ch.id)}
                      menu={(close) => (
                        <>
                          <MenuItem icon={<Pencil />} onClick={() => (close(), setRenaming(ch.id))}>
                            {t('Rename')}
                          </MenuItem>
                          <MenuItem icon={<FilePlus2 />} onClick={() => (close(), addScene(ch.id))}>
                            {t('Add scene')}
                          </MenuItem>
                          <MenuItem icon={<FolderPlus />} onClick={() => (close(), addChapter(act.id, ci + 1))}>
                            {t('Insert chapter after')}
                          </MenuItem>
                          <ExportItems close={close} novelId={novelId} part={{ scope: 'chapter', item: ch.id }} copyLabel={t('Copy chapter')} wordLabel={t('Export chapter as Word (.docx)')} />
                          <MenuItem danger icon={<Trash2 />} onClick={() => (close(), remove('chapter', ch.id))}>
                            {t('Delete chapter')}
                          </MenuItem>
                        </>
                      )}
                    />
                    {showScenes && !chCollapsed && (
                      <div className="ml-3.5 border-l border-stone-200 pl-1 dark:border-stone-800">
                        {ch.scenes.map((s, si) => (
                          <Row
                            key={s.id}
                            {...dragProps('scene', s.id)}
                            className={dropCls(s.id)}
                            active={s.id === activeSceneId}
                            icon={<GripVertical className="size-3 text-stone-300 dark:text-stone-600" />}
                            label={
                              renaming === s.id ? (
                                <RenameInput initial={s.title} onDone={(title) => rename('scene', s.id, title)} onCancel={() => setRenaming(null)} />
                              ) : (
                                <span className={cn(s.hideFromAI && 'text-stone-400 italic')}>
                                  {sceneLabel(s, si + 1)}
                                  {s.hideFromAI && <EyeOff className="ml-1 inline size-3" />}
                                </span>
                              )
                            }
                            words={words(s)}
                            onClick={() => onOpenScene(s.id)}
                            onDoubleClick={() => setRenaming(s.id)}
                            menu={(close) => (
                              <>
                                <MenuItem icon={<Pencil />} onClick={() => (close(), setRenaming(s.id))}>
                                  {t('Rename')}
                                </MenuItem>
                                <MenuItem icon={<FilePlus2 />} onClick={() => (close(), addScene(ch.id, si + 1))}>
                                  {t('Insert scene after')}
                                </MenuItem>
                                <MenuItem icon={<EyeOff />} onClick={() => (close(), toggleHidden(s))}>
                                  {s.hideFromAI ? t('Make visible to the AI') : t('Hide from the AI')}
                                </MenuItem>
                                <MenuItem icon={isPinned(pins, 'scene', s.id) ? <PinOff /> : <Pin />} onClick={() => (close(), void togglePin(novelId, 'scene', s.id))}>
                                  {isPinned(pins, 'scene', s.id) ? t('Unpin') : t('Pin next to the text')}
                                </MenuItem>
                                <ExportItems close={close} novelId={novelId} part={{ scope: 'scene', item: s.id }} copyLabel={t('Copy scene')} wordLabel={t('Export scene as Word (.docx)')} />
                                <MenuItem danger icon={<Trash2 />} onClick={() => (close(), remove('scene', s.id))}>
                                  {t('Delete scene')}
                                </MenuItem>
                              </>
                            )}
                          />
                        ))}
                        {ch.scenes.length === 0 && (
                          <button type="button" className="px-2 py-1 text-xs text-stone-400 hover:text-stone-600" onClick={() => addScene(ch.id)}>
                            + {t('Create scene')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
          if (!showActs) return <div key={act.id}>{chapters}</div>;
          return (
            <div key={act.id} className="mb-1">
              <Row
                {...dragProps('act', act.id)}
                className={dropCls(act.id)}
                icon={
                  <button type="button" onClick={(e) => (e.stopPropagation(), setCollapsed((c) => ({ ...c, [act.id]: !c[act.id] })))}>
                    {actCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </button>
                }
                label={
                  renaming === act.id ? (
                    <RenameInput initial={act.title} onDone={(title) => rename('act', act.id, title)} onCancel={() => setRenaming(null)} />
                  ) : (
                    <span className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{act.title || t('Act {n}', { n: ai + 1 })}</span>
                  )
                }
                words={actWords}
                onClick={() => setCollapsed((c) => ({ ...c, [act.id]: !c[act.id] }))}
                onDoubleClick={() => setRenaming(act.id)}
                menu={(close) => (
                  <>
                    <MenuItem icon={<Pencil />} onClick={() => (close(), setRenaming(act.id))}>
                      {t('Rename')}
                    </MenuItem>
                    <MenuItem icon={<FolderPlus />} onClick={() => (close(), addChapter(act.id))}>
                      {t('Add chapter')}
                    </MenuItem>
                    <MenuItem icon={<Layers />} onClick={() => (close(), addAct(ai + 1))}>
                      {t('Insert act after')}
                    </MenuItem>
                    <ExportItems close={close} novelId={novelId} part={{ scope: 'act', item: act.id }} copyLabel={t('Copy act')} wordLabel={t('Export act as Word (.docx)')} />
                    <MenuItem danger disabled={outline.acts.length <= 1} icon={<Trash2 />} onClick={() => (close(), remove('act', act.id))}>
                      {t('Delete act')}
                    </MenuItem>
                  </>
                )}
              />
              {!actCollapsed && chapters}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 border-t border-stone-200 p-2 dark:border-stone-800">
        <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => addChapter(outline.acts[outline.acts.length - 1].id)}>
          {t('Chapter')}
        </Button>
        <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => addAct()}>
          {t('Act')}
        </Button>
        <span className="ml-auto" />
        <NovelExportMenu novelId={novelId} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Export & Kopieren

function ExportItems({ close, novelId, part, copyLabel, wordLabel }: { close: () => void; novelId: string; part: ExportPart; copyLabel: string; wordLabel: string }) {
  return (
    <>
      <MenuItem icon={<Copy />} onClick={() => (close(), void copyPart(novelId, part))}>
        {copyLabel}
      </MenuItem>
      <MenuItem icon={<FileDown />} onClick={() => (close(), void downloadPart(novelId, part))}>
        {wordLabel}
      </MenuItem>
    </>
  );
}

/** Ganzen Roman kopieren oder exportieren; dazu die Wahl, ob Szenen als Überschriften erscheinen. */
export function NovelExportMenu({ novelId }: { novelId: string }) {
  const { data: settings } = useSettings();
  const headings = settings?.exportSceneHeadings ?? true;
  return (
    <Menu
      trigger={(open, ref) => (
        <Button ref={ref} size="xs" variant="ghost" icon={<Download className="size-3.5" />} onClick={open} title={t('Copy or export the whole novel')}>
          {t('Export')}
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={<Copy />} onClick={() => (close(), void copyPart(novelId, { scope: 'novel' }))}>
            {t('Copy whole novel')}
          </MenuItem>
          <MenuItem icon={<FileDown />} onClick={() => (close(), void downloadPart(novelId, { scope: 'novel' }))}>
            {t('Export novel as Word (.docx)')}
          </MenuItem>
          <MenuItem icon={<FileText />} onClick={() => (close(), void downloadPart(novelId, { scope: 'novel' }, 'markdown'))}>
            {t('Export novel as Markdown')}
          </MenuItem>
          <div className="my-1 border-t border-stone-200 dark:border-stone-700" />
          <MenuItem icon={headings ? <SquareCheck /> : <Square />} onClick={() => void patchSettings({ exportSceneHeadings: !headings }).catch(toast.error)}>
            {t('Scenes as headings')}
          </MenuItem>
          <div className="max-w-60 px-2.5 pb-1 text-[11px] leading-snug text-stone-500">
            {headings
              ? t('Act › chapter › scene structure, e.g. in Word’s navigation pane. Applies to copying and export.')
              : t('Scenes are separated by “* * *”. Applies to copying and export.')}
          </div>
        </>
      )}
    </Menu>
  );
}

function findChapter(o: Outline, id: string) {
  return o.acts.flatMap((a) => a.chapters).find((c) => c.id === id);
}

function Row({
  icon,
  label,
  words,
  active,
  strong,
  onClick,
  onDoubleClick,
  menu,
  className,
  ...drag
}: {
  icon: ReactNode;
  label: ReactNode;
  words?: number;
  active?: boolean;
  strong?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  menu?: (close: () => void) => ReactNode;
  className?: string;
} & Record<string, unknown>) {
  // Menü über "…" oder Rechtsklick; an der aktiven Zeile ist "…" immer sichtbar
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = () => setMenuAnchor(null);
  const showMenuButton = !!menu && (active || !!menuAnchor);
  return (
    <div
      {...drag}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        if (!menu) return;
        e.preventDefault();
        setMenuAnchor(e.currentTarget);
      }}
      className={cn(
        'group flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 select-none',
        active ? 'bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-50' : 'hover:bg-stone-200/60 dark:hover:bg-stone-800/70',
        className,
      )}
    >
      <span className="flex w-3.5 shrink-0 items-center justify-center text-stone-400">{icon}</span>
      <span className={cn('min-w-0 flex-1 truncate', strong && 'font-medium')}>{label}</span>
      {words != null && <span className={cn('shrink-0 text-[11px] text-stone-400 tabular-nums', menu && 'group-hover:hidden', showMenuButton && 'hidden')}>{formatNumber(words)}</span>}
      {menu && (
        <span className={showMenuButton ? 'block' : 'hidden group-hover:block'} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title={t('Actions (also via right-click)')}
            onClick={(e) => setMenuAnchor(menuAnchor ? null : e.currentTarget)}
            className="rounded p-0.5 text-stone-400 hover:bg-stone-300/60 hover:text-stone-700 dark:hover:bg-stone-700"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          <Popover anchor={menuAnchor} open={!!menuAnchor} onClose={closeMenu} align="end" className="min-w-48">
            {menu(closeMenu)}
          </Popover>
        </span>
      )}
    </div>
  );
}

function RenameInput({ initial, onDone, onCancel }: { initial: string; onDone: (title: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <Input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(v);
        if (e.key === 'Escape') onCancel();
      }}
      className="h-6 px-1.5 text-sm"
    />
  );
}
