// Baustein-Editor: Rolle & Stil, Kontext-Bausteine zum Anhaken, Aufgabe, Auswahlfelder beim Ausführen.
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Braces, Plus, X } from 'lucide-react';
import {
  BLOCK_DEFS,
  BLOCK_GROUPS,
  blockConfig,
  chipStatus,
  compileBlockPrompt,
  LENGTH_OPTION,
  PLACEHOLDERS,
  placeholderName,
  WORDS_OPTION,
  type BlockConfig,
  type BlockDef,
  type BlockKind,
  type BlockPromptSpec,
  type Lang,
  type PromptOption,
  type PromptType,
} from '@novelmaker/shared';
import { Button, cn, IconButton, Input, Menu, MenuItem, Select } from './ui';
import { ChipEditor, type ChipChoice, type ChipEditorHandle } from './ChipEditor';
import { t } from '../lib/i18n';

interface Props {
  type: PromptType;
  spec: BlockPromptSpec;
  /** Sprache der bearbeiteten Fassung (Rahmentexte, Platzhalter-Namen, Rechtschreibprüfung) */
  lang: Lang;
  onChange: (spec: BlockPromptSpec) => void;
  onSave?: () => void;
}

function SectionTitle({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-stone-500">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

function PlaceholderMenu({ choices, onPick }: { choices: ChipChoice[]; onPick: (name: string) => void }) {
  return (
    <Menu
      trigger={(toggle, ref) => (
        <Button ref={ref} size="xs" variant="ghost" icon={<Braces className="size-3.5" />} onClick={toggle} title={t('Insert placeholder (or type {{)')}>
          {t('Placeholder')}
        </Button>
      )}
    >
      {(close) => (
        <div className="max-h-80 w-80 overflow-y-auto">
          {choices.map((c) => (
            <MenuItem key={c.name} onClick={() => (close(), onPick(c.name))}>
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{c.name}</span>
                <span className="truncate text-xs text-stone-500">{c.detail}</span>
              </span>
            </MenuItem>
          ))}
        </div>
      )}
    </Menu>
  );
}

export function BlockPromptEditor({ type, spec, lang, onChange, onSave }: Props) {
  const roleRef = useRef<ChipEditorHandle>(null);
  const taskRef = useRef<ChipEditorHandle>(null);
  const compiled = useMemo(() => compileBlockPrompt(spec, type, lang), [spec, type, lang]);
  const options = spec.options;
  const choices: ChipChoice[] = useMemo(
    () => [
      ...options
        .filter((o) => o.name.trim())
        .map((o) => ({ name: o.name.trim(), detail: o.choices.length ? t('Option field: {values}', { values: o.choices.join(' / ') }) : t('Option field') })),
      ...PLACEHOLDERS.filter((p) => !p.types || p.types.includes(type)).map((p) => ({ name: placeholderName(p, lang), detail: t(p.doc) })),
    ],
    [options, type, lang],
  );
  const statusOf = (name: string) => chipStatus(name, spec.options);
  const isChat = type === 'workshop-chat';
  const beatChip = placeholderName(PLACEHOLDERS.find((p) => p.key === 'beat')!, lang);
  const instructionChip = placeholderName(PLACEHOLDERS.find((p) => p.key === 'instruction')!, lang);

  const setBlock = (kind: BlockKind, patch: Partial<BlockConfig>) => onChange({ ...spec, blocks: { ...spec.blocks, [kind]: { ...blockConfig(spec, kind), ...patch } } });
  const setOption = (i: number, patch: Partial<PromptOption>) => onChange({ ...spec, options: spec.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  return (
    <div className="mx-auto max-w-3xl space-y-7 px-5 py-5">
      <section>
        <SectionTitle
          title={t('Role & style')}
          hint={t('Who is the AI, and how should it write? Description, style rules, things to avoid — just as text.')}
          right={<PlaceholderMenu choices={choices} onPick={(n) => roleRef.current?.insert(n)} />}
        />
        <ChipEditor
          ref={roleRef}
          value={spec.role}
          onChange={(role) => onChange({ ...spec, role })}
          choices={choices}
          statusOf={statusOf}
          minHeight={200}
          onSave={onSave}
          lang={lang}
          placeholder={t('e.g. You are an honest editor. Evaluate the text according to the following criteria: …')}
        />
      </section>

      <section>
        <SectionTitle title={t('Context blocks')} hint={t('What else the AI receives. Check what you need — the order in the prompt is handled automatically.')} />
        <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
          {BLOCK_GROUPS.map((g) => {
            const defs = BLOCK_DEFS.filter((d) => d.group === g.group && d.types.includes(type));
            if (!defs.length) return null;
            return (
              <div key={g.group} className="px-3 py-2">
                <div className="pb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{t(g.label)}</div>
                {defs.map((d) => (
                  <BlockRow key={d.kind} def={d} config={blockConfig(spec, d.kind)} onChange={(p) => setBlock(d.kind, p)} />
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle
          title={isChat ? t('Rules for the responses') : t('Task')}
          hint={
            isChat
              ? t('Goes at the end of the system prompt. The chat messages are appended after it automatically.')
              : type === 'scene-beat-completion'
                ? t('What the AI should do. The beat’s text is inserted via the “{chip}” placeholder.', { chip: beatChip })
                : type === 'summary'
                  ? t('What the AI should do with the text.')
                  : t('What the AI should do. An instruction typed in when running is inserted via “{chip}”.', { chip: instructionChip })
          }
          right={<PlaceholderMenu choices={choices} onPick={(n) => taskRef.current?.insert(n)} />}
        />
        <ChipEditor ref={taskRef} value={spec.task} onChange={(task) => onChange({ ...spec, task })} choices={choices} statusOf={statusOf} minHeight={110} onSave={onSave} lang={lang} />
      </section>

      <section>
        <SectionTitle
          title={t('Choose when running')}
          hint={t(
            'Fields you choose when generating (e.g. the length). Use them in the text via the placeholder of the same name. “{words}” also limits the response length, as does “{length}” for summaries.',
            { words: WORDS_OPTION[lang], length: LENGTH_OPTION[lang] },
          )}
        />
        <div className="space-y-2">
          {spec.options.map((o, i) => (
            <OptionRow key={i} option={o} lang={lang} onChange={(p) => setOption(i, p)} onRemove={() => onChange({ ...spec, options: spec.options.filter((_, j) => j !== i) })} />
          ))}
          <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => onChange({ ...spec, options: [...spec.options, { name: '', choices: [], default: '' }] })}>
            {t('Option field')}
          </Button>
        </div>
      </section>

      {compiled.warnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {compiled.warnings.map((w) => (
            <div key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockRow({ def, config, onChange }: { def: BlockDef; config: BlockConfig; onChange: (p: Partial<BlockConfig>) => void }) {
  const params = def.params ?? [];
  const small = 'flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400';
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5 py-1.5">
      <label className="flex min-w-60 flex-1 cursor-pointer items-start gap-2">
        <input type="checkbox" className="mt-0.5 size-4 accent-amber-700" checked={config.on} onChange={(e) => onChange({ on: e.target.checked })} />
        <span>
          <span className={cn('text-sm', !config.on && 'text-stone-500')}>{t(def.label)}</span>
          <span className="block text-xs text-stone-500">{t(def.hint)}</span>
        </span>
      </label>
      {params.length > 0 && (
        <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5', !config.on && 'pointer-events-none opacity-40')}>
          {params.includes('entry') && (
            <span className={small}>
              {t('Entry')}
              <Input value={config.entry ?? ''} onChange={(e) => onChange({ entry: e.target.value })} placeholder={t('e.g. {example}', { example: 'AI-isms' })} className="h-7 w-36 text-[13px]" />
            </span>
          )}
          {params.includes('words') && (
            <span className={small} title={def.kind === 'previousSceneEnd' ? undefined : t('0 = all')}>
              <Input
                type="number"
                min={0}
                step={50}
                value={config.words ?? 0}
                onChange={(e) => onChange({ words: Math.max(0, Number(e.target.value) || 0) })}
                className="h-7 w-20 text-right text-[13px]"
              />
              {def.kind !== 'previousSceneEnd' && (config.words ?? 0) === 0 ? t('Words (all)') : t('Words')}
            </span>
          )}
          {params.includes('asExample') && (
            <label className={cn(small, 'cursor-pointer')} title={t('The AI receives the text as if it had written it itself, and so adopts its style.')}>
              <input type="checkbox" className="size-3.5 accent-amber-700" checked={!!config.asExample} onChange={(e) => onChange({ asExample: e.target.checked })} />
              {t('as style reference')}
            </label>
          )}
          {params.includes('samePov') && (
            <label className={cn(small, 'cursor-pointer')}>
              <input type="checkbox" className="size-3.5 accent-amber-700" checked={config.samePov !== false} onChange={(e) => onChange({ samePov: e.target.checked })} />
              {t('only with the same POV character')}
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function OptionRow({ option, lang, onChange, onRemove }: { option: PromptOption; lang: Lang; onChange: (p: Partial<PromptOption>) => void; onRemove: () => void }) {
  // Werte als Rohtext halten, damit Kommas beim Tippen nicht verschwinden
  const [raw, setRaw] = useState(option.choices.join(', '));
  const parse = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-2 dark:border-stone-800 dark:bg-stone-900">
      <Input value={option.name} onChange={(e) => onChange({ name: e.target.value })} placeholder={t('Name, e.g. {example}', { example: WORDS_OPTION[lang] })} className="h-8 w-40 font-medium" />
      <Input
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          const choices = parse(e.target.value);
          onChange({ choices, default: choices.includes(option.default) ? option.default : (choices[0] ?? option.default) });
        }}
        placeholder={t('Values, comma-separated (empty = free input)')}
        className="h-8 min-w-48 flex-1"
      />
      <span className="text-xs text-stone-500">{t('Default')}</span>
      {option.choices.length ? (
        <Select value={option.default} onChange={(e) => onChange({ default: e.target.value })} className="h-8 w-28">
          {option.choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      ) : (
        <Input value={option.default} onChange={(e) => onChange({ default: e.target.value })} className="h-8 w-28" />
      )}
      <IconButton title={t('Remove option field')} onClick={onRemove}>
        <X className="size-4" />
      </IconButton>
    </div>
  );
}
