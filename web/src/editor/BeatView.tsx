import { useCallback, useEffect, useMemo } from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Archive, Check, RotateCcw, Sparkles, Square, Trash2, X } from 'lucide-react';
import { nodeText, textToNodes, type GenerateRequest, type InputValues, type ModelRef, type PMNode } from '@novelmaker/shared';
import {
  CostLine,
  EstimateChip,
  EstimateHover,
  InputsForm,
  ModelPicker,
  PreviewButton,
  PromptPicker,
  useCostEstimate,
  useLastSelection,
  useModelLabel,
  usePromptInputs,
  useTouched,
  WarningsList,
} from '../components/ai';
import { Button, cn, IconButton } from '../components/ui';
import { patchSettings, usePrompts } from '../lib/queries';
import { toast, useGen } from '../lib/store';
import { BEAT_GENERATE_EVENT, frameStamp } from './extensions';
import { t, tn } from '../lib/i18n';
import { fullText, snapshotBeforeAI, stashInFrame, textAfterPos, textBeforePos, useSceneScope } from './scope';

export function BeatView({ node, getPos, editor, deleteNode }: NodeViewProps) {
  const { novelId, sceneId } = useSceneScope();
  const beatId = node.attrs.id as string;
  const genKey = `beat:${beatId}`;
  const gen = useGen((s) => s.gens[genKey]);
  const start = useGen((s) => s.start);
  const abort = useGen((s) => s.abort);
  const clear = useGen((s) => s.clear);
  const { data: prompts } = usePrompts();
  const last = useLastSelection('beat', ['scene-beat-completion'], 'beat');
  const [promptId, setPromptId] = useTouched<string | null>(last.promptId);
  const [model, setModel] = useTouched<ModelRef | null>(last.model);
  const [inputs, setInputs] = useTouched<InputValues>(last.inputs);
  const prompt = useMemo(() => prompts?.find((p) => p.id === promptId) ?? null, [prompts, promptId]);
  const promptInputs = usePromptInputs(prompt);
  const modelLabel = useModelLabel();

  const buildRequest = useCallback((): GenerateRequest | null => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos == null || !promptId) return null;
    const current = editor.state.doc.nodeAt(pos);
    const size = current?.nodeSize ?? node.nodeSize;
    return {
      kind: 'beat',
      promptId,
      model: model ?? undefined,
      novelId,
      sceneId,
      message: nodeText((current ?? node).toJSON() as PMNode).trim(),
      textBefore: textBeforePos(editor, pos),
      textAfter: textAfterPos(editor, pos + size),
      sceneText: fullText(editor),
      inputs,
    };
  }, [getPos, editor, node, promptId, model, novelId, sceneId, inputs]);

  // Kostenschätzung erst, wenn die Maus über den Beat fährt – eine Szene kann viele Beats haben
  const {
    estimate,
    loading: estimating,
    refresh: refreshEstimate,
  } = useCostEstimate(buildRequest, [promptId, model, inputs, node.textContent], { auto: false });

  const generate = useCallback(() => {
    const req = buildRequest();
    if (!req) return toast.error(t('Please choose a prompt.'));
    if (!req.model) return toast.error(t('Please choose a model (Settings → Models).'));
    if (!req.message) return toast.error(t('The beat is empty — write in it what should happen.'));
    void patchSettings({ lastSelections: { beat: { promptId: req.promptId, model: req.model, inputs } } }).catch(() => undefined);
    void start(genKey, req);
  }, [buildRequest, start, genKey, inputs]);

  useEffect(() => {
    const onGen = (e: Event) => {
      if ((e as CustomEvent).detail === beatId) generate();
    };
    window.addEventListener(BEAT_GENERATE_EVENT, onGen);
    return () => window.removeEventListener(BEAT_GENERATE_EVENT, onGen);
  }, [beatId, generate]);

  const accept = async () => {
    if (!gen?.text.trim()) return;
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos == null) return;
    await snapshotBeforeAI(editor, sceneId);
    const current = editor.state.doc.nodeAt(pos);
    const after = pos + (current?.nodeSize ?? node.nodeSize);
    editor.chain().insertContentAt(after, textToNodes(gen.text)).run();
    clear(genKey);
  };

  /** Als Variante in einem Rahmen unter dem Beat ablegen und Platz für die nächste Generierung machen */
  const stash = () => {
    if (!gen?.text.trim()) return;
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos == null) return;
    const ok = stashInFrame(editor, pos + 1, gen.text, (n) => t('Variant {n} · {model} · {date}', { n, model: modelLabel(gen.request.model), date: frameStamp() }));
    if (ok) clear(genKey);
  };

  const streaming = gen?.status === 'streaming';
  const words = gen?.text ? gen.text.trim().split(/\s+/).length : 0;

  return (
    <NodeViewWrapper className="beat-node group/beat" data-beat-id={beatId} onMouseEnter={refreshEstimate}>
      <div contentEditable={false} className="flex items-center gap-2 border-b border-amber-200/80 px-2 py-1 select-none dark:border-amber-800/50">
        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-900 uppercase dark:bg-amber-800 dark:text-amber-100">{t('Beat')}</span>
        <span className="truncate text-[11px] text-amber-800/70 dark:text-amber-300/60">{t('Instruction for the AI · Ctrl+Enter generates')}</span>
        <IconButton title={t('Delete beat')} className="ml-auto size-6 opacity-0 group-hover/beat:opacity-100" onClick={() => deleteNode()}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
      <NodeViewContent className="beat-content" />
      <div contentEditable={false} className="flex flex-wrap items-center gap-2 border-t border-amber-200/80 px-2 py-1.5 select-none dark:border-amber-800/50">
        <PromptPicker types={['scene-beat-completion']} value={promptId} onChange={setPromptId} className="max-w-48" />
        <ModelPicker value={model} onChange={setModel} />
        <InputsForm inputs={promptInputs} values={inputs} onChange={setInputs} novelId={novelId} compact />
        <div className="ml-auto flex items-center gap-1">
          <EstimateChip estimate={estimate} loading={estimating} onHover={refreshEstimate} className="mr-1" />
          <PreviewButton build={buildRequest} />
          {streaming ? (
            <Button size="sm" variant="secondary" icon={<Square className="size-3" />} onClick={() => abort(genKey)}>
              {t('Stop')}
            </Button>
          ) : (
            <EstimateHover estimate={estimate} loading={estimating} onHover={refreshEstimate}>
              <Button size="sm" variant="primary" icon={<Sparkles className="size-3.5" />} onClick={generate}>
                {t('Generate')}
              </Button>
            </EstimateHover>
          )}
        </div>
      </div>
      {gen && (
        <div contentEditable={false} className="border-t border-amber-200/80 bg-white/70 px-3 py-2 dark:border-amber-800/50 dark:bg-stone-900/60">
          <WarningsList warnings={gen.warnings.filter((w) => w.level !== 'info')} />
          {gen.reasoning && !gen.text && streaming && <div className="mb-1 text-xs text-stone-400 italic">{t('Model is thinking…')}</div>}
          <div
            className={cn('font-serif text-[length:var(--editor-font-size)] leading-relaxed whitespace-pre-wrap text-stone-800 dark:text-stone-100', streaming && 'stream-cursor')}
          >
            {gen.text || (streaming ? '' : <span className="text-sm text-stone-400">{t('No output.')}</span>)}
          </div>
          {gen.error && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{gen.error}</div>}
          {gen.finish === 'length' && <div className="mt-1 text-xs text-amber-700">{t('Cut off (max_tokens reached).')}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!streaming && gen.text.trim() && (
              <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={accept}>
                {t('Accept')}
              </Button>
            )}
            {!streaming && gen.text.trim() && (
              <Button size="sm" icon={<Archive className="size-3.5" />} onClick={stash} title={t('Stash as a variant in a frame below the beat — collapsible and hidden from the AI')}>
                {t('Stash')}
              </Button>
            )}
            {!streaming && (
              <EstimateHover estimate={estimate} loading={estimating} onHover={refreshEstimate}>
                <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={generate}>
                  {t('Regenerate')}
                </Button>
              </EstimateHover>
            )}
            <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => clear(genKey)}>
              {t('Discard')}
            </Button>
            <span className="ml-auto text-[11px] text-stone-400">{tn(words, '{n} word', '{n} words')}</span>
            <CostLine cost={gen.cost} promptTokens={gen.promptTokens} completionTokens={gen.completionTokens} />
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}
