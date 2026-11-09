import { useMemo, useState } from 'react';
import { create } from 'zustand';
import type { Editor } from '@tiptap/core';
import { Archive, Check, RotateCcw, Sparkles, Square, X } from 'lucide-react';
import { textToNodes, type GenerateRequest, type InputValues, type ModelRef } from '@novelmaker/shared';
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
import { Button, cn, Modal, Textarea } from '../components/ui';
import { patchSettings, usePrompts } from '../lib/queries';
import { toast, useGen } from '../lib/store';
import { frameStamp } from './extensions';
import { t } from '../lib/i18n';
import { fullText, insertGeneratedAt, snapshotBeforeAI, stashInFrame, textAfterPos, textBeforePos } from './scope';

// ---------------------------------------------------------------- Umschreiben / Kürzen / Erweitern

interface RewriteTarget {
  editor: Editor;
  sceneId: string;
  novelId: string;
  from: number;
  to: number;
  original: string;
  builtinKey: string;
}

export const useRewrite = create<{ target: RewriteTarget | null; open: (target: RewriteTarget) => void; close: () => void }>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));

export function RewritePanel() {
  const target = useRewrite((s) => s.target);
  const close = useRewrite((s) => s.close);
  if (!target) return null;
  return <RewriteInner key={`${target.from}-${target.to}-${target.builtinKey}`} target={target} onClose={close} />;
}

function RewriteInner({ target, onClose }: { target: RewriteTarget; onClose: () => void }) {
  const { data: prompts } = usePrompts();
  const genKey = `rewrite:${target.sceneId}`;
  const gen = useGen((s) => s.gens[genKey]);
  const start = useGen((s) => s.start);
  const abort = useGen((s) => s.abort);
  const clear = useGen((s) => s.clear);
  const last = useLastSelection('rewrite', ['text-replacement'], target.builtinKey);
  const byKey = prompts?.find((p) => p.builtinKey === target.builtinKey && p.type === 'text-replacement');
  const [promptId, setPromptId] = useState<string | null>(byKey?.id ?? last.promptId);
  const [model, setModel] = useTouched<ModelRef | null>(last.model);
  const [inputs, setInputs] = useState<InputValues>({});
  const [instruction, setInstruction] = useState('');
  const prompt = useMemo(() => prompts?.find((p) => p.id === promptId) ?? null, [prompts, promptId]);
  const promptInputs = usePromptInputs(prompt);
  const modelLabel = useModelLabel();
  const custom = target.builtinKey === 'custom-edit';

  const build = (): GenerateRequest | null => {
    if (!promptId) return null;
    const ed = target.editor;
    return {
      kind: 'rewrite',
      promptId,
      model: model ?? undefined,
      novelId: target.novelId,
      sceneId: target.sceneId,
      selection: target.original,
      message: instruction,
      textBefore: textBeforePos(ed, target.from),
      textAfter: textAfterPos(ed, target.to),
      sceneText: fullText(ed),
      inputs,
    };
  };
  const est = useCostEstimate(build, [promptId, model, inputs, instruction]);
  const generate = () => {
    const req = build();
    if (!req?.model) return toast.error(t('Please choose a prompt and a model.'));
    if (custom && !instruction.trim()) return toast.error(t('Please enter an instruction.'));
    void patchSettings({ lastSelections: { rewrite: { promptId: req.promptId, model: req.model } } }).catch(() => undefined);
    void start(genKey, req);
  };
  const accept = async () => {
    const ed = target.editor;
    if (!gen?.text.trim() || ed.isDestroyed) return;
    let { from, to } = target;
    const current = ed.state.doc.textBetween(from, to, '\n\n');
    if (current !== target.original) {
      // Dokument hat sich geändert: Originaltext suchen
      let found = -1;
      ed.state.doc.descendants((node, pos) => {
        if (found >= 0 || !node.isTextblock) return found < 0;
        const idx = node.textContent.indexOf(target.original);
        if (idx >= 0) found = pos + 1 + idx;
        return false;
      });
      if (found < 0) return toast.error(t('The selected text has changed in the meantime — please select it again.'));
      from = found;
      to = found + target.original.length;
    }
    await snapshotBeforeAI(ed, target.sceneId);
    const nodes = textToNodes(gen.text);
    const singlePara = nodes.length === 1 && !target.original.includes('\n');
    ed.chain()
      .focus()
      .insertContentAt({ from, to }, singlePara ? (nodes[0].content ?? []) : nodes)
      .run();
    clear(genKey);
    onClose();
  };
  /** Variante unter der Textstelle ablegen, Fenster bleibt für den nächsten Versuch offen */
  const stash = () => {
    if (!gen?.text.trim() || target.editor.isDestroyed) return;
    const ok = stashInFrame(target.editor, target.to, gen.text, (n) =>
      t('{name} · variant {n} · {model} · {date}', { name: prompt?.name ?? t('Editing'), n, model: modelLabel(gen.request.model), date: frameStamp() }),
    );
    if (ok) {
      clear(genKey);
      toast.success(t('Variant stashed below the passage.'));
    }
  };
  const close = () => {
    if (gen?.status === 'streaming') abort(genKey);
    clear(genKey);
    onClose();
  };
  const streaming = gen?.status === 'streaming';
  return (
    <Modal open onClose={close} title={prompt?.name ?? t('Edit text')} width="max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PromptPicker types={['text-replacement']} value={promptId} onChange={setPromptId} />
        <ModelPicker value={model} onChange={setModel} />
        <InputsForm inputs={promptInputs} values={inputs} onChange={setInputs} novelId={target.novelId} compact />
        <div className="ml-auto">
          <PreviewButton build={build} />
        </div>
      </div>
      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={2}
        placeholder={custom ? t('What should happen to the text? (e.g. “More tension, shorter sentences”)') : t('Optional additional instruction…')}
        className="mb-3"
        autoFocus={custom}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate();
        }}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{t('Before')}</div>
          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-stone-200 bg-stone-50 p-3 font-serif text-[15px] leading-relaxed whitespace-pre-wrap dark:border-stone-800 dark:bg-stone-950">
            {target.original}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{t('After')}</div>
          <div
            className={cn(
              'max-h-[50vh] min-h-24 overflow-y-auto rounded-md border border-amber-200 bg-amber-50/50 p-3 font-serif text-[15px] leading-relaxed whitespace-pre-wrap dark:border-amber-900 dark:bg-amber-950/20',
              streaming && 'stream-cursor',
            )}
          >
            {gen?.text || (!gen && <span className="font-sans text-sm text-stone-400">{t('Nothing generated yet.')}</span>)}
          </div>
        </div>
      </div>
      {gen && <WarningsList warnings={gen.warnings.filter((w) => w.level !== 'info')} />}
      {gen?.error && <div className="mt-2 text-sm text-red-600">{gen.error}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {streaming ? (
          <Button variant="secondary" icon={<Square className="size-3" />} onClick={() => abort(genKey)}>
            {t('Stop')}
          </Button>
        ) : (
          <EstimateHover estimate={est.estimate} loading={est.loading} onHover={est.refresh}>
            <Button variant="primary" icon={gen ? <RotateCcw className="size-3.5" /> : <Sparkles className="size-3.5" />} onClick={generate}>
              {gen ? t('Regenerate') : t('Generate')}
            </Button>
          </EstimateHover>
        )}
        {gen && !streaming && gen.text.trim() && (
          <Button variant="primary" icon={<Check className="size-3.5" />} onClick={accept}>
            {t('Accept')}
          </Button>
        )}
        {gen && !streaming && gen.text.trim() && (
          <Button icon={<Archive className="size-3.5" />} onClick={stash} title={t('Stash as a variant in a frame below the passage — the text itself stays unchanged')}>
            {t('Stash')}
          </Button>
        )}
        <Button variant="ghost" icon={<X className="size-3.5" />} onClick={close}>
          {t('Discard')}
        </Button>
        {!streaming && <EstimateChip estimate={est.estimate} loading={est.loading} onHover={est.refresh} />}
        {gen && (
          <span className="ml-auto">
            <CostLine cost={gen.cost} promptTokens={gen.promptTokens} completionTokens={gen.completionTokens} />
          </span>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Weiterschreiben

interface ContinueTarget {
  editor: Editor;
  sceneId: string;
  novelId: string;
  pos: number;
}

export const useContinue = create<{ target: ContinueTarget | null; open: (target: ContinueTarget) => void; close: () => void }>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));

export function ContinuePanel() {
  const target = useContinue((s) => s.target);
  const close = useContinue((s) => s.close);
  if (!target) return null;
  return <ContinueInner key={`${target.sceneId}-${target.pos}`} target={target} onClose={close} />;
}

function ContinueInner({ target, onClose }: { target: ContinueTarget; onClose: () => void }) {
  const { data: prompts } = usePrompts();
  const genKey = `continue:${target.sceneId}`;
  const gen = useGen((s) => s.gens[genKey]);
  const start = useGen((s) => s.start);
  const abort = useGen((s) => s.abort);
  const clear = useGen((s) => s.clear);
  const last = useLastSelection('continue', ['continue-writing'], 'continue');
  const [promptId, setPromptId] = useTouched<string | null>(last.promptId);
  const [model, setModel] = useTouched<ModelRef | null>(last.model);
  const [inputs, setInputs] = useTouched<InputValues>(last.inputs);
  const [instruction, setInstruction] = useState('');
  const prompt = useMemo(() => prompts?.find((p) => p.id === promptId) ?? null, [prompts, promptId]);
  const promptInputs = usePromptInputs(prompt);
  const modelLabel = useModelLabel();

  const build = (): GenerateRequest | null => {
    if (!promptId) return null;
    const ed = target.editor;
    return {
      kind: 'continue',
      promptId,
      model: model ?? undefined,
      novelId: target.novelId,
      sceneId: target.sceneId,
      message: instruction,
      textBefore: textBeforePos(ed, target.pos),
      textAfter: textAfterPos(ed, target.pos),
      sceneText: fullText(ed),
      inputs,
    };
  };
  const est = useCostEstimate(build, [promptId, model, inputs, instruction]);
  const generate = () => {
    const req = build();
    if (!req?.model) return toast.error(t('Please choose a prompt and a model.'));
    void patchSettings({ lastSelections: { continue: { promptId: req.promptId, model: req.model, inputs } } }).catch(() => undefined);
    void start(genKey, req);
  };
  const accept = async () => {
    const ed = target.editor;
    if (!gen?.text.trim() || ed.isDestroyed) return;
    await snapshotBeforeAI(ed, target.sceneId);
    insertGeneratedAt(ed, target.pos, gen.text);
    clear(genKey);
    onClose();
  };
  const stash = () => {
    if (!gen?.text.trim() || target.editor.isDestroyed) return;
    const ok = stashInFrame(target.editor, target.pos, gen.text, (n) =>
      t('Continue writing · variant {n} · {model} · {date}', { n, model: modelLabel(gen.request.model), date: frameStamp() }),
    );
    if (ok) {
      clear(genKey);
      toast.success(t('Variant stashed below the paragraph.'));
    }
  };
  const close = () => {
    if (gen?.status === 'streaming') abort(genKey);
    clear(genKey);
    onClose();
  };
  const streaming = gen?.status === 'streaming';
  return (
    <div className="fixed right-4 bottom-4 z-40 w-[min(42rem,calc(100vw-2rem))] rounded-xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-2 dark:border-stone-800">
        <span className="text-sm font-semibold">{t('Continue writing')}</span>
        <PromptPicker types={['continue-writing']} value={promptId} onChange={setPromptId} />
        <ModelPicker value={model} onChange={setModel} />
        <InputsForm inputs={promptInputs} values={inputs} onChange={setInputs} novelId={target.novelId} compact />
        <div className="ml-auto flex items-center">
          <PreviewButton build={build} />
          <button type="button" onClick={close} className="rounded p-1 text-stone-400 hover:text-stone-700">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="p-3">
        <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} placeholder={t('Optional instruction (e.g. “Jack walks in”)…')} />
        {gen && (
          <div className={cn('mt-2 max-h-72 overflow-y-auto font-serif text-[15px] leading-relaxed whitespace-pre-wrap', streaming && 'stream-cursor')}>{gen.text}</div>
        )}
        {gen && <WarningsList warnings={gen.warnings.filter((w) => w.level !== 'info')} />}
        {gen?.error && <div className="mt-2 text-sm text-red-600">{gen.error}</div>}
        <div className="mt-2 flex items-center gap-2">
          {streaming ? (
            <Button size="sm" icon={<Square className="size-3" />} onClick={() => abort(genKey)}>
              {t('Stop')}
            </Button>
          ) : (
            <EstimateHover estimate={est.estimate} loading={est.loading} onHover={est.refresh}>
              <Button size="sm" variant="primary" icon={<Sparkles className="size-3.5" />} onClick={generate}>
                {gen ? t('Regenerate') : t('Generate')}
              </Button>
            </EstimateHover>
          )}
          {gen && !streaming && gen.text.trim() && (
            <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={accept}>
              {t('Accept')}
            </Button>
          )}
          {gen && !streaming && gen.text.trim() && (
            <Button size="sm" icon={<Archive className="size-3.5" />} onClick={stash} title={t('Stash as a variant in a frame below the paragraph — collapsible and hidden from the AI')}>
              {t('Stash')}
            </Button>
          )}
          {!streaming && <EstimateChip estimate={est.estimate} loading={est.loading} onHover={est.refresh} />}
          {gen && (
            <span className="ml-auto">
              <CostLine cost={gen.cost} promptTokens={gen.promptTokens} completionTokens={gen.completionTokens} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
