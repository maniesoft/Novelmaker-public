// Provider, Modellsammlungen, Generierungs-Log.
import {
  decodeClipboard,
  encodeClipboard,
  parseNcModels,
  type CollectionModel,
  type GenerationLog,
  type ModelCollection,
  type Provider,
  type ProviderModel,
  type RenderedMessage,
  t,
} from '@novelmaker/shared';
import { HttpError, newId, notFound, now, parseJson, updateRow, type DB } from '../db';
import { fetchModels } from '../llm/client';

type Row = Record<string, any>;

const rowToProvider = (r: Row): Provider => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  baseUrl: r.base_url,
  apiKey: r.api_key,
  models: parseJson(r.models, []),
  modelsFetchedAt: r.models_fetched_at ?? null,
  createdAt: r.created_at,
});

export function listProviders(db: DB): Provider[] {
  return (db.prepare('SELECT * FROM providers ORDER BY created_at').all() as Row[]).map(rowToProvider);
}

export function getProvider(db: DB, id: string): Provider {
  const r = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
  if (!r) notFound(t('Provider not found'));
  return rowToProvider(r as Row);
}

export function createProvider(db: DB, data: Partial<Provider>): Provider {
  const id = newId();
  db.prepare('INSERT INTO providers (id, name, kind, base_url, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    data.name?.trim() || t('Provider'),
    data.kind ?? 'custom',
    (data.baseUrl ?? '').trim().replace(/\/+$/, ''),
    data.apiKey ?? '',
    now(),
  );
  return getProvider(db, id);
}

export function updateProvider(db: DB, id: string, patch: Partial<Provider>): Provider {
  if (patch.baseUrl) patch = { ...patch, baseUrl: patch.baseUrl.trim().replace(/\/+$/, '') };
  updateRow(
    db,
    'providers',
    id,
    patch as Record<string, unknown>,
    { name: { col: 'name' }, kind: { col: 'kind' }, baseUrl: { col: 'base_url' }, apiKey: { col: 'api_key' } },
    null,
  );
  return getProvider(db, id);
}

export function deleteProvider(db: DB, id: string) {
  db.prepare('DELETE FROM providers WHERE id = ?').run(id);
}

export async function refreshProviderModels(db: DB, id: string): Promise<Provider> {
  const p = getProvider(db, id);
  const models = await fetchModels(p);
  db.prepare('UPDATE providers SET models = ?, models_fetched_at = ? WHERE id = ?').run(JSON.stringify(models), now(), id);
  return getProvider(db, id);
}

export function findModel(db: DB, providerId: string, modelId: string): ProviderModel | null {
  try {
    return getProvider(db, providerId).models.find((m) => m.id === modelId) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Sammlungen

const rowToCollection = (r: Row): ModelCollection => ({ id: r.id, name: r.name, models: parseJson(r.models, []), sortOrder: r.sort_order });

export function listCollections(db: DB): ModelCollection[] {
  return (db.prepare('SELECT * FROM model_collections ORDER BY sort_order, name').all() as Row[]).map(rowToCollection);
}

export function getCollection(db: DB, id: string): ModelCollection {
  const r = db.prepare('SELECT * FROM model_collections WHERE id = ?').get(id);
  if (!r) notFound(t('Model collection not found'));
  return rowToCollection(r as Row);
}

export function createCollection(db: DB, data: { name?: string; models?: CollectionModel[] }): ModelCollection {
  const id = newId();
  const order = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM model_collections').get() as Row).n;
  db.prepare('INSERT INTO model_collections (id, name, models, sort_order) VALUES (?, ?, ?, ?)').run(id, data.name?.trim() || t('New collection'), JSON.stringify(data.models ?? []), order);
  return getCollection(db, id);
}

export function updateCollection(db: DB, id: string, patch: Partial<ModelCollection>): ModelCollection {
  updateRow(db, 'model_collections', id, patch as Record<string, unknown>, { name: { col: 'name' }, models: { col: 'models', kind: 'json' }, sortOrder: { col: 'sort_order' } }, null);
  return getCollection(db, id);
}

export function deleteCollection(db: DB, id: string) {
  db.prepare('DELETE FROM model_collections WHERE id = ?').run(id);
}

/** Standard-Parameter eines Modells aus der ersten Sammlung, die es enthält. */
export function collectionParams(db: DB, providerId: string, modelId: string): Record<string, unknown> {
  for (const c of listCollections(db)) {
    const m = c.models.find((x) => x.providerId === providerId && x.modelId === modelId);
    if (m?.params) return m.params;
  }
  return {};
}

export async function importCollection(db: DB, text: string, providerId?: string): Promise<{ collection: ModelCollection; warnings: string[] }> {
  let data: unknown;
  try {
    data = await decodeClipboard(text);
  } catch {
    throw new HttpError(400, t('The text isn’t a valid Novelcrafter export.'));
  }
  let nc;
  try {
    nc = parseNcModels(data);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const warnings: string[] = [];
  let provider = providerId ? getProvider(db, providerId) : listProviders(db).find((p) => p.kind === 'openrouter');
  if (!provider) {
    provider = createProvider(db, { name: 'OpenRouter', kind: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' });
    warnings.push(t('There was no OpenRouter provider yet, so one was created. Please enter the API key in Settings.'));
  }
  if (!provider.models.length) {
    try {
      provider = await refreshProviderModels(db, provider.id);
    } catch (e) {
      warnings.push(
        t('Couldn’t load the model list from {name} ({error}) — IDs weren’t checked.', { name: provider.name, error: (e as Error).message }),
      );
    }
  }
  const known = new Set(provider.models.map((m) => m.id));
  const models: CollectionModel[] = nc.models.map((m) => {
    if (known.size && !known.has(m.id)) warnings.push(t('Model “{model}” is unknown to {name} (or no longer available).', { model: m.id, name: provider!.name }));
    const info = provider!.models.find((x) => x.id === m.id);
    return { providerId: provider!.id, modelId: m.id, name: m.name?.trim() || info?.name || m.id };
  });
  const collection = createCollection(db, { name: nc.name, models });
  return { collection, warnings };
}

export async function exportCollection(db: DB, id: string): Promise<{ text: string; skipped: number }> {
  const c = getCollection(db, id);
  const providers = new Map(listProviders(db).map((p) => [p.id, p]));
  const models = c.models.filter((m) => providers.get(m.providerId)?.kind === 'openrouter');
  const text = await encodeClipboard({ $schema: 'nc:models:1', name: c.name, models: models.map((m) => ({ id: m.modelId, name: m.name === m.modelId ? '' : m.name })) });
  return { text, skipped: c.models.length - models.length };
}

// ---------------------------------------------------------------- Log

const rowToLog = (r: Row): GenerationLog => ({
  id: r.id,
  createdAt: r.created_at,
  novelId: r.novel_id ?? null,
  promptId: r.prompt_id ?? null,
  promptName: r.prompt_name,
  kind: r.kind,
  providerId: r.provider_id ?? null,
  modelId: r.model_id,
  messages: parseJson(r.messages, []),
  params: parseJson(r.params, {}),
  response: r.response,
  promptTokens: r.prompt_tokens,
  completionTokens: r.completion_tokens,
  cost: r.cost,
  durationMs: r.duration_ms,
  status: r.status,
  error: r.error,
});

export function createLog(
  db: DB,
  data: { novelId: string | null; promptId: string | null; promptName: string; kind: string; providerId: string; modelId: string; messages: RenderedMessage[]; params: Record<string, unknown> },
): string {
  const id = newId();
  db.prepare(
    `INSERT INTO generation_logs (id, created_at, novel_id, prompt_id, prompt_name, kind, provider_id, model_id, messages, params, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`,
  ).run(id, now(), data.novelId, data.promptId, data.promptName, data.kind, data.providerId, data.modelId, JSON.stringify(data.messages), JSON.stringify(data.params));
  return id;
}

export function finishLog(
  db: DB,
  id: string,
  data: { response: string; promptTokens: number | null; completionTokens: number | null; cost: number | null; durationMs: number; status: string; error?: string | null },
) {
  db.prepare(
    'UPDATE generation_logs SET response = ?, prompt_tokens = ?, completion_tokens = ?, cost = ?, duration_ms = ?, status = ?, error = ? WHERE id = ?',
  ).run(data.response, data.promptTokens, data.completionTokens, data.cost, data.durationMs, data.status, data.error ?? null, id);
  // Log auf 2000 Einträge begrenzen
  db.prepare('DELETE FROM generation_logs WHERE id NOT IN (SELECT id FROM generation_logs ORDER BY created_at DESC LIMIT 2000)').run();
}

export function listLogs(db: DB, limit = 100, novelId?: string): GenerationLog[] {
  const rows = novelId
    ? db.prepare('SELECT * FROM generation_logs WHERE novel_id = ? ORDER BY created_at DESC LIMIT ?').all(novelId, limit)
    : db.prepare('SELECT * FROM generation_logs ORDER BY created_at DESC LIMIT ?').all(limit);
  return (rows as Row[]).map(rowToLog);
}

export function getLog(db: DB, id: string): GenerationLog {
  const r = db.prepare('SELECT * FROM generation_logs WHERE id = ?').get(id);
  if (!r) notFound(t('Log entry not found'));
  return rowToLog(r as Row);
}

export function logStats(db: DB): { count: number; cost: number; tokens: number } {
  const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(cost), 0) AS c, COALESCE(SUM(prompt_tokens), 0) + COALESCE(SUM(completion_tokens), 0) AS t FROM generation_logs').get() as Row;
  return { count: r.n, cost: r.c, tokens: r.t };
}
