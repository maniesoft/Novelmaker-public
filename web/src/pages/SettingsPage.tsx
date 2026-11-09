import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ClipboardCopy, Download, FileInput, FolderCog, FolderOpen, Plus, RefreshCw, Save, Search, Star, Trash2, X } from 'lucide-react';
import { formatCost, formatTokens, PROVIDER_TEMPLATES, type AppSettings, type CollectionModel, type GenerationLog, type ModelCollection, type ProviderKind } from '@novelmaker/shared';
import { api, copyText, download } from '../lib/api';
import { keys, patchSettings, queryClient, useCollections, useLogs, useProviders, useSettings, useSystem, type ProviderInfo, type SystemInfo } from '../lib/queries';
import { toast, useUi } from '../lib/store';
import { Badge, Button, Checkbox, cn, confirmDialog, Empty, Field, formatDate, Input, Modal, Select, Spinner, Tabs, Textarea } from '../components/ui';
import { WarningsList } from '../components/ai';
import { backupNow } from '../components/DataMenu';
import { languageName, LANGUAGES, t, tn, tr, useLang, type Lang } from '../lib/i18n';
import { TranslatePage } from './TranslatePage';

type Tab = 'providers' | 'collections' | 'general' | 'logs' | 'data';
// „translate“ (Übersetzungstabelle) hat keinen eigenen Reiter – erreichbar über Allgemein → Sprache.

export function SettingsPage() {
  const { tab: rawTab = 'providers' } = useParams();
  const tab = rawTab === 'backup' ? 'data' : rawTab;
  const navigate = useNavigate();
  return (
    <div className="h-full overflow-y-auto">
      <div className={cn('mx-auto px-6 py-6', tab === 'translate' ? 'max-w-7xl' : 'max-w-5xl')}>
        <h1 className="mb-4 text-xl font-semibold">{t('Settings')}</h1>
        <Tabs
          value={tab as Tab}
          onChange={(v) => navigate(`/settings/${v}`)}
          className="mb-5"
          tabs={[
            { value: 'providers', label: t('AI providers') },
            { value: 'collections', label: t('Model collections') },
            { value: 'general', label: t('General') },
            { value: 'logs', label: t('Log') },
            { value: 'data', label: t('Data & backup') },
          ]}
        />
        {tab === 'providers' && <Providers />}
        {tab === 'collections' && <Collections />}
        {tab === 'general' && <General />}
        {tab === 'logs' && <Logs />}
        {tab === 'data' && <DataSettings />}
        {tab === 'translate' && <TranslatePage />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Provider

function Providers() {
  const { data: providers, isLoading } = useProviders();
  const add = async (kind: ProviderKind) => {
    const tpl = PROVIDER_TEMPLATES.find((x) => x.kind === kind)!;
    await api.post('/api/providers', { kind, name: t(tpl.name), baseUrl: tpl.baseUrl });
    queryClient.invalidateQueries({ queryKey: keys.providers });
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {tr(
          'Any provider with an OpenAI-compatible API (<code>/v1/chat/completions</code>). Local servers such as Ollama or LM Studio don’t need an API key. The model list is loaded via <code>/models</code> — for OpenRouter including prices and context length.',
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {PROVIDER_TEMPLATES.map((tpl) => (
          <Button key={tpl.kind} size="sm" icon={<Plus className="size-3.5" />} onClick={() => add(tpl.kind)}>
            {t(tpl.name)}
          </Button>
        ))}
      </div>
      {isLoading && <Spinner />}
      {providers?.map((p) => <ProviderCard key={p.id} p={p} />)}
      {!isLoading && !providers?.length && <Empty title={t('No provider yet')}>{t('Add OpenRouter or a local server above, for example.')}</Empty>}
    </div>
  );
}

function ProviderCard({ p }: { p: ProviderInfo }) {
  const [name, setName] = useState(p.name);
  const [baseUrl, setBaseUrl] = useState(p.baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const dirty = name !== p.name || baseUrl !== p.baseUrl || apiKey !== '';
  const save = async () => {
    await api.patch(`/api/providers/${p.id}`, { name, baseUrl, ...(apiKey ? { apiKey } : {}) });
    setApiKey('');
    queryClient.invalidateQueries({ queryKey: keys.providers });
    toast.success(t('Saved'));
  };
  const refresh = async () => {
    setBusy(true);
    try {
      if (dirty) await save();
      const r = await api.post<ProviderInfo>(`/api/providers/${p.id}/refresh`);
      queryClient.invalidateQueries({ queryKey: keys.providers });
      toast.success(tn(r.models.length, 'Loaded {n} model', 'Loaded {n} models'));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirmDialog(t('Delete provider “{name}”?', { name: p.name })))) return;
    await api.del(`/api/providers/${p.id}`);
    queryClient.invalidateQueries({ queryKey: keys.providers });
  };
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-3 flex items-center gap-2">
        <Badge tone="amber">{p.kind}</Badge>
        <span className="text-xs text-stone-500">
          {p.modelsFetchedAt
            ? tn(p.models.length, '{n} model · loaded {date}', '{n} models · loaded {date}', { date: formatDate(p.modelsFetchedAt) })
            : tn(p.models.length, '{n} model', '{n} models')}
        </span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={busy} onClick={refresh}>
            {t('Load / test models')}
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={remove} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('Name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('Base URL')}>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </Field>
        <Field label={t('API key')} hint={p.hasKey ? t('saved ({key})', { key: p.apiKey ?? '' }) : t('not set')}>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={p.hasKey ? t('enter a new key to replace it') : 'sk-…'} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {dirty && (
          <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} onClick={save}>
            {t('Save')}
          </Button>
        )}
        {p.models.length > 0 && (
          <button type="button" className="text-xs text-stone-500 hover:underline" onClick={() => setShowModels((s) => !s)}>
            {showModels ? t('Hide model list') : t('Show model list')}
          </button>
        )}
      </div>
      {showModels && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-stone-200 text-xs dark:border-stone-800">
          {p.models.map((m) => (
            <div key={m.id} className="flex gap-2 border-b border-stone-100 px-2 py-1 last:border-0 dark:border-stone-800">
              <span className="flex-1 truncate font-mono">{m.id}</span>
              {m.contextLength && <span className="text-stone-500">{formatTokens(m.contextLength)} ctx</span>}
              {m.pricing && <span className="text-stone-500">{(m.pricing.prompt * 1e6).toFixed(2)} / {(m.pricing.completion * 1e6).toFixed(2)} $/M</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Modellsammlungen

function Collections() {
  const { data: collections, isLoading } = useCollections();
  const { data: settings } = useSettings();
  const [selected, setSelected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    if (!selected && collections?.length) setSelected(collections[0].id);
  }, [collections, selected]);
  const create = async () => {
    const c = await api.post<ModelCollection>('/api/collections', { name: t('New collection') });
    queryClient.invalidateQueries({ queryKey: keys.collections });
    setSelected(c.id);
  };
  const current = collections?.find((c) => c.id === selected);
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {tr(
          'Favorites lists, so the model picker doesn’t show 300+ models. Import and export in Novelcrafter format (<code>nc:models:1</code>). Default parameters can be set per model.',
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {collections?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelected(c.id)}
            className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm', c.id === selected ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40' : 'border-stone-300 dark:border-stone-700')}
          >
            {settings?.defaultCollectionId === c.id && <Star className="size-3 fill-amber-500 text-amber-500" />}
            {c.name} <span className="text-stone-400">{c.models.length}</span>
          </button>
        ))}
        <Button size="sm" icon={<Plus className="size-3.5" />} onClick={create}>
          {t('New collection')}
        </Button>
        <Button size="sm" icon={<FileInput className="size-3.5" />} onClick={() => setImporting(true)}>
          {t('Import from Novelcrafter')}
        </Button>
      </div>
      {isLoading && <Spinner />}
      {current && <CollectionEditor key={current.id} c={current} isDefault={settings?.defaultCollectionId === current.id} />}
      {importing && <ImportCollectionModal onClose={() => setImporting(false)} onDone={(id) => setSelected(id)} />}
    </div>
  );
}

function CollectionEditor({ c, isDefault }: { c: ModelCollection; isDefault: boolean }) {
  const { data: providers } = useProviders();
  const [name, setName] = useState(c.name);
  const [models, setModels] = useState<CollectionModel[]>(c.models);
  const [paramsText, setParamsText] = useState<string[]>(c.models.map((m) => (m.params ? JSON.stringify(m.params) : '')));
  const [q, setQ] = useState('');
  const dirty = name !== c.name || JSON.stringify(models) !== JSON.stringify(c.models);
  const all = useMemo(() => (providers ?? []).flatMap((p) => p.models.map((m) => ({ ...m, providerId: p.id, provider: p.name }))), [providers]);
  const found = q.trim() ? all.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()) || (m.name ?? '').toLowerCase().includes(q.toLowerCase())).slice(0, 30) : [];
  const providerName = (id: string) => providers?.find((p) => p.id === id)?.name ?? '?';
  const known = (m: CollectionModel) => !providers || providers.find((p) => p.id === m.providerId)?.models.some((x) => x.id === m.modelId) !== false;

  const save = async () => {
    for (const [i, txt] of paramsText.entries()) {
      if (!txt.trim()) continue;
      try {
        JSON.parse(txt);
      } catch {
        return toast.error(t('Parameters for “{name}” aren’t valid JSON.', { name: models[i]?.name ?? '' }));
      }
    }
    const next = models.map((m, i) => ({ ...m, params: paramsText[i]?.trim() ? JSON.parse(paramsText[i]) : undefined }));
    await api.patch(`/api/collections/${c.id}`, { name, models: next });
    queryClient.invalidateQueries({ queryKey: keys.collections });
    toast.success(t('Saved'));
  };
  const add = (m: { providerId: string; id: string; name?: string }) => {
    setModels((x) => [...x, { providerId: m.providerId, modelId: m.id, name: m.name ?? m.id }]);
    setParamsText((x) => [...x, '']);
    setQ('');
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= models.length) return;
    const swap = <T,>(arr: T[]) => {
      const a = [...arr];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    };
    setModels(swap);
    setParamsText(swap);
  };
  const remove = (i: number) => {
    setModels((x) => x.filter((_, j) => j !== i));
    setParamsText((x) => x.filter((_, j) => j !== i));
  };
  const exportClip = async () => {
    const r = await api.get<{ text: string; skipped: number }>(`/api/collections/${c.id}/export`);
    await copyText(r.text);
    toast.success(
      r.skipped
        ? tn(r.skipped, 'Copied ({n} local model skipped) — import it in Novelcrafter.', 'Copied ({n} local models skipped) — import it in Novelcrafter.')
        : t('Copied — import it in Novelcrafter.'),
    );
  };
  const del = async () => {
    if (!(await confirmDialog(t('Delete collection “{name}”?', { name: c.name })))) return;
    await api.del(`/api/collections/${c.id}`);
    queryClient.invalidateQueries({ queryKey: keys.collections });
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="w-64 font-medium" />
        <Button size="sm" variant="primary" disabled={!dirty} icon={<Save className="size-3.5" />} onClick={save}>
          {t('Save')}
        </Button>
        <Button size="sm" variant="ghost" icon={<Star className={cn('size-3.5', isDefault && 'fill-amber-500 text-amber-500')} />} onClick={() => patchSettings({ defaultCollectionId: c.id })}>
          {isDefault ? t('Default') : t('Set as default')}
        </Button>
        <Button size="sm" variant="ghost" icon={<ClipboardCopy className="size-3.5" />} onClick={exportClip}>
          {t('Export')}
        </Button>
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={del} className="ml-auto" />
      </div>
      <div className="space-y-1.5">
        {models.map((m, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-stone-200 p-2 dark:border-stone-800">
            <div className="flex flex-col">
              <button type="button" className="text-stone-400 hover:text-stone-700" onClick={() => move(i, -1)}>
                <ArrowUp className="size-3" />
              </button>
              <button type="button" className="text-stone-400 hover:text-stone-700" onClick={() => move(i, 1)}>
                <ArrowDown className="size-3" />
              </button>
            </div>
            <div className="w-56 min-w-0">
              <Input value={m.name} onChange={(e) => setModels((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} className="h-7 text-[13px]" />
              <div className="mt-0.5 truncate font-mono text-[11px] text-stone-500" title={m.modelId}>
                {providerName(m.providerId)} · {m.modelId} {!known(m) && <span className="text-amber-600">({t('unknown')})</span>}
              </div>
            </div>
            <Input
              value={paramsText[i] ?? ''}
              onChange={(e) => setParamsText((x) => x.map((y, j) => (j === i ? e.target.value : y)))}
              placeholder={t('Parameters, e.g. {example}', { example: '{"temperature": 0.8, "max_tokens": 4000}' })}
              className="h-7 flex-1 font-mono text-xs"
            />
            <button type="button" className="text-stone-400 hover:text-red-600" onClick={() => remove(i)}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="relative mt-3">
        <Search className="absolute top-2.5 left-2.5 size-3.5 text-stone-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Add model — search all loaded model lists…')} className="pl-7" />
        {found.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900">
            {found.map((m) => (
              <button key={m.providerId + m.id} type="button" onClick={() => add(m)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800">
                {m.name ?? m.id} <span className="text-xs text-stone-500">· {m.provider} · {m.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!all.length && <p className="mt-2 text-xs text-stone-500">{t('Tip: load the model list under “AI providers” first.')}</p>}
    </div>
  );
}

function ImportCollectionModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { data: providers } = useProviders();
  const [text, setText] = useState('');
  const [providerId, setProviderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ collection: ModelCollection; warnings: string[] }>('/api/collections/import', { text, providerId: providerId || undefined });
      queryClient.invalidateQueries({ queryKey: keys.collections });
      queryClient.invalidateQueries({ queryKey: keys.providers });
      onDone(r.collection.id);
      if (r.warnings.length) setWarnings(r.warnings);
      else {
        toast.success(t('Imported “{name}”', { name: r.collection.name }));
        onClose();
      }
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
      title={t('Import model collection')}
      width="max-w-2xl"
      footer={
        warnings ? (
          <Button onClick={onClose}>{t('Close')}</Button>
        ) : (
          <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={run}>
            {t('Import')}
          </Button>
        )
      }
    >
      {warnings ? (
        <>
          <p className="mb-2 text-sm">{t('Imported — with notes (unknown IDs are kept):')}</p>
          <WarningsList warnings={warnings.map((m) => ({ level: 'warning', message: m }))} />
        </>
      ) : (
        <div className="space-y-3">
          <Field label={t('Assign to provider')} hint={t('The IDs from Novelcrafter are OpenRouter IDs.')}>
            <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="">{t('OpenRouter (automatic)')}</option>
              {providers?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Textarea autoFocus rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Clipboard from Novelcrafter (H4sI…)')} className="font-mono text-xs" />
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Allgemein

function General() {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const lang = useLang((s) => s.lang);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  if (!settings) return <Spinner />;
  const set = (patch: Partial<AppSettings>) => patchSettings(patch).catch(toast.error);
  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
        <Field
          label={lang === 'en' ? t('Language') : `${t('Language')} · Language`}
          hint={t('Language of the interface and the prompts. Each prompt is stored in a separate version for each language.')}
        >
          <Select
            value={settings.language}
            onChange={(e) => {
              const language = e.target.value as Lang;
              patchSettings({ language }).catch(toast.error);
            }}
            className="max-w-64"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
                {l.value !== lang ? ` (${languageName(l.value)})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <button type="button" className="mt-3 text-xs text-stone-500 underline-offset-2 hover:text-amber-700 hover:underline dark:hover:text-amber-400" onClick={() => navigate('/settings/translate')}>
          {t('Help translate Novelmaker…')}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('Theme')}>
          <Select value={theme} onChange={(e) => setTheme(e.target.value as AppSettings['theme'])}>
            <option value="system">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </Select>
        </Field>
        <Field label={t('Editor font size (px)')}>
          <Input type="number" min={12} max={30} value={settings.editorFontSize} onChange={(e) => set({ editorFontSize: Number(e.target.value) || 18 })} />
        </Field>
        <Field label={t('Text width (px)')}>
          <Input type="number" min={480} max={1400} step={20} value={settings.editorWidth} onChange={(e) => set({ editorWidth: Number(e.target.value) || 720 })} />
        </Field>
      </div>
      <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
        <Checkbox
          checked={settings.deriveMaxTokens}
          onChange={(v) => set({ deriveMaxTokens: v })}
          label={t('Derive max_tokens from the “Words” input')}
          hint={t('Only if the model has no max_tokens of its own in the collection. For reasoning models, choose a generous buffer or set max_tokens per model.')}
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label={t('Factor (tokens per word)')}>
            <Input type="number" step={0.1} min={1} value={settings.maxTokensFactor} onChange={(e) => set({ maxTokensFactor: Number(e.target.value) || 2 })} />
          </Field>
          <Field label={t('Buffer (tokens)')}>
            <Input type="number" step={100} min={0} value={settings.maxTokensBuffer} onChange={(e) => set({ maxTokensBuffer: Number(e.target.value) || 0 })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Protokoll

function Logs() {
  const { data: logs, isLoading } = useLogs();
  const [stats, setStats] = useState<{ count: number; cost: number; tokens: number } | null>(null);
  const [view, setView] = useState<GenerationLog | null>(null);
  useEffect(() => {
    api.get<typeof stats>('/api/logs/stats').then(setStats);
  }, [logs]);
  return (
    <div className="space-y-3">
      {stats && (
        <div className="flex gap-2 text-sm">
          <Badge>{tn(stats.count, '{n} generation', '{n} generations')}</Badge>
          <Badge>{t('{tokens} tokens', { tokens: formatTokens(stats.tokens) })}</Badge>
          <Badge tone="amber">{t('{cost} total', { cost: formatCost(stats.cost) })}</Badge>
        </div>
      )}
      {isLoading && <Spinner />}
      <div className="overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100 text-xs text-stone-500 dark:bg-stone-900">
            <tr>
              <th className="px-3 py-2">{t('Time')}</th>
              <th>{t('Type')}</th>
              <th>{t('Prompt')}</th>
              <th>{t('Model')}</th>
              <th className="text-right">{t('Tokens')}</th>
              <th className="text-right">{t('Cost')}</th>
              <th className="px-3">{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {logs?.map((l) => (
              <tr key={l.id} className="cursor-pointer border-t border-stone-100 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900" onClick={() => api.get<GenerationLog>(`/api/logs/${l.id}`).then(setView)}>
                <td className="px-3 py-1.5 whitespace-nowrap text-stone-500">{formatDate(l.createdAt)}</td>
                <td>{l.kind}</td>
                <td className="max-w-48 truncate">{l.promptName}</td>
                <td className="max-w-48 truncate font-mono text-xs">{l.modelId}</td>
                <td className="text-right tabular-nums">{l.promptTokens != null ? `${formatTokens(l.promptTokens)}→${formatTokens(l.completionTokens ?? 0)}` : '–'}</td>
                <td className="text-right tabular-nums">{formatCost(l.cost)}</td>
                <td className="px-3">
                  <Badge tone={l.status === 'ok' ? 'green' : l.status === 'error' ? 'red' : 'stone'}>{l.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && !logs?.length && <div className="p-6 text-center text-sm text-stone-500">{t('No generations yet.')}</div>}
      </div>
      {view && (
        <Modal open onClose={() => setView(null)} title={`${view.promptName} · ${view.modelId}`} width="max-w-4xl">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>{formatDate(view.createdAt)}</Badge>
              <Badge>{view.durationMs != null ? `${(view.durationMs / 1000).toFixed(1)} s` : '–'}</Badge>
              <Badge tone="amber">{formatCost(view.cost)}</Badge>
              {Object.keys(view.params).length > 0 && <Badge tone="sky">{JSON.stringify(view.params)}</Badge>}
            </div>
            {view.error && <div className="rounded bg-red-50 p-2 text-red-700 dark:bg-red-950/50 dark:text-red-300">{view.error}</div>}
            {view.messages.map((m, i) => (
              <div key={i} className="rounded-lg border border-stone-200 dark:border-stone-800">
                <div className="border-b border-stone-200 px-3 py-1 text-xs dark:border-stone-800">
                  <Badge tone={m.role === 'system' ? 'violet' : m.role === 'assistant' ? 'green' : 'sky'}>{m.role}</Badge>
                </div>
                <pre className="max-h-72 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">{m.content}</pre>
              </div>
            ))}
            <div className="rounded-lg border border-amber-200 dark:border-amber-900">
              <div className="border-b border-amber-200 px-3 py-1 text-xs font-semibold dark:border-amber-900">{t('Response')}</div>
              <pre className="max-h-96 overflow-auto p-3 font-serif text-sm whitespace-pre-wrap">{view.response}</pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Daten & Sicherung

function DataSettings() {
  const { data: info, refetch } = useSystem();
  const { data: settings } = useSettings();
  const [moving, setMoving] = useState(false);
  if (!info || !settings) return <Spinner />;
  const reveal = (path: string) => api.post('/api/system/reveal', { path }).catch(toast.error);
  const browseBackup = async () => {
    try {
      const r = await api.post<{ path: string | null }>('/api/system/browse', { initial: info.backupDir });
      if (!r.path) return;
      await api.post('/api/system/backup-dir', { folder: r.path });
      toast.success(t('Backup folder changed.'));
      void refetch();
    } catch (e) {
      toast.error(e);
    }
  };
  const resetBackup = async () => {
    await api.post('/api/system/backup-dir', { folder: null }).catch(toast.error);
    void refetch();
  };
  const isDefaultDb = info.dbDir.toLowerCase() === info.defaultDbDir.toLowerCase();
  const isDefaultBackup = info.backupDir.toLowerCase() === info.defaultBackupDir.toLowerCase();
  return (
    <div className="max-w-3xl space-y-5 text-sm">
      <section className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="font-semibold">{t('Database location')}</h2>
        <p className="mt-1 text-stone-600 dark:text-stone-400">
          {t(
            'All novels, prompts, and settings are stored in a single file. If you put it in a Dropbox or OneDrive folder, you can work on several computers — just select the folder here once on each computer.',
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-stone-100 px-2 py-1.5 text-xs dark:bg-stone-800" title={info.dbPath}>
            {info.dbPath}
          </code>
          {isDefaultDb && <Badge>{t('Default')}</Badge>}
          <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => reveal(info.dbPath)}>
            {t('Show')}
          </Button>
          <Button size="sm" variant="primary" icon={<FolderCog className="size-3.5" />} onClick={() => setMoving(true)}>
            {t('Change location…')}
          </Button>
        </div>
        <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {tr(
            '<b>Important with Dropbox/OneDrive:</b> only run Novelmaker on <i>one</i> computer at a time. Before switching, quit Novelmaker (Data → Quit Novelmaker) and wait until syncing has finished. To help with this, Novelmaker places a lock file next to the database and warns you if it’s still open on another computer.',
          )}
        </div>
        {info.conflicts.length > 0 && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {tr(
              '<b>Conflicted copies found</b> — they may contain changes from the other computer. To use one of them: quit Novelmaker, rename the file you want to <code>novelmaker.db</code> (copy the current one somewhere else first), and restart.',
            )}
            <ul className="mt-1 list-disc pl-5">
              {info.conflicts.map((c) => (
                <li key={c.file}>
                  {c.file} ({formatDate(c.modified)})
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="font-semibold">{t('Backups')}</h2>
        <p className="mt-1 text-stone-600 dark:text-stone-400">
          {t(
            'Automatically at startup (if anything has changed since the last backup), when quitting Novelmaker, and before deleting a novel or series. Anytime with one click: header → Data → Back up now. Novelmaker saves your text continuously anyway, shortly after every change.',
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-stone-100 px-2 py-1.5 text-xs dark:bg-stone-800" title={info.backupDir}>
            {info.backupDir}
          </code>
          {isDefaultBackup ? (
            <Badge>{t('Default')}</Badge>
          ) : (
            <Button size="sm" variant="ghost" onClick={resetBackup}>
              {t('Default')}
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => reveal(info.backupDir)}>
            {t('Show')}
          </Button>
          {info.platform === 'win32' ? (
            <Button size="sm" icon={<FolderCog className="size-3.5" />} onClick={browseBackup}>
              {t('Choose folder…')}
            </Button>
          ) : (
            <BackupDirInput onDone={() => void refetch()} />
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label={t('Backups to keep')} hint={t('Older ones are deleted — only “novelmaker-…db” files in this folder.')}>
            <Input
              type="number"
              min={1}
              max={500}
              value={settings.backupsToKeep}
              onChange={(e) => patchSettings({ backupsToKeep: Number(e.target.value) || 10 }).catch(toast.error)}
              className="w-32"
            />
          </Field>
          <div className="ml-auto flex gap-2">
            <Button icon={<Save className="size-4" />} onClick={() => backupNow().then(() => refetch())}>
              {t('Back up now')}
            </Button>
            <Button icon={<Download className="size-4" />} onClick={() => download('/api/backup/export.json')}>
              {t('JSON export (everything)')}
            </Button>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-stone-200 dark:border-stone-800">
          {info.backups.map((b) => (
            <div key={b.file} className="flex justify-between gap-2 border-b border-stone-100 px-3 py-1.5 last:border-0 dark:border-stone-800">
              <span className="truncate font-mono text-xs">{b.file}</span>
              <span className="shrink-0 text-xs text-stone-500">
                {formatDate(b.createdAt)} · {(b.size / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
          ))}
          {!info.backups.length && <div className="p-3 text-stone-500">{t('No backups yet.')}</div>}
        </div>
        <p className="mt-2 text-xs text-stone-500">
          {t('To restore: quit Novelmaker, copy the backup you want into the database folder, and rename it to “novelmaker.db”.')}
        </p>
      </section>
      {moving && <MoveDbDialog info={info} onClose={() => setMoving(false)} />}
    </div>
  );
}

function BackupDirInput({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-1">
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={t('/path/to/folder')} className="h-8 w-56" />
      <Button size="sm" disabled={!v.trim()} onClick={() => api.post('/api/system/backup-dir', { folder: v }).then(onDone, toast.error)}>
        {t('Set')}
      </Button>
    </div>
  );
}

interface FolderCheck {
  folder: string;
  file: string;
  exists: boolean;
  isCurrent: boolean;
  modified?: string;
  novels?: number;
  titles?: string[];
  lockWarning?: { host: string; heartbeat: string } | null;
  error?: string;
}

type MoveMode = 'move' | 'use-existing' | 'overwrite';

/** „In diesem Ordner liegt schon eine Datenbank mit 3 Romanen (…), zuletzt geändert …“ */
function existingDbText(check: FolderCheck) {
  const date = check.modified ? formatDate(check.modified) : '';
  if (check.novels == null)
    return date ? t('This folder already contains a database, last modified {date}.', { date }) : t('This folder already contains a database.');
  const vars = {
    count: <b>{tn(check.novels, '{n} novel', '{n} novels')}</b>,
    titles: check.titles?.length ? ` (${check.titles.join(', ')})` : '',
    date,
  };
  return date
    ? tr('This folder already contains a database with {count}{titles}, last modified {date}.', vars)
    : tr('This folder already contains a database with {count}{titles}.', vars);
}

function MoveDbDialog({ info, onClose }: { info: SystemInfo; onClose: () => void }) {
  const [folder, setFolder] = useState('');
  const [check, setCheck] = useState<FolderCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<MoveMode>('use-existing');
  useEffect(() => {
    setCheck(null);
    if (!folder.trim()) return;
    const timer = setTimeout(() => {
      api.post<FolderCheck>('/api/system/check-folder', { folder }).then(
        (c) => {
          setCheck(c);
          setMode(c.exists ? 'use-existing' : 'move');
        },
        () => setCheck(null),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [folder]);
  const browse = async () => {
    try {
      const r = await api.post<{ path: string | null }>('/api/system/browse', { initial: folder || info.dbDir });
      if (r.path) setFolder(r.path);
    } catch (e) {
      toast.error(e);
    }
  };
  const run = async () => {
    if (!check) return;
    if (mode === 'overwrite') {
      const ok = await confirmDialog({
        title: t('Overwrite existing database?'),
        message: tn(
          check.novels ?? 0,
          'The database in {folder} ({n} novel) will be replaced by your current one. It will be copied to the backup folder first.',
          'The database in {folder} ({n} novels) will be replaced by your current one. It will be copied to the backup folder first.',
          { folder: check.folder },
        ),
        confirmLabel: t('Overwrite'),
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ dbPath: string; note: string }>('/api/system/db-location', { folder: check.folder, mode });
      toast.success(t('Database: {path}. {note}', { path: r.dbPath, note: r.note }));
      // alles neu laden – es kann eine ganz andere Datenbank sein
      setTimeout(() => window.location.assign('/settings/data'), 1200);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };
  const radio = (value: MoveMode, label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-2">
      <input type="radio" className="mt-1 accent-amber-700" checked={mode === value} onChange={() => setMode(value)} />
      <span>
        {label}
        <span className="block text-xs text-stone-500">{hint}</span>
      </span>
    </label>
  );
  const canRun = !!check && !check.isCurrent && !(check.error && mode === 'use-existing') && !(check.lockWarning && mode !== 'move');
  const chip = 'rounded-full border border-stone-200 px-2.5 py-0.5 text-xs hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800';
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-2xl"
      title={t('Change database location')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!canRun} onClick={run}>
            {mode === 'move' ? t('Move') : mode === 'use-existing' ? t('Use this database') : t('Overwrite')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <Field label={t('Folder')} hint={t('This is where the novelmaker.db file is stored (or will be created).')}>
          <div className="flex gap-2">
            <Input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder={t('e.g. {path}', { path: 'C:\\Users\\…\\OneDrive\\Novelmaker' })}
              className="flex-1 font-mono text-xs"
              autoFocus
            />
            {info.platform === 'win32' && (
              <Button icon={<FolderOpen className="size-4" />} onClick={browse}>
                {t('Browse…')}
              </Button>
            )}
          </div>
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {info.suggestions.map((s) => (
            <button key={s.path} type="button" onClick={() => setFolder(s.path)} className={chip} title={s.path}>
              {s.label}
            </button>
          ))}
          <button type="button" onClick={() => setFolder(info.defaultDbDir)} className={chip} title={info.defaultDbDir}>
            {t('Default (app folder)')}
          </button>
        </div>
        {check && (
          <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            {check.isCurrent ? (
              <p className="text-stone-500">{t('The database is already here.')}</p>
            ) : check.exists ? (
              <div className="space-y-3">
                <p>{existingDbText(check)}</p>
                {check.error && <p className="text-red-600">{check.error}</p>}
                {check.lockWarning && <p className="text-red-600">{t('It’s currently open on “{host}” — quit Novelmaker there first.', { host: check.lockWarning.host })}</p>}
                {radio('use-existing', t('Use this database'), t('E.g. on your second computer. Your current database is backed up first and stays where it is.'))}
                {radio('overwrite', t('Overwrite with my current database'), t('The existing one will be copied to the backup folder first.'))}
              </div>
            ) : (
              <div className="space-y-2">
                <p>{t('The folder doesn’t contain a database yet.')}</p>
                {radio(
                  'move',
                  t('Move my database there'),
                  t('Novelmaker then continues working with the file there. The old file is renamed to “novelmaker-umgezogen-…db” (not deleted).'),
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
