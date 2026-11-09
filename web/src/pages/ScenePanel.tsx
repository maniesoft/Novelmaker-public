import { useEffect, useMemo, useState } from 'react';
import { Check, History, RotateCcw, ScanEye, Sparkles, Square, Trash2, X } from 'lucide-react';
import { CodexMatcher, codexTypeLabel, docToHtml, effectiveCodex, type GenerateRequest, type ModelRef, type Outline, type PreviewResult, type SceneMeta, type SceneSnapshot } from '@novelmaker/shared';
import {
  CodexReasons,
  CostLine,
  EstimateChip,
  EstimateHover,
  ModelPicker,
  PreviewModal,
  PromptPicker,
  useCostEstimate,
  useLastSelection,
  useTouched,
  WarningsList,
} from '../components/ai';
import { Badge, Button, cn, confirmDialog, Field, formatDate, IconButton, Input, Modal, Popover, Select, Spinner, Tabs, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { invalidateNovel, keys, patchSettings, queryClient, useCodex, useOutline, useSnapshots } from '../lib/queries';
import { toast, useGen } from '../lib/store';
import { useActiveEditor, fullText } from '../editor/scope';
import { POV_OPTIONS, PovSelect } from './LibraryPage';
import { openCodexModal } from '../components/CodexModal';
import { aiPinnedCodexIds } from '../lib/pins';
import { deleteOutlineItem } from './OutlineTree';
import { t, tn } from '../lib/i18n';

type Tab = 'scene' | 'codex' | 'ai' | 'history';

export function ScenePanel({ outline, scene, onRestored, onOpenScene }: { outline: Outline; scene: SceneMeta; onRestored: () => void; onOpenScene: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>('scene');
  return (
    <div className="flex h-full flex-col">
      <Tabs
        value={tab}
        onChange={setTab}
        className="px-2 pt-1"
        tabs={[
          { value: 'scene', label: t('Scene') },
          { value: 'codex', label: t('Codex') },
          { value: 'ai', label: t('AI') },
          { value: 'history', label: t('Versions') },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'scene' && <SceneInfo key={scene.id} outline={outline} scene={scene} onOpenScene={onOpenScene} />}
        {tab === 'codex' && <SceneCodex novelId={outline.novel.id} sceneId={scene.id} />}
        {tab === 'ai' && <AiContext novelId={outline.novel.id} sceneId={scene.id} />}
        {tab === 'history' && <Snapshots sceneId={scene.id} onRestored={onRestored} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Erzählperspektive je Szene

const povTypeLabel = (v: string | null | undefined) => {
  const label = POV_OPTIONS.find((o) => o.value === v)?.label;
  return label ? t(label) : (v ?? '');
};

/** POV-Figur und Perspektive der Szene; leer = wie im Roman. */
function ScenePovFields({ outline, scene }: { outline: Outline; scene: SceneMeta }) {
  const novelId = outline.novel.id;
  const { data: codex } = useCodex(novelId);
  const characters = (codex?.entries ?? []).filter((e) => e.type === 'character');
  const novelPov = codex?.entries.find((e) => e.id === outline.novel.povCharacterId)?.name;
  return (
    <div className="space-y-2">
      <Field label={t('POV character')}>
        <Select value={scene.povCharacterId ?? ''} onChange={(e) => patchScene(novelId, scene.id, { povCharacterId: e.target.value || null })}>
          <option value="">{novelPov ? t('same as novel ({name})', { name: novelPov }) : t('same as novel')}</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('Point of view')}>
        <PovSelect
          allowInherit
          inheritLabel={t('same as novel ({pov})', { pov: povTypeLabel(outline.novel.povType) })}
          value={scene.povType ?? ''}
          onChange={(v) => patchScene(novelId, scene.id, { povType: (v || null) as SceneMeta['povType'] })}
        />
      </Field>
    </div>
  );
}

/**
 * Knopf über dem Szenentext: zeigt, aus wessen Sicht und in welcher Perspektive die Szene erzählt wird,
 * und öffnet die Auswahl. Farbig, wenn die Szene vom Roman abweicht.
 */
export function ScenePovChip({ novelId, sceneId, className, subtle }: { novelId: string; sceneId: string; className?: string; subtle?: boolean }) {
  const { data: outline } = useOutline(novelId);
  const { data: codex } = useCodex(novelId);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const scene = outline?.acts.flatMap((a) => a.chapters.flatMap((c) => c.scenes)).find((s) => s.id === sceneId);
  if (!outline || !scene) return null;
  const own = !!(scene.povCharacterId || scene.povType);
  const charId = scene.povCharacterId ?? outline.novel.povCharacterId;
  const who = codex?.entries.find((e) => e.id === charId)?.name ?? t('no character');
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={own ? t('This scene’s point of view differs from the novel’s — click to change') : t('Same point of view as the novel — click to change it for this scene')}
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-[11px] whitespace-nowrap',
          own
            ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
            : 'border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:border-stone-700 dark:text-stone-400 dark:hover:text-stone-200',
          // im Manuskript: Standard-Perspektive nur beim Drüberfahren über die Szene
          subtle && !own && !open && 'opacity-0 transition-opacity group-hover/scene:opacity-100 focus:opacity-100',
          className,
        )}
      >
        <ScanEye className="size-3 shrink-0" />
        <span className="truncate">
          {t('POV: {who} · {pov}', { who, pov: povTypeLabel(scene.povType ?? outline.novel.povType) })}
          {!own && <span className="text-stone-400"> ({t('same as novel')})</span>}
        </span>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" className="w-80 p-3">
        <div className="mb-2 text-sm font-semibold">{t('Point of view of this scene')}</div>
        <ScenePovFields outline={outline} scene={scene} />
        <div className="mt-3 flex items-center gap-2">
          {own && (
            <Button size="xs" icon={<RotateCcw className="size-3" />} onClick={() => void patchScene(novelId, scene.id, { povCharacterId: null, povType: null })}>
              {t('Same as novel')}
            </Button>
          )}
          <span className="text-[11px] text-stone-500">{t('Applies to the AI in this scene. You set the default in the novel settings.')}</span>
        </div>
      </Popover>
    </>
  );
}

function patchScene(novelId: string, id: string, patch: Partial<SceneMeta>) {
  queryClient.setQueryData<Outline>(keys.outline(novelId), (o) =>
    o ? { ...o, acts: o.acts.map((a) => ({ ...a, chapters: a.chapters.map((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) })) })) } : o,
  );
  return api.patch(`/api/scenes/${id}`, patch).catch(toast.error);
}

function SceneInfo({ outline, scene, onOpenScene }: { outline: Outline; scene: SceneMeta; onOpenScene: (id: string) => void }) {
  const novelId = outline.novel.id;
  const { data: codex } = useCodex(novelId);
  const [summary, setSummary] = useState(scene.summary);
  const [labels, setLabels] = useState(scene.labels.join(', '));
  useEffect(() => setSummary(scene.summary), [scene.summary]);

  return (
    <div className="space-y-4">
      <Field label={t('Title')}>
        <Input defaultValue={scene.title} key={scene.id + scene.title} placeholder={t('(untitled)')} onBlur={(e) => e.target.value !== scene.title && patchScene(novelId, scene.id, { title: e.target.value }).then(() => invalidateNovel(novelId))} />
      </Field>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-stone-600 dark:text-stone-400">{t('Summary')}</span>
        </div>
        <Textarea
          autoGrow
          rows={4}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={() => summary !== scene.summary && patchScene(novelId, scene.id, { summary })}
          placeholder={t('What is this scene about? Feeds storySoFar.')}
          className="text-[13px]"
        />
        <SummaryGenerator novelId={novelId} sceneId={scene.id} onAccept={(text) => (setSummary(text), patchScene(novelId, scene.id, { summary: text }))} />
      </div>
      <ScenePovFields outline={outline} scene={scene} />
      <Field label={t('Labels')} hint={t('Comma-separated, e.g. “flashback, draft”')}>
        <Input value={labels} onChange={(e) => setLabels(e.target.value)} onBlur={() => patchScene(novelId, scene.id, { labels: labels.split(',').map((x) => x.trim()).filter(Boolean) })} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 accent-amber-700" checked={scene.hideFromAI} onChange={(e) => patchScene(novelId, scene.id, { hideFromAI: e.target.checked })} />
        <span>
          {t('Hide from the AI')}
          <span className="block text-xs text-stone-500">{t('Not in storySoFar, the context picker, etc.')}</span>
        </span>
      </label>
      <div className="border-t border-stone-200 pt-3 dark:border-stone-800">
        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" icon={<Trash2 className="size-3.5" />} onClick={() => void deleteOutlineItem(outline, 'scene', scene.id, { activeSceneId: scene.id, onOpenScene })}>
          {t('Delete scene')}
        </Button>
      </div>
    </div>
  );
}

function SummaryGenerator({ novelId, sceneId, onAccept }: { novelId: string; sceneId: string; onAccept: (text: string) => void }) {
  const genKey = `summary:${sceneId}`;
  const gen = useGen((s) => s.gens[genKey]);
  const start = useGen((s) => s.start);
  const abort = useGen((s) => s.abort);
  const clear = useGen((s) => s.clear);
  const last = useLastSelection('summary', ['summary'], 'summary-scene');
  const [promptId, setPromptId] = useTouched<string | null>(last.promptId);
  const [model, setModel] = useTouched<ModelRef | null>(last.model);
  const [open, setOpen] = useState(false);
  const build = (): GenerateRequest | null => {
    if (!promptId) return null;
    const ed = useActiveEditor.getState();
    return {
      kind: 'summary',
      promptId,
      model: model ?? undefined,
      novelId,
      sceneId,
      sceneText: ed.sceneId === sceneId && ed.editor ? fullText(ed.editor) : undefined,
    };
  };
  const est = useCostEstimate(() => (open || gen ? build() : null), [promptId, model, open || !!gen]);
  const run = () => {
    const req = build();
    if (!req?.model || !model) return toast.error(t('Please choose a prompt and a model.'));
    void patchSettings({ lastSelections: { summary: { promptId: req.promptId, model } } }).catch(() => undefined);
    void start(genKey, req);
  };
  if (!open && !gen)
    return (
      <Button size="xs" variant="ghost" className="mt-1" icon={<Sparkles className="size-3.5" />} onClick={() => setOpen(true)}>
        {t('Summarize with AI')}
      </Button>
    );
  const streaming = gen?.status === 'streaming';
  return (
    <div className="mt-2 rounded-md border border-stone-200 p-2 dark:border-stone-800">
      <div className="flex flex-wrap gap-1.5">
        <PromptPicker types={['summary']} value={promptId} onChange={setPromptId} className="max-w-full" />
        <ModelPicker value={model} onChange={setModel} />
      </div>
      {gen && <div className={cn('mt-2 text-[13px] whitespace-pre-wrap', streaming && 'stream-cursor')}>{gen.text}</div>}
      {gen?.error && <div className="mt-1 text-xs text-red-600">{gen.error}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {streaming ? (
          <Button size="xs" icon={<Square className="size-3" />} onClick={() => abort(genKey)}>
            {t('Stop')}
          </Button>
        ) : (
          <EstimateHover estimate={est.estimate} loading={est.loading} onHover={est.refresh}>
            <Button size="xs" variant="primary" icon={gen ? <RotateCcw className="size-3" /> : <Sparkles className="size-3" />} onClick={run}>
              {gen ? t('New') : t('Generate')}
            </Button>
          </EstimateHover>
        )}
        {gen && !streaming && gen.text.trim() && (
          <Button
            size="xs"
            variant="primary"
            icon={<Check className="size-3" />}
            onClick={() => {
              onAccept(gen.text.trim());
              clear(genKey);
              setOpen(false);
            }}
          >
            {t('Accept')}
          </Button>
        )}
        <Button size="xs" variant="ghost" icon={<X className="size-3" />} onClick={() => (clear(genKey), setOpen(false))}>
          {t('Close')}
        </Button>
        {gen ? (
          <CostLine cost={gen.cost} promptTokens={gen.promptTokens} completionTokens={gen.completionTokens} />
        ) : (
          <EstimateChip estimate={est.estimate} loading={est.loading} onHover={est.refresh} />
        )}
      </div>
    </div>
  );
}

function SceneCodex({ novelId, sceneId }: { novelId: string; sceneId: string }) {
  const { data } = useCodex(novelId);
  const editor = useActiveEditor((s) => (s.sceneId === sceneId ? s.editor : null));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const h = () => setTick((x) => x + 1);
    editor.on('update', h);
    return () => {
      editor.off('update', h);
    };
  }, [editor]);
  const counts = useMemo(() => {
    if (!data || !editor) return new Map<string, number>();
    return new CodexMatcher(effectiveCodex(data.entries).entries).countMentions(fullText(editor));
  }, [data, editor, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const mentioned = (data?.entries ?? []).filter((e) => counts.has(e.id)).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  const always = (data?.entries ?? []).filter((e) => e.inclusion === 'always');
  if (!editor) return <div className="text-sm text-stone-500">{t('Click in the text to see the mentions.')}</div>;
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{t('Mentioned in this scene')}</div>
        {!mentioned.length && <div className="text-stone-500">{t('No codex entries detected.')}</div>}
        {mentioned.map((e) => (
          <button key={e.id} type="button" onClick={() => openCodexModal(novelId, e.id)} title={t('Edit (opens over the text)')} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800">
            <span className="flex-1 truncate">{e.name}</span>
            <Badge>{codexTypeLabel(e.type)}</Badge>
            <span className="w-6 text-right text-xs text-stone-400">{counts.get(e.id)}×</span>
          </button>
        ))}
      </div>
      {always.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{t('Always included')}</div>
          {always.map((e) => (
            <div key={e.id} className="px-1.5 py-0.5 text-stone-600 dark:text-stone-400">
              {e.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** „Was ginge für diese Szene an die KI?“ */
function AiContext({ novelId, sceneId }: { novelId: string; sceneId: string }) {
  const last = useLastSelection('beat', ['scene-beat-completion'], 'beat');
  const [data, setData] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [full, setFull] = useState<GenerateRequest | null>(null);
  const build = (): GenerateRequest | null => {
    const ed = useActiveEditor.getState();
    if (!last.promptId) return null;
    const text = ed.sceneId === sceneId && ed.editor ? fullText(ed.editor) : undefined;
    return {
      kind: 'preview',
      promptId: last.promptId,
      novelId,
      sceneId,
      message: '(Beat)',
      textBefore: text ?? '',
      textAfter: '',
      sceneText: text,
      inputs: last.inputs,
      pinnedCodexIds: aiPinnedCodexIds(novelId),
    };
  };
  const load = async () => {
    const req = build();
    if (!req) return;
    setLoading(true);
    try {
      setData(await api.post<PreviewResult>('/api/preview', req));
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [sceneId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-stone-500">
        {t('Codex selection for a beat at the end of this scene (with the most recently used beat prompt). Struck through = left out because of the token budget.')}
      </p>
      <div className="flex gap-2">
        <Button size="xs" loading={loading} onClick={load}>
          {t('Refresh')}
        </Button>
        <Button size="xs" onClick={() => setFull(build())}>
          {t('Show full prompt')}
        </Button>
      </div>
      {data && (
        <>
          <div className="text-xs text-stone-500">{tn(data.tokens, 'Full prompt ≈ {n} token', 'Full prompt ≈ {n} tokens')}</div>
          <WarningsList warnings={data.warnings} />
          {data.codex.length ? <CodexReasons items={data.codex} /> : <div className="text-stone-500">{t('No codex entries.')}</div>}
        </>
      )}
      {!data && loading && <Spinner />}
      {full && <PreviewModal request={full} onClose={() => setFull(null)} />}
    </div>
  );
}

function Snapshots({ sceneId, onRestored }: { sceneId: string; onRestored: () => void }) {
  const { data, isLoading } = useSnapshots(sceneId);
  const [view, setView] = useState<SceneSnapshot | null>(null);
  const create = async () => {
    const ed = useActiveEditor.getState();
    await api.post(`/api/scenes/${sceneId}/snapshots`, { reason: t('Manual'), content: ed.sceneId === sceneId ? ed.editor?.getJSON() : undefined });
    queryClient.invalidateQueries({ queryKey: keys.snapshots(sceneId) });
  };
  const open = async (id: string) => setView(await api.get<SceneSnapshot>(`/api/snapshots/${id}`));
  const restore = async () => {
    if (!view) return;
    await api.post(`/api/snapshots/${view.id}/restore`);
    setView(null);
    queryClient.invalidateQueries({ queryKey: keys.snapshots(sceneId) });
    onRestored();
    toast.success(t('Version restored (the previous state was saved as well).'));
  };
  const remove = async (s: SceneSnapshot) => {
    const ok = await confirmDialog({
      title: t('Delete version?'),
      message: tn(
        s.wordCount,
        'The version from {date} ({reason}, {n} word) will be deleted. The current scene text stays unchanged.',
        'The version from {date} ({reason}, {n} words) will be deleted. The current scene text stays unchanged.',
        { date: formatDate(s.createdAt), reason: s.reason || t('no reason given') },
      ),
    });
    if (!ok) return;
    try {
      await api.del(`/api/snapshots/${s.id}`);
      if (view?.id === s.id) setView(null);
      queryClient.invalidateQueries({ queryKey: keys.snapshots(sceneId) });
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="space-y-2 text-sm">
      <Button size="xs" icon={<History className="size-3.5" />} onClick={create}>
        {t('Back up now')}
      </Button>
      <p className="text-xs text-stone-500">{t('A version is saved automatically before any AI text is accepted.')}</p>
      {isLoading && <Spinner />}
      {data?.map((s) => (
        <div key={s.id} className="group flex items-center gap-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800">
          <button type="button" onClick={() => open(s.id)} className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left">
            <span className="flex-1">
              <span className="block">{formatDate(s.createdAt)}</span>
              <span className="block text-xs text-stone-500">{s.reason}</span>
            </span>
            <span className="text-xs text-stone-400">{tn(s.wordCount, '{n} w.', '{n} w.')}</span>
          </button>
          <IconButton title={t('Delete version')} className="opacity-40 group-hover:opacity-100 hover:text-red-600" onClick={() => void remove(s)}>
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      ))}
      {view && (
        <Modal
          open
          onClose={() => setView(null)}
          title={t('Version from {date}', { date: formatDate(view.createdAt) })}
          width="max-w-3xl"
          footer={
            <>
              <Button variant="ghost" className="mr-auto text-red-600 dark:text-red-400" icon={<Trash2 className="size-4" />} onClick={() => void remove(view)}>
                {t('Delete')}
              </Button>
              <Button variant="ghost" onClick={() => setView(null)}>
                {t('Close')}
              </Button>
              <Button variant="primary" onClick={restore}>
                {t('Restore')}
              </Button>
            </>
          }
        >
          <div className="prose-doc" dangerouslySetInnerHTML={{ __html: docToHtml(view.content) }} />
        </Modal>
      )}
    </div>
  );
}
