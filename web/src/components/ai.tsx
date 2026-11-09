import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Bot, ChevronDown, Eye, FileText, Layers, ListTree, NotebookPen, Plus, Search, Sparkles, StickyNote, X } from 'lucide-react';
import {
  codexTypeLabel,
  collectPromptInputs,
  defaultInputValue,
  formatCost,
  formatTokens,
  REFERENCE_INPUT_KINDS,
  type CollectionModel,
  type CostEstimate,
  type EstimateResult,
  type GenerateRequest,
  type InputValue,
  type InputValues,
  type ModelRef,
  type PreviewResult,
  type Prompt,
  type PromptInput,
  type PromptType,
  type RefKind,
  type RefValue,
} from '@novelmaker/shared';
import { api } from '../lib/api';
import { N_, t, tn } from '../lib/i18n';
import { useCodex, useCollections, useOutline, usePrompts, useProviders, useSettings, useSnippets } from '../lib/queries';
import { Badge, Button, cn, Modal, Popover, Select, Spinner, Tabs, Textarea, Input } from './ui';

// ---------------------------------------------------------------- Modelle

export function useModelLabel() {
  const { data: collections } = useCollections();
  const { data: providers } = useProviders();
  return (m: ModelRef | null | undefined): string => {
    if (!m) return t('No model');
    for (const c of collections ?? []) {
      const x = c.models.find((y) => y.providerId === m.providerId && y.modelId === m.modelId);
      if (x) return x.name || x.modelId;
    }
    const p = providers?.find((x) => x.id === m.providerId);
    return p?.models.find((x) => x.id === m.modelId)?.name ?? m.modelId;
  };
}

export function useDefaultModel(): ModelRef | null {
  const { data: settings } = useSettings();
  const { data: collections } = useCollections();
  const c = collections?.find((x) => x.id === settings?.defaultCollectionId) ?? collections?.[0];
  const m = c?.models[0];
  return m ? { providerId: m.providerId, modelId: m.modelId } : null;
}

export function ModelPicker({ value, onChange, className }: { value: ModelRef | null; onChange: (m: ModelRef) => void; className?: string }) {
  const { data: collections } = useCollections();
  const { data: providers } = useProviders();
  const label = useModelLabel();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState('');
  const all = useMemo(
    () =>
      (providers ?? []).flatMap((p) =>
        p.models.map((m) => ({ providerId: p.id, modelId: m.id, name: m.name ?? m.id, provider: p.name, pricing: m.pricing, ctx: m.contextLength })),
      ),
    [providers],
  );
  const needle = q.trim().toLowerCase();
  const found = needle ? all.filter((m) => m.modelId.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle)).slice(0, 60) : [];
  const pick = (m: ModelRef) => {
    onChange({ providerId: m.providerId, modelId: m.modelId });
    setOpen(false);
    setQ('');
  };
  const isSel = (m: ModelRef) => value?.providerId === m.providerId && value?.modelId === m.modelId;
  const noModels = !collections?.some((c) => c.models.length) && !all.length;
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-7 max-w-56 items-center gap-1 rounded-md border border-stone-300 bg-white px-2 text-[13px] text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800',
          className,
        )}
        title={t('Choose model')}
      >
        <Bot className="size-3.5 shrink-0 text-stone-400" />
        <span className="truncate">{label(value)}</span>
        <ChevronDown className="size-3.5 shrink-0 text-stone-400" />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} className="w-80">
        <div className="relative p-1">
          <Search className="absolute top-3 left-3 size-3.5 text-stone-400" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search all models…')} className="pl-7" />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {noModels && <div className="p-3 text-sm text-stone-500">{t('No models yet. Create a provider and a model collection in Settings.')}</div>}
          {needle
            ? found.map((m) => (
                <ModelRow key={m.providerId + m.modelId} selected={isSel(m)} onClick={() => pick(m)} name={m.name} sub={`${m.provider} · ${m.modelId}`} />
              ))
            : collections?.map((c) => (
                <div key={c.id}>
                  <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-stone-400 uppercase">{c.name}</div>
                  {c.models.map((m: CollectionModel) => (
                    <ModelRow
                      key={m.providerId + m.modelId}
                      selected={isSel(m)}
                      onClick={() => pick(m)}
                      name={m.name || m.modelId}
                      sub={`${providers?.find((p) => p.id === m.providerId)?.name ?? '?'} · ${m.modelId}`}
                    />
                  ))}
                </div>
              ))}
          {needle && !found.length && <div className="p-3 text-sm text-stone-500">{t('Nothing found.')}</div>}
        </div>
      </Popover>
    </>
  );
}

function ModelRow({ name, sub, selected, onClick }: { name: string; sub: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800', selected && 'bg-amber-50 dark:bg-amber-950/40')}
    >
      <div className="truncate text-sm">{name}</div>
      <div className="truncate text-[11px] text-stone-500">{sub}</div>
    </button>
  );
}

// ---------------------------------------------------------------- Prompts

export function PromptPicker({ types, value, onChange, className }: { types: PromptType[]; value: string | null | undefined; onChange: (id: string) => void; className?: string }) {
  const { data: prompts } = usePrompts();
  const list = (prompts ?? []).filter((p) => types.includes(p.type));
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={cn('h-7 max-w-56 text-[13px]', className)} title={t('Choose prompt')}>
      {!value && <option value="">{t('Choose prompt…')}</option>}
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}

/** Eingabefelder eines Prompts inkl. eingebundener Komponenten. */
export function usePromptInputs(prompt: Pick<Prompt, 'messages' | 'inputs'> | null | undefined) {
  const { data: prompts } = usePrompts();
  return useMemo(() => {
    if (!prompt) return [];
    const components = (prompts ?? []).filter((p) => p.type === 'component').map((p) => ({ name: p.name, messages: p.messages, inputs: p.inputs }));
    return collectPromptInputs(prompt, components);
  }, [prompt, prompts]);
}

export function isReferenceInput(def: PromptInput) {
  return def.types.some((ty) => REFERENCE_INPUT_KINDS.includes(ty));
}

function valueOf(values: InputValues, name: string): InputValue | undefined {
  const k = Object.keys(values).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? values[k] : undefined;
}

/** Formular aus den Eingabefeldern. `contextInputs`: Verweisfelder mit addToContext anzeigen? */
export function InputsForm({
  inputs,
  values,
  onChange,
  novelId,
  compact,
  showReferences = true,
}: {
  inputs: PromptInput[];
  values: InputValues;
  onChange: (v: InputValues) => void;
  novelId: string;
  compact?: boolean;
  showReferences?: boolean;
}) {
  const [more, setMore] = useState(false);
  const set = (name: string, v: InputValue) => {
    const next = { ...values };
    for (const k of Object.keys(next)) if (k.toLowerCase() === name.toLowerCase()) delete next[k];
    next[name] = v;
    onChange(next);
  };
  const visible = inputs.filter((d) => !d.hideInput && (showReferences || !isReferenceInput(d)));
  const hidden = inputs.filter((d) => d.hideInput && (showReferences || !isReferenceInput(d)));
  const render = (d: PromptInput) => <InputField key={d.name} def={d} value={valueOf(values, d.name)} onChange={(v) => set(d.name, v)} novelId={novelId} compact={compact} />;
  if (!visible.length && !hidden.length) return null;
  return (
    <div className={cn(compact ? 'flex flex-wrap items-center gap-2' : 'space-y-3')}>
      {visible.map(render)}
      {hidden.length > 0 &&
        (more ? (
          hidden.map(render)
        ) : (
          <button type="button" className="text-xs text-stone-500 underline-offset-2 hover:underline" onClick={() => setMore(true)}>
            + {tn(hidden.length, '{n} more input', '{n} more inputs')}
          </button>
        ))}
    </div>
  );
}

type FieldProps = { def: PromptInput; value: InputValue | undefined; onChange: (v: InputValue) => void; novelId: string; compact?: boolean };

function InputField(props: FieldProps) {
  return isReferenceInput(props.def) ? <RefField {...props} /> : <ValueField {...props} />;
}

function RefField({ def, value, onChange, novelId, compact }: FieldProps) {
  const label = def.displayName || def.name;
  {
    const refs = Array.isArray(value) ? value : [];
    const kinds = def.types.filter((ty) => REFERENCE_INPUT_KINDS.includes(ty)) as RefKind[];
    const mode = (k: RefKind) => (def.settings?.[k] as { mode?: 'full' | 'summary' } | undefined)?.mode;
    return (
      <div className={cn(compact ? 'flex items-center gap-1.5' : '')}>
        {!compact && (
          <div className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-400" title={def.description}>
            {label}
            {def.required && <span className="text-red-500"> *</span>}
          </div>
        )}
        <ContextPicker
          novelId={novelId}
          value={refs}
          onChange={onChange}
          kinds={kinds}
          single={def.mode !== 'multiple'}
          defaultModes={Object.fromEntries(kinds.map((k) => [k, mode(k)]))}
          label={compact ? label : undefined}
        />
      </div>
    );
  }
}

function ValueField({ def, value, onChange, compact }: FieldProps) {
  const label = def.displayName || def.name;
  const options = def.types.includes('dropdown') ? (def.settings?.dropdown?.options ?? []) : [];
  const allowText = def.types.includes('text') || !options.length;
  const current = typeof value === 'string' ? value : (defaultInputValue(def) ?? '');
  const isCustom = current !== '' && !options.includes(current);
  const [custom, setCustom] = useState(isCustom);
  const control =
    options.length && !custom ? (
      <Select
        value={current}
        onChange={(e) => {
          if (e.target.value === '__custom__') setCustom(true);
          else onChange(e.target.value);
        }}
        className={cn(compact ? 'h-7 w-auto text-[13px]' : '')}
        title={def.description}
      >
        {!current && <option value="">–</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {allowText && <option value="__custom__">{t('Custom value…')}</option>}
      </Select>
    ) : (
      <div className="flex items-center gap-1">
        <Input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.settings?.text?.placeholder ?? ''}
          className={cn(compact ? 'h-7 w-24 text-[13px]' : '')}
          title={def.description}
        />
        {options.length > 0 && (
          <button type="button" className="text-xs text-stone-500 hover:underline" onClick={() => setCustom(false)}>
            {t('List')}
          </button>
        )}
      </div>
    );
  if (compact)
    return (
      <label className="flex items-center gap-1.5 text-[13px] text-stone-600 dark:text-stone-400" title={def.description}>
        {label}
        {control}
      </label>
    );
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
        {label}
        {def.required && <span className="text-red-500"> *</span>}
        {def.description && <span className="ml-1 font-normal text-stone-400">– {def.description}</span>}
      </span>
      {control}
    </label>
  );
}

// ---------------------------------------------------------------- Kontextauswahl

const KIND_ICON: Record<RefKind, ReactNode> = {
  act: <Layers className="size-3" />,
  chapter: <ListTree className="size-3" />,
  scene: <FileText className="size-3" />,
  codex: <BookOpen className="size-3" />,
  snippet: <StickyNote className="size-3" />,
  fullNovel: <NotebookPen className="size-3" />,
  text: <Sparkles className="size-3" />,
};

export function refLabel(r: RefValue): string {
  const base = r.label ?? (r.type === 'text' ? (r.text ?? '').slice(0, 30) : r.type === 'fullNovel' ? t('Whole novel') : r.id ?? '');
  return r.mode === 'summary' && r.type !== 'codex' && r.type !== 'snippet' ? t('{label} (summary)', { label: base }) : base;
}

export function ContextPicker({
  novelId,
  value,
  onChange,
  kinds = ['act', 'chapter', 'scene', 'codex', 'snippet', 'fullNovel', 'text'],
  single,
  defaultModes = {},
  label,
}: {
  novelId: string;
  value: RefValue[];
  onChange: (v: RefValue[]) => void;
  kinds?: RefKind[];
  single?: boolean;
  defaultModes?: Partial<Record<RefKind, 'full' | 'summary' | undefined>>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const add = (r: RefValue) => {
    if (single) onChange([r]);
    else if (!value.some((x) => x.type === r.type && x.id === r.id && x.mode === r.mode && x.text === r.text)) onChange([...value, r]);
    if (single) setOpen(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {label && <span className="text-[13px] text-stone-600 dark:text-stone-400">{label}</span>}
      {value.map((r, i) => (
        <span
          key={i}
          className="inline-flex max-w-60 items-center gap-1 rounded-full border border-stone-300 bg-white py-0.5 pr-1 pl-2 text-xs dark:border-stone-700 dark:bg-stone-900"
        >
          <span className="text-stone-400">{KIND_ICON[r.type]}</span>
          <span className="truncate">{refLabel(r)}</span>
          <button type="button" className="rounded-full p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-700" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-stone-300 px-2 text-xs text-stone-500 hover:border-stone-400 hover:text-stone-700 dark:border-stone-700"
      >
        <Plus className="size-3" /> {single && value.length ? t('Change') : t('Context')}
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} className="w-96">
        <ContextBrowser novelId={novelId} kinds={kinds} onPick={add} defaultModes={defaultModes} />
      </Popover>
    </div>
  );
}

function ContextBrowser({
  novelId,
  kinds,
  onPick,
  defaultModes,
}: {
  novelId: string;
  kinds: RefKind[];
  onPick: (r: RefValue) => void;
  defaultModes: Partial<Record<RefKind, 'full' | 'summary' | undefined>>;
}) {
  const tabs = [
    (kinds.includes('act') || kinds.includes('chapter') || kinds.includes('scene')) && { value: 'outline', label: t('Manuscript') },
    kinds.includes('codex') && { value: 'codex', label: t('Codex') },
    kinds.includes('snippet') && { value: 'snippet', label: t('Snippets') },
    (kinds.includes('fullNovel') || kinds.includes('text')) && { value: 'other', label: t('Other') },
  ].filter(Boolean) as { value: string; label: string }[];
  const [tab, setTab] = useState(tabs[0]?.value ?? 'outline');
  const [summary, setSummary] = useState<boolean>(Object.values(defaultModes).includes('summary'));
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const { data: outline } = useOutline(novelId);
  const { data: codex } = useCodex(novelId);
  const { data: snippets } = useSnippets(novelId);
  const mode = summary ? 'summary' : 'full';
  const needle = q.trim().toLowerCase();
  let chNo = 0;
  return (
    <div className="flex max-h-[28rem] flex-col">
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {(tab === 'outline' || tab === 'codex' || tab === 'snippet') && (
        <div className="flex items-center gap-2 p-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Filter…')} className="h-7" autoFocus />
          {tab === 'outline' && (
            <label className="flex shrink-0 items-center gap-1 text-xs">
              <input type="checkbox" className="accent-amber-700" checked={summary} onChange={(e) => setSummary(e.target.checked)} />
              {t('summary only')}
            </label>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {tab === 'outline' &&
          outline?.acts.map((act, ai) => (
            <div key={act.id}>
              {outline.acts.length > 1 && kinds.includes('act') && (
                <PickRow
                  icon={KIND_ICON.act}
                  label={act.title || t('Act {n}', { n: ai + 1 })}
                  strong
                  onClick={() => onPick({ type: 'act', id: act.id, mode, label: act.title || t('Act {n}', { n: ai + 1 }) })}
                />
              )}
              {act.chapters.map((ch) => {
                chNo++;
                const chLabel = ch.title ? `${chNo}. ${ch.title}` : t('Chapter {n}', { n: chNo });
                const scenes = ch.scenes.filter((s, i) => !needle || `${chLabel} ${s.title} ${i + 1}`.toLowerCase().includes(needle));
                if (needle && !chLabel.toLowerCase().includes(needle) && !scenes.length) return null;
                return (
                  <div key={ch.id}>
                    {kinds.includes('chapter') ? (
                      <PickRow icon={KIND_ICON.chapter} label={chLabel} strong onClick={() => onPick({ type: 'chapter', id: ch.id, mode, label: chLabel })} />
                    ) : (
                      <div className="px-2 pt-1 text-xs font-semibold text-stone-500">{chLabel}</div>
                    )}
                    {kinds.includes('scene') &&
                      scenes.map((s) => {
                        const idx = ch.scenes.indexOf(s) + 1;
                        const l = `${chLabel} · ${s.title || t('Scene {n}', { n: idx })}`;
                        return (
                          <PickRow
                            key={s.id}
                            indent
                            icon={KIND_ICON.scene}
                            label={s.title || t('Scene {n}', { n: idx })}
                            sub={s.summary ? s.summary.slice(0, 80) : tn(s.wordCount, '{n} word', '{n} words')}
                            onClick={() => onPick({ type: 'scene', id: s.id, mode, label: l })}
                          />
                        );
                      })}
                  </div>
                );
              })}
            </div>
          ))}
        {tab === 'codex' &&
          codex?.entries
            .filter((e) => !needle || e.name.toLowerCase().includes(needle) || e.aliases.some((a) => a.toLowerCase().includes(needle)))
            .map((e) => (
              <PickRow
                key={e.id}
                icon={KIND_ICON.codex}
                label={e.name}
                sub={codexTypeLabel(e.type)}
                onClick={() => onPick({ type: 'codex', id: e.id, label: e.name })}
              />
            ))}
        {tab === 'snippet' &&
          snippets
            ?.filter((s) => !needle || s.title.toLowerCase().includes(needle))
            .map((s) => <PickRow key={s.id} icon={KIND_ICON.snippet} label={s.title} sub={s.text.slice(0, 80)} onClick={() => onPick({ type: 'snippet', id: s.id, label: s.title })} />)}
        {tab === 'other' && (
          <div className="space-y-3 p-2">
            {kinds.includes('fullNovel') && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onPick({ type: 'fullNovel', mode: 'full', label: t('Whole novel') })}>
                  {t('Whole novel (full text)')}
                </Button>
                <Button size="sm" onClick={() => onPick({ type: 'fullNovel', mode: 'summary', label: t('Novel overview') })}>
                  {t('Overview (summaries)')}
                </Button>
              </div>
            )}
            {kinds.includes('text') && (
              <div>
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={t('Context typed in on the fly…')} />
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={!text.trim()}
                  onClick={() => {
                    onPick({ type: 'text', text, label: text.slice(0, 30) });
                    setText('');
                  }}
                >
                  {t('Add text')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PickRow({ icon, label, sub, onClick, indent, strong }: { icon: ReactNode; label: string; sub?: string; onClick: () => void; indent?: boolean; strong?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-start gap-2 rounded-md px-2 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800', indent && 'pl-6')}>
      <span className="mt-1 text-stone-400">{icon}</span>
      <span className="min-w-0">
        <span className={cn('block truncate text-sm', strong && 'font-medium')}>{label}</span>
        {sub && <span className="block truncate text-[11px] text-stone-500">{sub}</span>}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- Vorschau

export function PreviewButton({ build, label }: { build: () => GenerateRequest | null; label?: string }) {
  const [req, setReq] = useState<GenerateRequest | null>(null);
  return (
    <>
      <Button
        size="xs"
        variant="ghost"
        icon={<Eye className="size-3.5" />}
        onClick={() => setReq(build())}
        title={t('Shows the fully rendered messages that would be sent to the AI')}
      >
        {label ?? t('Preview')}
      </Button>
      {req && <PreviewModal request={req} onClose={() => setReq(null)} />}
    </>
  );
}

export function PreviewModal({ request, onClose }: { request: GenerateRequest; onClose: () => void }) {
  const [data, setData] = useState<(PreviewResult & { params?: Record<string, unknown> }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.post<PreviewResult>('/api/preview', request).then(setData, (e) => setError(e.message));
  }, [request]);
  return (
    <Modal open onClose={onClose} title={t('What is sent to the AI?')} width="max-w-4xl">
      {!data && !error && <Spinner />}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {data && <PreviewContent data={data} />}
    </Modal>
  );
}

export function PreviewContent({ data }: { data: PreviewResult & { params?: Record<string, unknown> } }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="amber">{t('≈ {n} tokens', { n: formatTokens(data.tokens) })}</Badge>
        {data.estimate && (
          <EstimateHover estimate={data.estimate}>
            <Badge tone="green" className="cursor-help">
              {t('Cost {cost}', { cost: estimateLabel(data.estimate) })}
            </Badge>
          </EstimateHover>
        )}
        <Badge>{tn(data.messages.length, '{n} message', '{n} messages')}</Badge>
        {data.params && Object.keys(data.params).length > 0 && <Badge tone="sky">{t('Parameters: {params}', { params: JSON.stringify(data.params) })}</Badge>}
      </div>
      <WarningsList warnings={data.warnings} />
      {data.codex.length > 0 && (
        <details className="rounded-md border border-stone-200 p-2 text-sm dark:border-stone-800">
          <summary className="cursor-pointer font-medium">{t('Codex selection ({n} included)', { n: data.codex.filter((c) => c.included).length })}</summary>
          <CodexReasons items={data.codex} />
        </details>
      )}
      {data.messages.map((m, i) => (
        <div key={i} className="rounded-lg border border-stone-200 dark:border-stone-800">
          <div className="flex items-center justify-between border-b border-stone-200 px-3 py-1.5 text-xs dark:border-stone-800">
            <Badge tone={m.role === 'system' ? 'violet' : m.role === 'assistant' ? 'green' : 'sky'}>{m.role}</Badge>
            <span className="text-stone-400">{t('≈ {n} tokens', { n: formatTokens(Math.ceil(m.content.length / 3.5)) })}</span>
          </div>
          <pre className="max-h-96 overflow-auto p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{m.content}</pre>
        </div>
      ))}
    </div>
  );
}

export function WarningsList({ warnings }: { warnings: { level: string; message: string }[] }) {
  if (!warnings.length) return null;
  return (
    <ul className="space-y-1 text-sm">
      {warnings.map((w, i) => (
        <li
          key={i}
          className={cn(
            'rounded-md px-2 py-1',
            w.level === 'error' && 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200',
            w.level === 'warning' && 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
            w.level === 'info' && 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
          )}
        >
          {w.message}
        </li>
      ))}
    </ul>
  );
}

const REASON_LABEL: Record<string, string> = {
  always: N_('always'),
  pov: N_('POV'),
  pinned: N_('pinned'),
  mentioned: N_('mentioned'),
  'previous-scene': N_('previous scene'),
  recursive: N_('recursive'),
};

export function CodexReasons({ items }: { items: PreviewResult['codex'] }) {
  return (
    <table className="mt-2 w-full text-left text-xs">
      <tbody>
        {items.map((c) => (
          <tr key={c.id} className={cn(!c.included && 'text-stone-400 line-through')}>
            <td className="py-0.5 pr-2">{c.name}</td>
            <td className="pr-2">
              <Badge tone={c.reason === 'always' ? 'violet' : c.reason === 'mentioned' ? 'amber' : 'stone'}>{REASON_LABEL[c.reason] ? t(REASON_LABEL[c.reason]) : c.reason}</Badge>
            </td>
            <td className="text-right text-stone-500">{t('{n} tok.', { n: c.tokens })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- Kostenschätzung vor dem Generieren

/**
 * Schätzt Tokens und Kosten einer Anfrage über den Server.
 * `auto`: sofort und bei Änderung von `deps` (verzögert) neu schätzen. Sonst erst nach `refresh()`
 * (z. B. beim Drüberfahren) – danach folgt die Schätzung ebenfalls den Änderungen.
 */
export function useCostEstimate(build: () => GenerateRequest | null, deps: unknown[], { auto = true }: { auto?: boolean } = {}) {
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const buildRef = useRef(build);
  buildRef.current = build;
  const armed = useRef(auto);
  const seq = useRef(0);
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(() => {
    const req = buildRef.current();
    const id = ++seq.current;
    lastAt.current = Date.now();
    if (!req) {
      setEstimate(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .post<EstimateResult>('/api/estimate', req)
      .then(
        (r) => id === seq.current && setEstimate(r),
        () => id === seq.current && setEstimate(null),
      )
      .finally(() => id === seq.current && setLoading(false));
  }, []);

  const schedule = useCallback(
    (delay: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, delay);
    },
    [run],
  );

  const key = JSON.stringify(deps);
  useEffect(() => {
    if (armed.current) schedule(lastAt.current ? 600 : 200);
  }, [key, schedule]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  /** Aktualisieren, falls die letzte Schätzung älter als ein paar Sekunden ist (Text drumherum kann sich geändert haben). */
  const refresh = useCallback(() => {
    armed.current = true;
    if (Date.now() - lastAt.current > 3000) schedule(0);
  }, [schedule]);

  return { estimate, loading, refresh };
}

/** Kurzform für die Anzeige neben dem Knopf; `withTokens`: Größe der Eingabe immer mit anzeigen. */
export function estimateLabel(e: CostEstimate, withTokens = false): string {
  const tok = withTokens
    ? t('≈ {n} tokens', { n: formatTokens(e.promptTokens) })
    : t('≈ {n} tok.', { n: formatTokens(e.promptTokens + (e.completionTokens ?? 0)) });
  const cost = e.local ? t('local') : e.cost != null ? `≈ ${formatCost(e.cost)}` : e.promptCost != null ? `≥ ${formatCost(e.promptCost)}` : null;
  if (!cost) return tok;
  return withTokens || e.local ? `${tok} · ${cost}` : cost;
}

/** Hülle um „Generieren“ o. Ä.: beim Drüberfahren die Schätzung aktualisieren und Details zeigen. */
export function EstimateHover({
  estimate,
  loading,
  onHover,
  children,
  className,
}: {
  estimate: CostEstimate | null;
  loading?: boolean;
  onHover?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <span
      ref={setAnchor}
      className={cn('inline-flex items-center', className)}
      onMouseEnter={() => {
        onHover?.();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(true), 400);
      }}
      onMouseLeave={stop}
      onMouseDown={stop}
    >
      {children}
      {open && anchor && (
        <HoverCard anchor={anchor}>
          {estimate ? (
            <EstimateDetails e={estimate} />
          ) : loading ? (
            <div className="flex items-center gap-2 text-stone-500">
              <Spinner /> {t('Estimating cost…')}
            </div>
          ) : (
            <div className="text-stone-500">{t('Can’t estimate — choose a prompt and a model.')}</div>
          )}
        </HoverCard>
      )}
    </span>
  );
}

/** Kleine Anzeige „≈ 0.42 ¢“ mit Details beim Drüberfahren. */
export function EstimateChip({
  estimate,
  loading,
  onHover,
  withTokens,
  className,
}: {
  estimate: CostEstimate | null;
  loading?: boolean;
  onHover?: () => void;
  withTokens?: boolean;
  className?: string;
}) {
  if (!estimate && !loading) return null;
  return (
    <EstimateHover estimate={estimate} loading={loading} onHover={onHover} className={className}>
      <span className={cn('cursor-help text-[11px] whitespace-nowrap text-stone-500 tabular-nums dark:text-stone-400', loading && 'opacity-60')}>
        {estimate ? estimateLabel(estimate, withTokens) : '…'}
      </span>
    </EstimateHover>
  );
}

function HoverCard({ anchor, children }: { anchor: HTMLElement; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = ref.current?.offsetWidth ?? 300;
    const h = ref.current?.offsetHeight ?? 160;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    // bevorzugt oberhalb – die Knöpfe sitzen meist unten in Leisten
    const top = r.top - h - 6 >= 8 ? r.top - h - 6 : Math.min(r.bottom + 6, window.innerHeight - h - 8);
    setPos({ top, left });
  }, [anchor, children]);
  return createPortal(
    <div
      ref={ref}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="pointer-events-none fixed z-[60] w-80 rounded-lg border border-stone-200 bg-white p-3 font-sans text-[13px] text-stone-700 shadow-xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
    >
      {children}
    </div>,
    document.body,
  );
}

const BASIS_NOTE: Record<NonNullable<CostEstimate['completionBasis']>, (e: CostEstimate) => string> = {
  words: (e) => t('from “Words”: about {n}', { n: e.words ?? '?' }),
  length: (e) => t('from “Length”: at most {n} words', { n: e.words ?? '?' }),
  selection: () => t('based on the length of the selection'),
  max_tokens: () => t('max_tokens limit'),
};

function EstimateDetails({ e }: { e: CostEstimate }) {
  const perM = (usd: number) => `${(usd * 1e6).toFixed(usd * 1e6 < 1 ? 3 : 2)} $`;
  const used = e.promptTokens + (e.maxCompletionTokens ?? e.completionTokens ?? 0);
  const tooBig = e.contextLength != null && used > e.contextLength;
  const row = (label: ReactNode, tokens: ReactNode, cost: ReactNode, sub?: ReactNode, strong?: boolean) => (
    <div className={cn('grid grid-cols-[5.5rem_1fr_auto] items-baseline gap-x-2 py-0.5', strong && 'font-semibold')}>
      <span className="text-stone-500">{label}</span>
      <span className="tabular-nums">
        {tokens}
        {sub && <span className="block text-[11px] font-normal text-stone-400">{sub}</span>}
      </span>
      <span className="text-right tabular-nums">{cost}</span>
    </div>
  );
  const pc = e.pricing;
  return (
    <div>
      <div className="mb-1.5 font-semibold">{t('Estimated usage')}</div>
      {row(t('Input'), t('≈ {n} tokens', { n: formatTokens(e.promptTokens) }), pc ? formatCost(e.promptCost) : '')}
      {row(
        t('Response'),
        e.completionTokens != null ? t('≈ {n} tokens', { n: formatTokens(e.completionTokens) }) : t('unknown'),
        pc && e.completionTokens != null ? formatCost(e.completionTokens * pc.completion) : '',
        e.completionBasis ? BASIS_NOTE[e.completionBasis](e) : t('no “Words” field and no max_tokens'),
      )}
      <div className="my-1 border-t border-stone-200 dark:border-stone-700" />
      {row(t('Total'), '', e.cost != null ? `≈ ${formatCost(e.cost)}` : pc ? `≥ ${formatCost(e.promptCost)}` : '–', undefined, true)}
      {e.maxCost != null && e.completionBasis !== 'max_tokens' && row(t('Maximum'), t('at max_tokens {n}', { n: formatTokens(e.maxCompletionTokens ?? 0) }), formatCost(e.maxCost))}
      <div className="mt-2 space-y-1 text-[11px] text-stone-500 dark:text-stone-400">
        {e.local ? (
          <div>{t('Local model — no cost.')}</div>
        ) : pc ? (
          <div>{t('Price: {prompt} / {completion} per million tokens (input / output)', { prompt: perM(pc.prompt), completion: perM(pc.completion) })}</div>
        ) : (
          <div>{t('Price unknown — load the provider’s model list in Settings (OpenRouter, for example, provides prices).')}</div>
        )}
        {e.contextLength != null && (
          <div className={cn(tooBig && 'font-medium text-red-600 dark:text-red-400')}>
            {tooBig
              ? t('Context window: {used} of {max} tokens — doesn’t fit!', { used: formatTokens(used), max: formatTokens(e.contextLength) })
              : t('Context window: {used} of {max} tokens', { used: formatTokens(used), max: formatTokens(e.contextLength) })}
          </div>
        )}
        <div>{t('Rough estimate (about 3.5 characters per token). Reasoning models also use thinking tokens, which count as output.')}</div>
      </div>
    </div>
  );
}

export function CostLine({ cost, promptTokens, completionTokens }: { cost: number | null; promptTokens: number | null; completionTokens: number | null }) {
  if (promptTokens == null && cost == null) return null;
  return (
    <span className="text-[11px] text-stone-400">
      {promptTokens != null && t('{prompt} → {completion} tokens', { prompt: formatTokens(promptTokens), completion: formatTokens(completionTokens ?? 0) })}
      {cost != null && ` · ${formatCost(cost)}`}
    </span>
  );
}

/** Gemerkte Auswahl (Prompt, Modell, Eingaben) pro Werkzeug. */
export function useLastSelection(tool: string, promptTypes: PromptType[], fallbackKey?: string) {
  const { data: settings } = useSettings();
  const { data: prompts } = usePrompts();
  const defModel = useDefaultModel();
  const last = settings?.lastSelections?.[tool];
  const validPrompt = last?.promptId && prompts?.some((p) => p.id === last.promptId && promptTypes.includes(p.type)) ? last.promptId : undefined;
  const fallback = prompts?.find((p) => p.builtinKey === fallbackKey && promptTypes.includes(p.type)) ?? prompts?.find((p) => promptTypes.includes(p.type));
  return {
    promptId: validPrompt ?? fallback?.id ?? null,
    model: last?.model ?? defModel,
    inputs: last?.inputs ?? {},
  };
}

export function useTouched<T>(initial: T) {
  const touched = useRef(false);
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    if (!touched.current) setV(initial);
  }, [JSON.stringify(initial)]); // eslint-disable-line react-hooks/exhaustive-deps
  return [
    v,
    (x: T) => {
      touched.current = true;
      setV(x);
    },
  ] as const;
}
