import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Blocks, ClipboardCopy, Copy, FileInput, Languages, Plus, RotateCcw, Save, Search, TerminalSquare, Trash2, X } from 'lucide-react';
import {
  BLOCK_PROMPT_TYPES,
  compileBlockPrompt,
  convertToBlocks,
  LANGS,
  newBlockSpec,
  PROMPT_TYPES,
  promptTypeLabel,
  retypeSpec,
  type InputValues,
  type Lang,
  type MessageRole,
  type PreviewResult,
  type Prompt,
  type PromptInput,
  type PromptMessage,
  type PromptType,
} from '@novelmaker/shared';
import { api, copyText } from '../lib/api';
import { keys, queryClient, useNovels, useOutline, usePrompts } from '../lib/queries';
import { toast } from '../lib/store';
import { getLang, languageName, t, tr } from '../lib/i18n';
import { Badge, Button, cn, confirmDialog, Empty, Field, Input, Menu, MenuItem, Modal, Select, Spinner, Tabs, Textarea } from '../components/ui';
import { BlockPromptEditor } from '../components/BlockPromptEditor';
import { CodeEditor } from '../components/CodeEditor';
import { InputsForm, PreviewContent, usePromptInputs } from '../components/ai';
import { sceneOptions } from './ChatPage';

export function PromptsPage() {
  const { promptId } = useParams();
  const navigate = useNavigate();
  const { data: prompts, isLoading } = usePrompts();
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [importing, setImporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const list = (prompts ?? []).filter((p) => (!filter || p.type === filter) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  const selected = prompts?.find((p) => p.id === promptId) ?? null;

  const go = async (id: string) => {
    if (dirty && !(await confirmDialog(t('Discard unsaved changes?')))) return;
    setDirty(false);
    navigate(`/prompts/${id}`);
  };
  /** Neuer Prompt aus Bausteinen – mit allen Bausteinen des Typs zum An- und Abhaken, in der eingestellten Sprache. */
  const create = async (type: PromptType) => {
    if (dirty && !(await confirmDialog(t('Discard unsaved changes?')))) return;
    try {
      const lang = getLang();
      const p = await api.post<Prompt>('/api/prompts', { type, name: t('New prompt ({type})', { type: promptTypeLabel(type) }), blocks: newBlockSpec(type, lang), lang });
      await queryClient.invalidateQueries({ queryKey: keys.prompts });
      setDirty(false);
      navigate(`/prompts/${p.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-stone-200 bg-stone-100/60 dark:border-stone-800 dark:bg-stone-900/40">
        <div className="space-y-2 p-3">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 size-3.5 text-stone-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search prompts…')} className="pl-7" />
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{t('All types')}</option>
            {PROMPT_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>
                {t(pt.label)}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <div className="flex-1 [&>button]:w-full">
              <Menu
                align="start"
                trigger={(toggle, ref) => (
                  <Button ref={ref} size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={toggle}>
                    {t('New')}
                  </Button>
                )}
              >
                {(close) => (
                  <div className="w-60">
                    <div className="px-2.5 pt-1 pb-1 text-xs text-stone-500">{t('New block prompt for…')}</div>
                    {BLOCK_PROMPT_TYPES.map((pt) => (
                      <MenuItem key={pt} onClick={() => (close(), void create(pt))}>
                        {promptTypeLabel(pt)}
                      </MenuItem>
                    ))}
                  </div>
                )}
              </Menu>
            </div>
            <Button size="sm" className="flex-1" icon={<FileInput className="size-4" />} onClick={() => setImporting(true)}>
              {t('Import')}
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {isLoading && <Spinner />}
          {PROMPT_TYPES.filter((pt) => list.some((p) => p.type === pt.value)).map((pt) => (
            <div key={pt.value} className="mb-2">
              <div className="px-2 py-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{t(pt.label)}</div>
              {list
                .filter((p) => p.type === pt.value)
                .map((p) => (
                  <PromptRow key={p.id} p={p} active={p.id === promptId} onClick={() => go(p.id)} />
                ))}
            </div>
          ))}
          {list.filter((p) => !PROMPT_TYPES.some((pt) => pt.value === p.type)).map((p) => (
            <PromptRow key={p.id} p={p} active={p.id === promptId} onClick={() => go(p.id)} />
          ))}
          <button
            type="button"
            className="mt-2 px-2 text-xs text-stone-500 hover:underline"
            onClick={() => api.post('/api/prompts/restore-builtins').then(() => queryClient.invalidateQueries({ queryKey: keys.prompts }))}
          >
            {t('Restore deleted built-in prompts')}
          </button>
        </div>
      </aside>
      <section className="min-w-0 flex-1">
        {selected ? (
          <PromptVariants key={selected.id} base={selected} all={prompts ?? []} dirty={dirty} onDirty={setDirty} />
        ) : (
          <Empty icon={<TerminalSquare className="size-12" />} title={t('Prompt workshop')}>
            {t(
              'A prompt consists of role & style (free text), context blocks you check off, the task, and option fields such as the word count. “New” creates a prompt with all blocks. Prompts imported from Novelcrafter stay script prompts and can usually be converted to blocks.',
            )}{' '}
            {t('Each prompt has its own version for each language; the version in the selected language is used.')}
          </Empty>
        )}
      </section>
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={(id) => go(id)} />}
    </div>
  );
}

function PromptRow({ p, active, onClick }: { p: Prompt; active: boolean; onClick: () => void }) {
  const fallback = p.lang !== getLang();
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm', active ? 'bg-amber-100 dark:bg-amber-900/40' : 'hover:bg-stone-200/60 dark:hover:bg-stone-800')}>
      <span className="min-w-0 flex-1 truncate">{p.name}</span>
      {fallback && (
        <span title={t('No version in the selected language yet — the {lang} version is used.', { lang: languageName(p.lang) })}>
          <Badge tone="stone">{p.lang.toUpperCase()}</Badge>
        </span>
      )}
      {!p.blocks && p.type !== 'component' && <Badge tone="violet">{t('Script')}</Badge>}
      {p.origin === 'imported' && <Badge tone="sky">{t('imported')}</Badge>}
      {p.origin === 'builtin' && <Badge>{t('built-in')}</Badge>}
    </button>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ prompt: Prompt; warnings: string[] } | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ prompt: Prompt; warnings: string[] }>('/api/prompts/import', { text, lang: getLang() });
      queryClient.invalidateQueries({ queryKey: keys.prompts });
      if (!r.warnings.length) {
        toast.success(t('Imported “{name}”', { name: r.prompt.name }));
        onClose();
        onDone(r.prompt.id);
      } else setResult(r);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Import prompt from Novelcrafter')}
      width="max-w-2xl"
      footer={
        result ? (
          <Button variant="primary" onClick={() => (onClose(), onDone(result.prompt.id))}>
            {t('Go to prompt')}
          </Button>
        ) : (
          <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={run}>
            {t('Import')}
          </Button>
        )
      }
    >
      {result ? (
        <div className="space-y-2 text-sm">
          <div>{t('Imported “{name}”. Notes:', { name: result.prompt.name })}</div>
          <ul className="list-disc space-y-1 pl-5 text-amber-800 dark:text-amber-300">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">
            {tr(
              'In Novelcrafter, choose “Copy to Clipboard” on the prompt and paste it here. Components can be imported this way too; the “(Copy)” suffix is removed. Novelcrafter’s standard components (<code>Novelcrafter/Codex</code> etc.) are called <code>Novelmaker/…</code> here — references to them are rewritten on import (and back again on export).',
            )}{' '}
            {t('The prompt will be saved as a version in the selected language ({lang}).', { lang: languageName(getLang()) })}
          </p>
          <Textarea autoFocus rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="H4sIAAAAAAAA…" className="font-mono text-xs" />
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Sprachfassungen

/** Lädt die Fassung der gewählten Sprache (Standard: eingestellte Sprache) und zeigt die Werkbank dafür. */
function PromptVariants({ base, all, dirty, onDirty }: { base: Prompt; all: Prompt[]; dirty: boolean; onDirty: (d: boolean) => void }) {
  const uiLang = getLang();
  const [lang, setLang] = useState<Lang>(uiLang);
  const { data: other } = useQuery({
    queryKey: [...keys.prompts, base.id, lang],
    queryFn: () => api.get<Prompt>(`/api/prompts/${base.id}?lang=${lang}`),
    enabled: lang !== uiLang,
    staleTime: 0,
  });
  const prompt = lang === uiLang ? base : other;
  const switchLang = async (l: Lang) => {
    if (l === lang) return;
    if (dirty && !(await confirmDialog(t('Discard unsaved changes?')))) return;
    onDirty(false);
    setLang(l);
  };
  if (!prompt) return <Spinner />;
  return <PromptWorkbench key={`${prompt.id}-${lang}-${prompt.lang}`} prompt={prompt} lang={lang} onLang={switchLang} all={all} onDirty={onDirty} />;
}

function LangBar({ prompt, lang, onLang }: { prompt: Prompt; lang: Lang; onLang: (l: Lang) => void }) {
  return (
    <div className="flex items-center gap-1" title={t('Version per language')}>
      <Languages className="size-3.5 text-stone-400" />
      {LANGS.map((l) => {
        const has = prompt.langs.includes(l);
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            onClick={() => onLang(l)}
            title={has ? languageName(l) : t('{lang}: no version yet', { lang: languageName(l) })}
            className={cn(
              'h-6 rounded px-1.5 text-[11px] font-semibold tracking-wide uppercase',
              active ? 'bg-amber-600 text-white' : has ? 'text-stone-700 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800' : 'border border-dashed border-stone-300 text-stone-400 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800',
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Werkbank

function PromptWorkbench({ prompt, lang, onLang, all, onDirty }: { prompt: Prompt; lang: Lang; onLang: (l: Lang) => void; all: Prompt[]; onDirty: (d: boolean) => void }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Prompt>(prompt);
  const [tab, setTab] = useState('0');
  const [inputsJson, setInputsJson] = useState(JSON.stringify(prompt.inputs, null, 2));
  const [inputsError, setInputsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [usages, setUsages] = useState<{ id: string; name: string; type: string }[] | null>(null);
  const [convertErrors, setConvertErrors] = useState<string[] | null>(null);
  const isBlocks = !!draft.blocks;
  /** Die gewünschte Sprachfassung fehlt noch – angezeigt wird eine andere. */
  const isFallback = prompt.lang !== lang;
  // Baustein-Prompts: Nachrichten für die Vorschau im Browser erzeugen (der Server macht es beim Speichern genauso)
  const effective = useMemo(() => {
    if (!draft.blocks) return draft;
    const c = compileBlockPrompt(draft.blocks, draft.type, lang);
    return { ...draft, messages: c.messages, inputs: c.inputs };
  }, [draft, lang]);
  // Baustein-Prompts: Nachrichten erzeugt der Server – verglichen werden nur die Bausteine
  const comparable = (p: Prompt) => (p.blocks ? { name: p.name, type: p.type, description: p.description, blocks: p.blocks } : { ...p, updatedAt: '' });
  const dirty = JSON.stringify(comparable(draft)) !== JSON.stringify(comparable(prompt));
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => {
    if (prompt.type === 'component') api.get<typeof usages>(`/api/prompts/${prompt.id}/usages?lang=${lang}`).then(setUsages);
  }, [prompt.id, prompt.type, lang]);

  const components = all.filter((p) => p.type === 'component');
  const collected = usePromptInputs(draft);
  const ctx = useMemo(
    () => ({ componentNames: components.map((c) => c.name), inputNames: collected.map((i) => i.name), promptType: draft.type }),
    [components, collected, draft.type],
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.prompts });

  const setMessage = (i: number, patch: Partial<PromptMessage>) => setDraft((d) => ({ ...d, messages: d.messages.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const addMessage = () => {
    setDraft((d) => ({ ...d, messages: [...d.messages, { type: 'user', text: '', format: 'aic2' }] }));
    setTab(String(draft.messages.length));
  };
  const removeMessage = async (i: number) => {
    if (!(await confirmDialog(t('Remove message?')))) return;
    setDraft((d) => ({ ...d, messages: d.messages.filter((_, j) => j !== i) }));
    setTab('0');
  };
  const moveMessage = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.messages.length) return;
    setDraft((d) => {
      const m = [...d.messages];
      [m[i], m[j]] = [m[j], m[i]];
      return { ...d, messages: m };
    });
    setTab(String(j));
  };
  const onInputsJson = (v: string) => {
    setInputsJson(v);
    try {
      const parsed = JSON.parse(v || '[]');
      if (!Array.isArray(parsed)) throw new Error(t('Must be a list [...]'));
      setInputsError(null);
      setDraft((d) => ({ ...d, inputs: parsed as PromptInput[] }));
    } catch (e) {
      setInputsError((e as Error).message);
    }
  };
  const addInputTemplate = (kind: 'words' | 'text' | 'context' | 'scene') => {
    // Eingabefelder im Novelcrafter-Format (englische Namen, wie dort üblich)
    const tpl: Record<string, PromptInput> = {
      words: { name: 'Words', description: 'How many words?', required: true, mode: 'single', types: ['dropdown', 'text'], default: [{ type: 'uiDropdown', id: '1' }], settings: { dropdown: { options: ['200', '400', '600'] }, text: { placeholder: 'e.g. 300' } } },
      text: { name: 'Instruction', description: t('Free text input'), mode: 'single', types: ['text'], settings: { text: { placeholder: '' } } },
      context: { name: 'Additional Context', description: t('Additional context'), mode: 'multiple', addToContext: true, displayName: 'Context', types: ['act', 'chapter', 'scene', 'snippet', 'codex', 'fullNovel'] },
      scene: { name: 'Scene', description: t('A scene'), required: true, mode: 'single', types: ['scene'], addToContext: true, settings: { scene: { mode: 'summary' } } },
    };
    const next = [...draft.inputs, tpl[kind]];
    setInputsJson(JSON.stringify(next, null, 2));
    setInputsError(null);
    setDraft((d) => ({ ...d, inputs: next }));
  };

  const save = async () => {
    if (!isBlocks && inputsError) return toast.error(t('Input fields: invalid JSON'));
    setSaving(true);
    try {
      await api.patch(
        `/api/prompts/${prompt.id}`,
        isBlocks
          ? { lang, name: draft.name, type: draft.type, description: draft.description, blocks: draft.blocks }
          : { lang, name: draft.name, type: draft.type, description: draft.description, messages: draft.messages, inputs: draft.inputs },
      );
      await refresh();
      toast.success(isFallback ? t('Saved — created as {lang} version', { lang: languageName(lang) }) : t('Saved'));
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  const convert = async () => {
    const r = convertToBlocks(draft, lang);
    if (!r.ok) return setConvertErrors(r.errors);
    try {
      const p = await api.post<Prompt>('/api/prompts', { type: draft.type, name: t('{name} (blocks)', { name: draft.name }), description: draft.description, blocks: r.spec, lang });
      await refresh();
      onDirty(false);
      toast.success(t('Converted to blocks — the original is kept unchanged.'));
      navigate(`/prompts/${p.id}`);
    } catch (e) {
      toast.error(e);
    }
  };
  // Strg+S auf der ganzen Seite (in den Editoren selbst ist es schon belegt → dort nicht doppelt)
  const saveRef = useRef(save);
  saveRef.current = save;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || e.defaultPrevented) return;
      e.preventDefault();
      if (dirtyRef.current) void saveRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const exportClip = async () => {
    if (dirty) await save();
    const r = await api.get<{ text: string }>(`/api/prompts/${prompt.id}/export?lang=${isFallback ? prompt.lang : lang}`);
    await copyText(r.text);
    toast.success(t('Copied to clipboard — paste it in Novelcrafter under Prompts → Import.'));
  };
  const duplicate = async () => {
    const p = await api.post<Prompt>(`/api/prompts/${prompt.id}/duplicate`);
    refresh();
    onDirty(false);
    navigate(`/prompts/${p.id}`);
  };
  const remove = async () => {
    const used = usages?.length ? `\n\n${t('Warning: used by {names}.', { names: usages.map((u) => u.name).join(', ') })}` : '';
    if (!(await confirmDialog(`${t('Delete “{name}”? All language versions will be deleted.', { name: prompt.name })}${used}`))) return;
    await api.del(`/api/prompts/${prompt.id}`);
    refresh();
    onDirty(false);
    navigate('/prompts');
  };
  const reset = async () => {
    if (!(await confirmDialog(t('Reset the {lang} version to the built-in version? Your own changes to it will be lost.', { lang: languageName(lang) })))) return;
    const p = await api.post<Prompt>(`/api/prompts/${prompt.id}/reset`, { lang });
    await refresh();
    setDraft(p);
    setInputsJson(JSON.stringify(p.inputs, null, 2));
  };
  /** Fehlende Fassung als Kopie der angezeigten anlegen (Platzhalter heißen dann wie in der Zielsprache). */
  const copyVariant = async () => {
    try {
      await api.post<Prompt>(`/api/prompts/${prompt.id}/texts/${lang}`, { from: prompt.lang });
      await refresh();
      onDirty(false);
      toast.success(t('Created {lang} version', { lang: languageName(lang) }));
    } catch (e) {
      toast.error(e);
    }
  };
  const builtinVariant = async () => {
    try {
      await api.post<Prompt>(`/api/prompts/${prompt.id}/reset`, { lang });
      await refresh();
      onDirty(false);
    } catch (e) {
      toast.error(e);
    }
  };
  const removeVariant = async () => {
    if (!(await confirmDialog(t('Delete the {lang} version? Another version will then be used for this language.', { lang: languageName(lang) })))) return;
    try {
      await api.del(`/api/prompts/${prompt.id}/texts/${lang}`);
      await refresh();
      onDirty(false);
    } catch (e) {
      toast.error(e);
    }
  };

  const idx = Number(tab);
  const msg = draft.messages[idx];

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-4 py-2 dark:border-stone-800">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 w-72 font-medium" />
          <Select
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value;
              setDraft((d) => ({ ...d, type, blocks: d.blocks ? retypeSpec(d.blocks, d.type, type) : null }));
            }}
            className="w-44"
          >
            {PROMPT_TYPES.filter((pt) => !isBlocks || (BLOCK_PROMPT_TYPES as string[]).includes(pt.value)).map((pt) => (
              <option key={pt.value} value={pt.value}>
                {t(pt.label)}
              </option>
            ))}
            {!PROMPT_TYPES.some((pt) => pt.value === draft.type) && <option value={draft.type}>{draft.type}</option>}
          </Select>
          <LangBar prompt={prompt} lang={lang} onLang={onLang} />
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="primary" disabled={!dirty} loading={saving} icon={<Save className="size-3.5" />} onClick={save} title={t('Ctrl+S')}>
              {t('Save')}
            </Button>
            <Button size="sm" variant="ghost" icon={<ClipboardCopy className="size-3.5" />} onClick={exportClip} title={t('Export as Novelcrafter clipboard')}>
              {t('Export')}
            </Button>
            <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={duplicate}>
              {t('Duplicate')}
            </Button>
            {prompt.builtinKey && !isFallback && (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={reset} title={t('Reset this language version to the built-in one')}>
                {t('Default')}
              </Button>
            )}
            {!isFallback && prompt.langs.length > 1 && (
              <Button size="sm" variant="ghost" icon={<Languages className="size-3.5" />} onClick={removeVariant} title={t('Delete only the {lang} version', { lang: languageName(lang) })}>
                {t('Delete version')}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={remove} title={t('Delete prompt (all languages)')} />
          </div>
        </div>
        {isFallback && (
          <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-stone-800 dark:bg-amber-950/30 dark:text-amber-200">
            <span className="min-w-60 flex-1">
              {tr('No <b>{target}</b> version yet — the {source} version is shown (and used for generating). Saving creates the {target} version.', {
                target: languageName(lang),
                source: languageName(prompt.lang),
              })}
            </span>
            <Button size="xs" icon={<Copy className="size-3.5" />} onClick={copyVariant} title={t('Placeholders are renamed into the target language')}>
              {t('Create version from {source}', { source: languageName(prompt.lang) })}
            </Button>
            {prompt.builtinKey && (
              <Button size="xs" icon={<RotateCcw className="size-3.5" />} onClick={builtinVariant}>
                {t('Use built-in version')}
              </Button>
            )}
          </div>
        )}
        <div className="border-b border-stone-200 px-4 py-2 dark:border-stone-800">
          <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t('Description (optional)')} className="h-7 border-transparent bg-transparent text-[13px]" />
          {usages && (
            <div className="mt-1 text-xs text-stone-500">
              {usages.length ? (
                <>
                  {t('Used by:')}{' '}
                  {usages.map((u, i) => (
                    <button key={u.id} type="button" className="text-amber-700 hover:underline dark:text-amber-400" onClick={() => navigate(`/prompts/${u.id}`)}>
                      {u.name}
                      {i < usages.length - 1 ? ', ' : ''}
                    </button>
                  ))}
                </>
              ) : (
                t('Not included by any prompt.')
              )}
            </div>
          )}
        </div>
        {isBlocks ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BlockPromptEditor key={lang} type={draft.type} spec={draft.blocks!} lang={lang} onChange={(blocks) => setDraft((d) => ({ ...d, blocks }))} onSave={save} />
          </div>
        ) : (
          <>
            {draft.type !== 'component' && (
              <div className="flex items-center gap-3 border-b border-stone-200 bg-violet-50/60 px-4 py-2 text-xs text-violet-950 dark:border-stone-800 dark:bg-violet-950/30 dark:text-violet-200">
                <span className="flex-1">
                  {prompt.origin === 'imported'
                    ? tr('Script prompt (imported from Novelcrafter): messages with expressions like <code>{example}</code>. It’s easier to build your own prompts from blocks.', {
                        example: '{storySoFar}',
                      })
                    : tr('Script prompt: messages with expressions like <code>{example}</code>. It’s easier to build your own prompts from blocks.', { example: '{storySoFar}' })}
                </span>
                <Button size="xs" icon={<Blocks className="size-3.5" />} onClick={convert} title={t('Creates a copy as a block prompt')}>
                  {t('Convert to blocks')}
                </Button>
              </div>
            )}
            <div className="flex items-end gap-2 px-4">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  ...draft.messages.map((m, i) => ({ value: String(i), label: <span className="capitalize">{`${i + 1}. ${m.type}`}</span> })),
                  { value: 'inputs', label: t('Input fields ({n})', { n: draft.inputs.length }) },
                ]}
                className="flex-1"
              />
              <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={addMessage} className="mb-1">
                {t('Message')}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {tab === 'inputs' ? (
                <div className="flex h-full flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    {t('Insert template:')}
                    <Button size="xs" onClick={() => addInputTemplate('words')}>
                      {t('Words (dropdown)')}
                    </Button>
                    <Button size="xs" onClick={() => addInputTemplate('text')}>
                      {t('Free text')}
                    </Button>
                    <Button size="xs" onClick={() => addInputTemplate('scene')}>
                      {t('Scene')}
                    </Button>
                    <Button size="xs" onClick={() => addInputTemplate('context')}>
                      {t('Context picker')}
                    </Button>
                  </div>
                  <p className="text-xs text-stone-500">
                    {t('As JSON (the same format as when importing from Novelcrafter). Inputs from included components are added automatically ({list}).', {
                      list:
                        collected
                          .filter((c) => c.source)
                          .map((c) => `${c.name} ← ${c.source}`)
                          .join(', ') || t('none'),
                    })}
                  </p>
                  <Textarea value={inputsJson} onChange={(e) => onInputsJson(e.target.value)} className="min-h-0 flex-1 font-mono text-xs" spellCheck={false} />
                  {inputsError && <div className="text-xs text-red-600">{t('JSON error: {error}', { error: inputsError })}</div>}
                </div>
              ) : msg ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center gap-2 px-4 py-1.5">
                    <Select value={msg.type} onChange={(e) => setMessage(idx, { type: e.target.value as MessageRole })} className="h-7 w-36 text-[13px]">
                      <option value="system">System</option>
                      <option value="user">User</option>
                      <option value="assistant">{t('Assistant (AI)')}</option>
                    </Select>
                    <Button size="xs" variant="ghost" disabled={idx === 0} onClick={() => moveMessage(idx, -1)}>
                      ←
                    </Button>
                    <Button size="xs" variant="ghost" disabled={idx === draft.messages.length - 1} onClick={() => moveMessage(idx, 1)}>
                      →
                    </Button>
                    <span className="text-xs text-stone-400">{t('Ctrl+Space: functions · {comment} comment', { comment: '{! … !}' })}</span>
                    <Button size="xs" variant="ghost" className="ml-auto" icon={<X className="size-3.5" />} onClick={() => removeMessage(idx)} disabled={draft.messages.length <= 1}>
                      {t('Remove')}
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto border-t border-stone-200 dark:border-stone-800">
                    <CodeEditor key={`${prompt.id}-${lang}-${idx}`} value={msg.text} onChange={(text) => setMessage(idx, { text })} context={ctx} onSave={save} />
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
      <PreviewPane draft={effective} lang={isFallback ? prompt.lang : lang} />
      {convertErrors && (
        <Modal open onClose={() => setConvertErrors(null)} title={t('Can’t be fully converted')} width="max-w-xl" footer={<Button onClick={() => setConvertErrors(null)}>{t('Close')}</Button>}>
          <p className="mb-2 text-sm">{t('These parts of the prompt don’t have a matching block (yet). The prompt stays a script prompt and keeps working as before.')}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-300">
            {convertErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Live-Vorschau

function PreviewPane({ draft, lang }: { draft: Prompt; lang: Lang }) {
  const { data: novels } = useNovels();
  const [novelId, setNovelId] = useState(() => localStorage.getItem('nm-preview-novel') ?? '');
  const effectiveNovel = novels?.find((n) => n.id === novelId)?.id ?? novels?.[0]?.id ?? '';
  const { data: outline } = useOutline(effectiveNovel || undefined);
  const scenes = useMemo(() => sceneOptions(outline), [outline]);
  const [sceneId, setSceneId] = useState('');
  const effectiveScene = scenes.find((s) => s.id === sceneId)?.id ?? scenes[scenes.length - 1]?.id ?? '';
  const [message, setMessage] = useState(() => t('Sample beat: The characters meet at the café.'));
  const [selection, setSelection] = useState('');
  const [inputs, setInputs] = useState<InputValues>({});
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const collected = usePromptInputs(draft);
  useEffect(() => {
    if (novelId) localStorage.setItem('nm-preview-novel', novelId);
  }, [novelId]);

  useEffect(() => {
    if (!effectiveNovel) return;
    const h = setTimeout(async () => {
      const isChat = draft.type === 'workshop-chat';
      try {
        const r = await api.post<PreviewResult>('/api/preview', {
          kind: isChat ? 'chat' : 'preview',
          prompt: { type: draft.type, name: draft.name, messages: draft.messages, inputs: draft.inputs },
          // eingebundene Komponenten in der Sprache dieser Fassung
          lang,
          novelId: effectiveNovel,
          sceneId: isChat ? null : effectiveScene || null,
          message,
          selection,
          inputs,
          chatHistory: isChat ? [] : undefined,
        });
        setResult(r);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    }, 500);
    return () => clearTimeout(h);
  }, [draft, lang, effectiveNovel, effectiveScene, message, selection, inputs]);

  return (
    <aside className="flex w-[440px] shrink-0 flex-col border-l border-stone-200 bg-white/60 dark:border-stone-800 dark:bg-stone-900/40">
      <div className="space-y-2 border-b border-stone-200 p-3 dark:border-stone-800">
        <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t('Live preview')}</div>
        {!novels?.length ? (
          <div className="text-sm text-stone-500">{t('Create a novel to see the preview.')}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Select value={effectiveNovel} onChange={(e) => (setNovelId(e.target.value), setSceneId(''))} className="h-7 text-[13px]">
                {novels.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </Select>
              <Select value={effectiveScene} onChange={(e) => setSceneId(e.target.value)} className="h-7 text-[13px]" disabled={draft.type === 'workshop-chat'}>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <Field label={draft.type === 'workshop-chat' ? t('Chat message ({expr})', { expr: '{message}' }) : t('Beat / instruction ({expr})', { expr: '{message}' })}>
              <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className="text-[13px]" />
            </Field>
            {draft.type === 'text-replacement' && (
              <Field label={t('Selected text ({expr})', { expr: '{selection}' })}>
                <Textarea rows={2} value={selection} onChange={(e) => setSelection(e.target.value)} className="text-[13px]" />
              </Field>
            )}
            {collected.length > 0 && <InputsForm inputs={collected} values={inputs} onChange={setInputs} novelId={effectiveNovel} />}
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && <div className="text-sm text-red-600">{error}</div>}
        {result && <PreviewContent data={result} />}
      </div>
    </aside>
  );
}
